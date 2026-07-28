import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const moviesPath = path.resolve(process.env.MOVIES_JSON ?? path.join(rootDir, 'data', 'movies.seed.json'));
const overridesPath = path.resolve(process.env.PTBR_OVERRIDES_JSON ?? path.join(rootDir, 'data', 'locales', 'pt-BR', 'movie-overrides.json'));
const cachePath = path.resolve(process.env.PTBR_TRANSLATION_CACHE ?? path.join(rootDir, 'data', 'locales', 'pt-BR', 'translation-cache.json'));
const translateTitles = process.env.PTBR_TRANSLATE_TITLES !== 'false';
const throttleMs = Number(process.env.PTBR_TRANSLATION_DELAY_MS ?? 90);

const movies = JSON.parse(await readFile(moviesPath, 'utf8'));
const overrides = await readJson(overridesPath, {});
const cache = await readJson(cachePath, {});

let translatedFields = 0;
let cacheHits = 0;
let processed = 0;

for (const movie of movies) {
  const override = overrides[movie.id] ?? overrides[`${movie.originalTitle}:${movie.year}`] ?? overrides[`${movie.title}:${movie.year}`];

  if (override?.title) {
    movie.title = override.title;
  } else if (translateTitles && shouldTranslateTitle(movie)) {
    movie.title = await translateCached(`title:${movie.originalTitle || movie.title}`, movie.title);
  }

  if (override?.synopsis) {
    movie.synopsis = override.synopsis;
  } else if (isLikelyEnglish(movie.synopsis)) {
    movie.synopsis = await translateCached(`synopsis:${movie.id}`, movie.synopsis);
  }

  processed += 1;
  if (processed % 50 === 0) {
    await persistCache();
    console.log(`Localizados ${processed}/${movies.length} filmes...`);
  }
}

await persistCache();
await writeFile(moviesPath, `${JSON.stringify(movies, null, 2)}\n`);

console.log(`Localização pt-BR concluída: ${translatedFields} campos traduzidos, ${cacheHits} leituras do cache.`);

async function translateCached(key, text) {
  const source = String(text ?? '').trim();
  if (!source) return source;

  const cached = cache[key];
  if (cached?.source === source && cached.target) {
    cacheHits += 1;
    return cached.target;
  }

  const target = await translateText(source);
  cache[key] = { source, target };
  translatedFields += 1;
  await delay(throttleMs);
  return target;
}

async function translateText(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Tradução falhou com HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const translated = payload?.[0]?.map((item) => item[0]).join('');
  if (!translated) throw new Error('Tradução retornou resposta vazia.');
  return translated;
}

function shouldTranslateTitle(movie) {
  if (!movie.id?.startsWith('tmdb-')) return false;
  if (movie.language !== 'Inglês') return false;
  if (!movie.title || movie.title !== movie.originalTitle) return false;
  if (!/[A-Za-z]{3,}/.test(movie.title)) return false;
  return /\b(the|of|and|in|to|from|for|with|men|women|children|life|day|night|world|story|king|queen|last|first)\b/i.test(movie.title);
}

function isLikelyEnglish(text) {
  const value = String(text ?? '');
  return /\b(the|and|with|from|into|where|which|their|former|world|while|after|before|when|who|his|her|life|young|story|family|must|find|help|save|against)\b/i.test(value);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function persistCache() {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
