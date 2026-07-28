import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_INPUTS = [
  path.join(rootDir, 'data', 'kaggle', 'TMDB_movie_dataset_v11.csv'),
  path.join(rootDir, 'data', 'kaggle', 'tmdb_movies.csv'),
  path.join(rootDir, 'data', 'kaggle', 'movies.csv'),
];

const LANGUAGE_LABELS = {
  ar: 'Árabe',
  bn: 'Bengali',
  cn: 'Chinês',
  de: 'Alemão',
  en: 'Inglês',
  es: 'Espanhol',
  fa: 'Persa',
  fr: 'Francês',
  hi: 'Hindi',
  it: 'Italiano',
  ja: 'Japonês',
  ko: 'Coreano',
  ml: 'Malaiala',
  pt: 'Português',
  ru: 'Russo',
  ta: 'Tâmil',
  te: 'Telugo',
  tr: 'Turco',
  zh: 'Chinês',
};

const GENRE_LABELS = {
  Action: 'Ação',
  Adventure: 'Aventura',
  Animation: 'Animação',
  Biography: 'Biografia',
  Comedy: 'Comédia',
  Crime: 'Crime',
  Documentary: 'Documentário',
  Drama: 'Drama',
  Family: 'Família',
  Fantasy: 'Fantasia',
  History: 'História',
  Horror: 'Terror',
  Music: 'Música',
  Musical: 'Musical',
  Mystery: 'Mistério',
  Romance: 'Romance',
  'Science Fiction': 'Ficção científica',
  'Sci-Fi': 'Ficção científica',
  Thriller: 'Suspense',
  War: 'Guerra',
  Western: 'Faroeste',
};

const MOODS_BY_GENRE = {
  Ação: ['intenso', 'energético'],
  Aventura: ['épico', 'heroico'],
  Animação: ['colorido', 'imaginativo'],
  Biografia: ['inspirador', 'realista'],
  Comédia: ['leve', 'divertido'],
  Crime: ['tenso', 'urbano'],
  Documentário: ['informativo', 'realista'],
  Drama: ['emocionante', 'humano'],
  Família: ['familiar', 'sensível'],
  Fantasia: ['mágico', 'imaginativo'],
  História: ['histórico', 'denso'],
  Música: ['inspirador', 'musical'],
  Mistério: ['cerebral', 'inquietante'],
  Romance: ['romântico', 'intimista'],
  'Ficção científica': ['cerebral', 'visual'],
  Suspense: ['tenso', 'inquietante'],
  Terror: ['sombrio', 'assustador'],
  Guerra: ['intenso', 'histórico'],
  Faroeste: ['seco', 'contemplativo'],
};

const inputPath = process.env.KAGGLE_MOVIES_CSV
  ? path.resolve(process.env.KAGGLE_MOVIES_CSV)
  : await firstExistingPath(DEFAULT_INPUTS);
const outputPath = path.resolve(process.env.KAGGLE_OUTPUT_JSON ?? path.join(rootDir, 'data', 'movies.seed.json'));
const existingPath = path.resolve(process.env.KAGGLE_EXISTING_JSON ?? path.join(rootDir, 'data', 'movies.seed.json'));
const importLimit = positiveInteger(process.env.KAGGLE_IMPORT_LIMIT, 500);
const minVotes = positiveInteger(process.env.KAGGLE_MIN_VOTES, 250);
const mergeCurated = process.env.KAGGLE_MERGE_CURATED !== 'false';

if (!inputPath) {
  console.error([
    'CSV do Kaggle não encontrado.',
    '',
    'Baixe o dataset recomendado:',
    '  kaggle datasets download -d asaniczka/tmdb-movies-dataset-2023-930k-movies -p data/kaggle --unzip',
    '',
    'Ou informe o arquivo manualmente:',
    '  KAGGLE_MOVIES_CSV=/caminho/TMDB_movie_dataset_v11.csv npm run import:kaggle',
  ].join('\n'));
  process.exit(1);
}

