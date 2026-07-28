import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';

export function createMovieRoutes({ movieRepository }) {
  const router = Router();

  router.get('/movies', asyncHandler(async (_req, res) => {
    const movies = await movieRepository.listMovies();
    res.json({ movies });
  }));

  router.get('/movies/facets', asyncHandler(async (_req, res) => {
    const facets = await movieRepository.facets();
    res.json({ facets });
  }));

  return router;
}
