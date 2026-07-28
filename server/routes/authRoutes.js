import { Router } from 'express';
import { asyncHandler, requireFields } from '../utils/http.js';
import { createToken } from '../utils/token.js';
import {
  clearSessionCookieOptions,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../utils/sessionCookie.js';

export function createAuthRoutes({ authService, authSecret, requireAuth, authRateLimiter }) {
  const router = Router();

  router.post('/signup', authRateLimiter, asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'email', 'password']);
    const user = await authService.signup(req.body);
    const token = createToken({ sub: user.id }, authSecret);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.status(201).json({ user });
  }));

  router.post('/login', authRateLimiter, asyncHandler(async (req, res) => {
    requireFields(req.body, ['email', 'password']);
    const user = await authService.login(req.body);
    const token = createToken({ sub: user.id }, authSecret);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.json({ user });
  }));

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions());
    res.status(204).end();
  });

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await authService.getPublicUser(req.user.id);
    res.json({ user });
  }));

  return router;
}
