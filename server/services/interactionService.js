import { randomUUID } from 'node:crypto';
import { HttpError } from '../utils/http.js';

const VALID_EVENTS = new Set(['liked', 'disliked', 'watched', 'saved']);

export class InteractionService {
  constructor(store, movieRepository) {
    this.store = store;
    this.movieRepository = movieRepository;
  }

  async listForUser(userId) {
    const db = await this.store.read();
    return db.interactions
      .filter((interaction) => interaction.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upsert(userId, payload) {
    if (!VALID_EVENTS.has(payload.eventType)) {
      throw new HttpError(400, 'Tipo de interação inválido.');
    }

    const movie = await this.movieRepository.getById(payload.movieId);
    if (!movie) throw new HttpError(404, 'Filme não encontrado.');

    return this.store.update((db) => {
      const now = new Date().toISOString();
      const existing = db.interactions.find((interaction) => (
        interaction.userId === userId && interaction.movieId === payload.movieId
      ));

      if (existing) {
        existing.eventType = payload.eventType;
        existing.rating = payload.rating ?? eventToRating(payload.eventType);
        existing.updatedAt = now;
        return existing;
      }

      const interaction = {
        id: randomUUID(),
        userId,
        movieId: payload.movieId,
        movieTitle: movie.title,
        movieGenres: movie.genres,
        eventType: payload.eventType,
        rating: payload.rating ?? eventToRating(payload.eventType),
        createdAt: now,
        updatedAt: now,
      };

      db.interactions.push(interaction);
      return interaction;
    });
  }
}

function eventToRating(eventType) {
  return {
    liked: 5,
    saved: 4,
    watched: 3,
    disliked: 1,
  }[eventType] ?? 3;
}
