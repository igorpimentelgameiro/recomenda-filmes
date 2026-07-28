import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './services/jsonStore.js';
import { MovieRepository } from './services/movieRepository.js';
import { AuthService } from './services/authService.js';
import { InteractionService } from './services/interactionService.js';
import { TrainingService } from './services/trainingService.js';
import { PineconeMovieIndex } from './services/pineconeService.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { adminMiddleware } from './middleware/adminMiddleware.js';
import { createRateLimiter, securityHeaders } from './middleware/securityMiddleware.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createUserRoutes } from './routes/userRoutes.js';
import { createMovieRoutes } from './routes/movieRoutes.js';
import { createRecommendationRoutes } from './routes/recommendationRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const publicDir = path.join(rootDir, 'public');

const app = express();
const port = Number(process.env.PORT ?? 3000);
const authSecret = process.env.AUTH_SECRET || 'dev-secret-change-me';
const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? '');

if (!process.env.AUTH_SECRET) {
  console.warn('[auth] AUTH_SECRET ausente. Usando segredo de desenvolvimento.');
}

const store = new JsonStore(path.join(dataDir, 'app.db.json'));
const movieRepository = new MovieRepository(path.join(dataDir, 'movies.seed.json'));
const authService = new AuthService(store, { adminEmails });
const interactionService = new InteractionService(store, movieRepository);
const trainingService = new TrainingService({
  store,
  movieRepository,
  seedUsersPath: path.join(dataDir, 'training-users.seed.json'),
});
const pineconeIndex = new PineconeMovieIndex(process.env);
const requireAuth = authMiddleware(authSecret);
const requireAdmin = adminMiddleware(authService);
const authRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    pinecone: pineconeIndex.status(),
  });
});

app.use('/api/auth', createAuthRoutes({
  authService,
  authSecret,
  requireAuth,
  authRateLimiter,
}));
app.use('/api', createUserRoutes({ authService, interactionService, requireAuth }));
app.use('/api', createMovieRoutes({ movieRepository, requireAuth }));
app.use('/api', createRecommendationRoutes({
  store,
  authService,
  movieRepository,
  trainingService,
  pineconeIndex,
  requireAuth,
  requireAdmin,
}));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(publicDir, 'index.html'));
    return;
  }

  next();
});

app.use((error, _req, res, _next) => {
  const status = error.status ?? 500;
  if (status >= 500) console.error(error);

  res.status(status).json({
    error: {
      message: error.message ?? 'Erro interno.',
      details: error.details,
    },
  });
});

app.listen(port, () => {
  console.log(`Recomenda Filmes em http://localhost:${port}`);
});

function parseAdminEmails(value) {
  return String(value)
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