const existingMovies = mergeCurated ? await readExistingMovies(existingPath) : [];
const importedMovies = await importMoviesFromCsv(inputPath, {
  existingMovies,
  limit: importLimit,
  minVotes,
});
const movies = mergeMovies(existingMovies, importedMovies);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(movies, null, 2)}\n`);

console.log(`Importados ${importedMovies.length} filmes do Kaggle.`);
console.log(`Catálogo final com ${movies.length} filmes em ${path.relative(rootDir, outputPath)}.`);

async function importMoviesFromCsv(filePath, options) {
  const headers = [];
  const selected = [];
  const seen = buildSeenIndex(options.existingMovies);
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let buffered = '';
  let lineNumber = 0;

  for await (const line of lines) {
    buffered = buffered ? `${buffered}\n${line}` : line;
    if (!isCompleteCsvRecord(buffered)) continue;

    const values = parseCsvRecord(buffered);
    buffered = '';
    lineNumber += 1;

    if (lineNumber === 1) {
      headers.push(...values.map((value) => value.trim()));
      continue;
    }

    const row = objectFromRow(headers, values);
    const movie = toMovie(row);
    if (!movie) continue;
    if (isDuplicate(movie, seen)) continue;

    addToSeen(movie, seen);
    selected.push(movie);

    if (selected.length > options.limit * 3) {
      selected.sort(compareImportScore);
      selected.length = options.limit * 2;
    }
  }

  selected.sort(compareImportScore);
  return selected.slice(0, options.limit).sort((a, b) => (
    b.communityScore - a.communityScore || b.year - a.year || a.title.localeCompare(b.title)
  ));
}

function toMovie(row) {
  const title = clean(row.title || row.name || row.original_title);
  const originalTitle = clean(row.original_title || row.originalTitle || title);
  const overview = clean(row.overview || row.Overview || row.synopsis);
  const tmdbId = clean(row.id || row.tmdb_id || row.tmdbId);
  const imdbId = clean(row.imdb_id || row.imdbId);
  const year = extractYear(row.release_date || row.releaseDate || row.year);
  const voteAverage = number(row.vote_average || row.voteAverage || row.vote);
  const voteCount = number(row.vote_count || row.voteCount || row.votes);
  const runtime = number(row.runtime || row.durationMinutes);
  const popularity = number(row.popularity);
  const posterUrl = buildPosterUrl(row.poster_url || row.posterUrl || row.poster_path || row.posterPath);
  const genres = parseGenres(row.genres || row.Genre || row.genre);

  if (!title || !overview || !tmdbId || !year || !posterUrl || !genres.length) return null;
  if (clean(row.status) && clean(row.status).toLowerCase() !== 'released') return null;
  if (String(row.adult ?? '').toLowerCase() === 'true') return null;
  if (voteCount < minVotes) return null;

  return {
    id: `tmdb-${tmdbId}`,
    title,
    originalTitle,
    year,
    genres,
    moods: inferMoods(genres, overview),
    pace: inferPace(runtime, genres),
    language: languageLabel(row.original_language || row.language),
    durationMinutes: runtime || 100,
    director: clean(row.director),
    cast: parseList(row.cast).slice(0, 3),
    posterUrl,
    imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : `https://www.imdb.com/find/?q=${encodeURIComponent(originalTitle)}`,
    rottenTomatoesUrl: `https://www.rottentomatoes.com/search?search=${encodeURIComponent(originalTitle)}`,
    synopsis: overview,
    communityScore: Math.round(Math.max(50, Math.min(98, voteAverage * 10 || popularity || 70))),
    importScore: importScore({ voteAverage, voteCount, popularity, year }),
  };
}

function compareImportScore(a, b) {
  return b.importScore - a.importScore;
}

function importScore({ voteAverage, voteCount, popularity, year }) {
  const recencyBoost = Math.max(0, Math.min(20, year - 2000));
  return (voteAverage * 120) + Math.log10(Math.max(1, voteCount)) * 180 + (popularity * 0.6) + recencyBoost;
}

