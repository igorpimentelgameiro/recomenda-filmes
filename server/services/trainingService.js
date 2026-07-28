import { readFile } from 'node:fs/promises';

export class TrainingService {
  constructor({ store, movieRepository, seedUsersPath }) {
    this.store = store;
    this.movieRepository = movieRepository;
    this.seedUsersPath = seedUsersPath;
    this.seedUsers = null;
  }

  async getTrainingPayload(currentUserId) {
    const [movies, seedUsers, db] = await Promise.all([
      this.movieRepository.listMovies(),
      this.loadSeedUsers(),
      this.store.read(),
    ]);

    const currentUser = db.users.find((user) => user.id === currentUserId);
    const currentInteractions = db.interactions.filter((interaction) => interaction.userId === currentUserId);

    const users = [
      ...seedUsers,
      {
        id: currentUser.id,
        name: currentUser.name,
        ageRange: currentUser.onboarding?.ageRange,
        favoriteGenres: currentUser.onboarding?.favoriteGenres ?? [],
        favoriteMoods: currentUser.onboarding?.favoriteMoods ?? [],
        preferredPace: currentUser.onboarding?.preferredPace,
        favoriteLanguages: currentUser.onboarding?.favoriteLanguages ?? [],
        avoid: currentUser.onboarding?.avoid ?? '',
        interactions: currentInteractions,
      },
    ];

    return { movies, users, currentUserId };
  }

  async loadSeedUsers() {
    if (!this.seedUsers) {
      const content = await readFile(this.seedUsersPath, 'utf8');
      this.seedUsers = JSON.parse(content);
    }

    return this.seedUsers;
  }
}
