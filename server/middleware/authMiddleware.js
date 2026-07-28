import { verifyToken } from '../utils/token.js';
import { HttpError } from '../utils/http.js';

export function authMiddleware(authSecret) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];

    if (!token) {
      next(new HttpError(401, 'Token ausente.'));
      return;
    }

    const payload = verifyToken(token, authSecret);
    if (!payload?.sub) {
      next(new HttpError(401, 'Token inválido ou expirado.'));
      return;
    }

    req.user = { id: payload.sub };
    next();
  };
}