function parseCsvRecord(record) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    const next = record[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      values.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

function isCompleteCsvRecord(record) {
  let quoted = false;

  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    const next = record[index + 1];
    if (char !== '"') continue;
    if (quoted && next === '"') {
      index += 1;
      continue;
    }
    quoted = !quoted;
  }

  return !quoted;
}

function objectFromRow(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
}

function parseGenres(value) {
  return parseList(value)
    .map((genre) => GENRE_LABELS[genre] ?? genre)
    .filter(Boolean)
    .slice(0, 4);
}

function parseList(value) {
  const cleaned = clean(value);
  if (!cleaned) return [];

  if (cleaned.startsWith('[')) {
    try {
      const parsed = JSON.parse(cleaned.replaceAll("'", '"'));
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item : item.name))
          .map(clean)
          .filter(Boolean);
      }
    } catch {
      return cleaned.replace(/[[\]"']/g, '').split(/[|,]/).map(clean).filter(Boolean);
    }
  }

  return cleaned.split(/[|,]/).map(clean).filter(Boolean);
}

function inferMoods(genres, overview) {
  const moods = new Set();
  for (const genre of genres) {
    for (const mood of MOODS_BY_GENRE[genre] ?? []) moods.add(mood);
  }

  const text = overview.toLowerCase();
  if (text.includes('space') || text.includes('future') || text.includes('alien')) moods.add('visual');
  if (text.includes('love') || text.includes('romance')) moods.add('romântico');
  if (text.includes('murder') || text.includes('killer') || text.includes('crime')) moods.add('tenso');
  if (text.includes('war') || text.includes('battle')) moods.add('intenso');

  return [...moods].slice(0, 3);
}

function inferPace(runtime, genres) {
  if (genres.includes('Ação') || genres.includes('Aventura') || genres.includes('Suspense')) return 'rápido';
  if (runtime >= 145 || genres.includes('Drama')) return 'lento';
  return 'médio';
}

function buildPosterUrl(value) {
  const poster = clean(value);
  if (!poster) return '';
  if (poster.startsWith('http')) return poster;
  return `https://image.tmdb.org/t/p/w500/${poster.replace(/^\/+/, '')}`;
}

function extractYear(value) {
  const match = String(value ?? '').match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function languageLabel(value) {
  const code = clean(value).toLowerCase();
  return LANGUAGE_LABELS[code] ?? (code ? code.toUpperCase() : 'Não informado');
}

function mergeMovies(existingMovies, importedMovies) {
  const seen = buildSeenIndex([]);
  const merged = [];

  for (const movie of [...existingMovies, ...importedMovies]) {
    if (isDuplicate(movie, seen)) continue;
    addToSeen(movie, seen);
    const { importScore: _importScore, ...publicMovie } = movie;
    merged.push(publicMovie);
  }

  return merged;
}

function buildSeenIndex(movies) {
  const seen = {
    ids: new Set(),
    imdbIds: new Set(),
    titleYears: new Set(),
  };

  for (const movie of movies) addToSeen(movie, seen);
  return seen;
}

function isDuplicate(movie, seen) {
  return seen.ids.has(movie.id)
    || seen.imdbIds.has(imdbIdFromUrl(movie.imdbUrl))
    || seen.titleYears.has(titleYearKey(movie));
}

function addToSeen(movie, seen) {
  seen.ids.add(movie.id);
  const imdbId = imdbIdFromUrl(movie.imdbUrl);
  if (imdbId) seen.imdbIds.add(imdbId);
  seen.titleYears.add(titleYearKey(movie));
}

function titleYearKey(movie) {
  return `${normalizeTitle(movie.originalTitle || movie.title)}:${movie.year}`;
}

function imdbIdFromUrl(url) {
  return String(url ?? '').match(/tt\d+/)?.[0] ?? '';
}

function normalizeTitle(title) {
  return clean(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function clean(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function firstExistingPath(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next default path.
    }
  }

  return null;
}

async function readExistingMovies(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return [];
  }
}
