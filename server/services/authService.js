import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { HttpError } from '../utils/http.js';

function publicUser(user, isAdmin = false) {
  const { passwordHash, ...safeUser } = user;
  return { ...safeUser, isAdmin };
}

export class AuthService {
  constructor(store, options = {}) {
    this.store = store;
    this.adminEmails = new Set(
      (options.adminEmails ?? [])
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isAdminUser(user) {
    return this.adminEmails.has(String(user?.email ?? '').trim().toLowerCase());
  }

  toPublicUser(user) {
    return publicUser(user, this.isAdminUser(user));
  }

  async signup({ name, email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (password.length < 8) {
      throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
    }

    return this.store.update((db) => {
      const exists = db.users.some((user) => user.email === normalizedEmail);
      if (exists) throw new HttpError(409, 'Já existe uma conta com este e-mail.');

      const now = new Date().toISOString();
      const user = {
        id: randomUUID(),
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        profilePhotoUrl: '',
        onboarding: null,
        createdAt: now,
        updatedAt: now,
      };

      db.users.push(user);
      return this.toPublicUser(user);
    });
  }

  async login({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const db = await this.store.read();
    const user = db.users.find((item) => item.email === normalizedEmail);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'E-mail ou senha inválidos.');
    }

    return this.toPublicUser(user);
  }

  async getPublicUser(userId) {
    const db = await this.store.read();
    const user = db.users.find((item) => item.id === userId);
    if (!user) throw new HttpError(404, 'Usuário não encontrado.');
    return this.toPublicUser(user);
  }

  async updateProfile(userId, payload) {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const name = payload.name.trim();
    const profilePhotoUrl = String(payload.profilePhotoUrl ?? '').trim();

    if (!name) throw new HttpError(400, 'O nome é obrigatório.');

    return this.store.update((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) throw new HttpError(404, 'Usuário não encontrado.');

      const emailInUse = db.users.some((item) => (
        item.id !== userId && item.email === normalizedEmail
      ));
      if (emailInUse) throw new HttpError(409, 'Já existe uma conta com este e-mail.');

      user.name = name;
      user.email = normalizedEmail;
      user.profilePhotoUrl = profilePhotoUrl;
      user.updatedAt = new Date().toISOString();

      return this.toPublicUser(user);
    });
  }

  async changePassword(userId, payload) {
    if (payload.newPassword.length < 8) {
      throw new HttpError(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
    }

    return this.store.update((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) throw new HttpError(404, 'Usuário não encontrado.');

      if (!verifyPassword(payload.currentPassword, user.passwordHash)) {
        throw new HttpError(401, 'Senha atual inválida.');
      }

      user.passwordHash = hashPassword(payload.newPassword);
      user.updatedAt = new Date().toISOString();

      return this.toPublicUser(user);
    });
  }

  async updateOnboarding(userId, onboarding) {
    return this.store.update((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) throw new HttpError(404, 'Usuário não encontrado.');

      user.onboarding = {
        ageRange: onboarding.ageRange,
        favoriteGenres: onboarding.favoriteGenres ?? [],
        favoriteMoods: onboarding.favoriteMoods ?? [],
        preferredPace: onboarding.preferredPace,
        favoriteLanguages: onboarding.favoriteLanguages ?? [],
        favoriteMovies: onboarding.favoriteMovies ?? '',
        avoid: onboarding.avoid ?? '',
      };
      user.updatedAt = new Date().toISOString();

      return this.toPublicUser(user);
    });
  }
}
