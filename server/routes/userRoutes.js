import { Router } from 'express';
import { asyncHandler, requireFields } from '../utils/http.js';

export function createUserRoutes({ authService, interactionService, requireAuth }) {
  const router = Router();

  router.get('/me/interactions', requireAuth, asyncHandler(async (req, res) => {
    const interactions = await interactionService.listForUser(req.user.id);
    res.json({ interactions });
  }));

  router.patch('/me/profile', requireAuth, asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'email']);
    const user = await authService.updateProfile(req.user.id, req.body);
    res.json({ user });
  }));

  router.patch('/me/password', requireAuth, asyncHandler(async (req, res) => {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    const user = await authService.changePassword(req.user.id, req.body);
    res.json({ user });
  }));

  router.patch('/me/onboarding', requireAuth, asyncHandler(async (req, res) => {
    requireFields(req.body, ['ageRange', 'favoriteGenres', 'favoriteMoods', 'preferredPace']);
    const user = await authService.updateOnboarding(req.user.id, req.body);
    res.json({ user });
  }));

  router.post('/me/interactions', requireAuth, asyncHandler(async (req, res) => {
    requireFields(req.body, ['movieId', 'eventType']);
    const interaction = await interactionService.upsert(req.user.id, req.body);
    res.status(201).json({ interaction });
  }));

  return router;
}
