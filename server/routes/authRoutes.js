import { Router } from 'express';
import { asyncHandler, requireFields } from '../utils/http.js';
import { createToken } from '../utils/token.js';

export function createAuthRoutes({ authService, authSecret, requireAuth }) {
  const router = Router();

  router.post('/signup', asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'email', 'password']);
    const user = await authService.signup(req.body);
    const token = createToken({ sub: user.id }, authSecret);
    res.status(201).json({ user, token });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    requireFields(req.body, ['email', 'password']);
    const user = await authService.login(req.body);
    const token = createToken({ sub: user.id }, authSecret);
    res.json({ user, token });
  }));

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await authService.getPublicUser(req.user.id);
    res.json({ user });
  }));

  return router;
}
