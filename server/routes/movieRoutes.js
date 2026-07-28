import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';

export function createMovieRoutes({ movieRepository, requireAuth }) {
  const router = Router();

  router.get('/movies', requireAuth, asyncHandler(async (_req, res) => {
    const movies = await movieRepository.listPublicMovies();
    res.json({ movies });
  }));

  router.get('/movies/facets', requireAuth, asyncHandler(async (_req, res) => {
    const facets = await movieRepository.facets();
    res.json({ facets });
  }));

  return router;
}
