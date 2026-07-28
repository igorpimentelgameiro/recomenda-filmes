import { HttpError } from '../utils/http.js';

export function adminMiddleware(authService) {
  return async (req, _res, next) => {
    try {
      const user = await authService.getPublicUser(req.user.id);
      if (!user.isAdmin) {
        throw new HttpError(403, 'Acesso restrito a administradores.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
