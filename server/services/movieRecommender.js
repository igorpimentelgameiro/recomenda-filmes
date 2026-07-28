const EVENT_WEIGHTS = {
  liked: 1,
  watched: 0.6,
  saved: 0.75,
  disliked: -1,
};

export function buildTasteQuery(user) {
  const onboarding = user?.onboarding ?? {};
  const liked = (user?.interactions ?? [])
    .filter((interaction) => ['liked', 'saved', 'watched'].includes(interaction.eventType))
    .map((interaction) => interaction.movieTitle)
    .filter(Boolean);

  return [
    onboarding.favoriteGenres?.length ? `Gêneros favoritos: ${onboarding.favoriteGenres.join(', ')}` : '',
    onboarding.favoriteMoods?.length ? `Climas desejados: ${onboarding.favoriteMoods.join(', ')}` : '',
    onboarding.preferredPace ? `Ritmo preferido: ${onboarding.preferredPace}` : '',
    onboarding.favoriteLanguages?.length ? `Idiomas: ${onboarding.favoriteLanguages.join(', ')}` : '',
    onboarding.favoriteMovies ? `Filmes citados pelo usuário: ${onboarding.favoriteMovies}` : '',
    liked.length ? `Historico positivo: ${liked.join(', ')}` : '',
    onboarding.avoid ? `Evitar: ${onboarding.avoid}` : '',
  ].filter(Boolean).join('. ');
}

export function scoreMovieForProfile(movie, userProfile, excludedMovieIds = []) {
  const excluded = new Set(excludedMovieIds);
  if (excluded.has(movie.id)) return Number.NEGATIVE_INFINITY;

  const onboarding = userProfile?.onboarding ?? userProfile ?? {};
  const interactions = userProfile?.interactions ?? [];
  const disliked = new Set(
    interactions
      .filter((interaction) => interaction.eventType === 'disliked')
      .map((interaction) => interaction.movieId),
  );

  if (disliked.has(movie.id)) return Number.NEGATIVE_INFINITY;

  let score = movie.communityScore / 100;
  const favoriteGenres = normalizedSet(onboarding.favoriteGenres ?? []);
  const favoriteMoods = normalizedSet(onboarding.favoriteMoods ?? []);
  const languages = normalizedSet(onboarding.favoriteLanguages ?? []);

  score += movie.genres.filter((genre) => favoriteGenres.has(normalizeText(genre))).length * 0.35;
  score += movie.moods.filter((mood) => favoriteMoods.has(normalizeText(mood))).length * 0.22;
  score += normalizeText(onboarding.preferredPace) === normalizeText(movie.pace) ? 0.2 : 0;
  score += languages.has(normalizeText(movie.language)) ? 0.12 : 0;

  for (const interaction of interactions) {
    const weight = EVENT_WEIGHTS[interaction.eventType] ?? 0;
    if (!weight || !interaction.movieGenres) continue;

    const interactionGenres = normalizedSet(interaction.movieGenres);
    const overlap = movie.genres.filter((genre) => interactionGenres.has(normalizeText(genre))).length;
    score += overlap * weight * 0.1;
  }

  const avoid = String(onboarding.avoid ?? '').toLowerCase();
  if (avoid) {
    const haystack = normalizeText(`${movie.title} ${movie.genres.join(' ')} ${movie.moods.join(' ')} ${movie.synopsis}`);
    const avoidTerms = avoid.split(/[,\n]/).map((term) => normalizeText(term)).filter(Boolean);
    if (avoidTerms.some((term) => haystack.includes(term))) score -= 0.4;
  }

  return score;
}

function normalizedSet(values = []) {
  return new Set(values.map((value) => normalizeText(value)).filter(Boolean));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function rankLocalCandidates(movies, userProfile, options = {}) {
  const { excludedMovieIds = [], limit = 30 } = options;

  return movies
    .map((movie) => ({
      movieId: movie.id,
      score: scoreMovieForProfile(movie, userProfile, excludedMovieIds),
      provider: 'local',
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
