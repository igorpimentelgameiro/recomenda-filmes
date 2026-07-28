import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { buildTasteQuery, rankLocalCandidates } from '../services/movieRecommender.js';

export function createRecommendationRoutes({
  store,
  movieRepository,
  trainingService,
  pineconeIndex,
  requireAuth,
}) {
  const router = Router();

  router.get('/recommendations/training-data', requireAuth, asyncHandler(async (req, res) => {
    const payload = await trainingService.getTrainingPayload(req.user.id);
    res.json(payload);
  }));

  router.post('/recommendations/candidates', requireAuth, asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.body.limit ?? 30), 60));
    const excludedMovieIds = Array.isArray(req.body.excludedMovieIds) ? req.body.excludedMovieIds : [];
    const [db, movies] = await Promise.all([store.read(), movieRepository.listMovies()]);
    const validMovieIds = new Set(movies.map((movie) => movie.id));
    const user = db.users.find((item) => item.id === req.user.id);
    const interactions = db.interactions.filter((interaction) => interaction.userId === req.user.id);
    const userProfile = { ...user, interactions };
    const tasteQuery = req.body.tasteQuery || buildTasteQuery(userProfile);

    let candidates = [];
    let provider = 'local';
    let pineconeError = null;

    if (pineconeIndex.isEnabled() && tasteQuery) {
      try {
        const result = await pineconeIndex.searchMovies(tasteQuery, { topK: Math.max(limit, 30) });
        candidates = result.hits.filter((hit) => (
          validMovieIds.has(hit.movieId) && !excludedMovieIds.includes(hit.movieId)
        ));
        provider = 'pinecone';
      } catch (error) {
        pineconeError = error.message;
      }
    }

    if (candidates.length < limit) {
      const alreadySelected = candidates.map((candidate) => candidate.movieId);
      const localCandidates = rankLocalCandidates(movies, userProfile, {
        excludedMovieIds: [...excludedMovieIds, ...alreadySelected],
        limit: limit - candidates.length,
      });

      candidates = [...candidates, ...localCandidates];
      provider = provider === 'pinecone' && localCandidates.length ? 'pinecone+local' : 'local';
    }

    res.json({
      provider,
      candidates: candidates.slice(0, limit),
      tasteQuery,
      pinecone: {
        ...pineconeIndex.status(),
        error: pineconeError,
      },
    });
  }));

  router.get('/pinecone/status', requireAuth, asyncHandler(async (_req, res) => {
    res.json({ pinecone: pineconeIndex.status() });
  }));

  router.post('/pinecone/sync', requireAuth, asyncHandler(async (_req, res) => {
    const movies = await movieRepository.listMovies();
    const result = await pineconeIndex.syncMovies(movies);
    res.json({ pinecone: result });
  }));

  return router;
}
