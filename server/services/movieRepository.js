import { readFile } from 'node:fs/promises';

function buildSearchText(movie) {
  return [
    movie.title,
    movie.originalTitle,
    movie.year,
    movie.director,
    movie.genres.join(', '),
    movie.moods.join(', '),
    `ritmo ${movie.pace}`,
    `idioma ${movie.language}`,
    movie.synopsis,
    movie.cast.join(', '),
  ].filter(Boolean).join('. ');
}

export class MovieRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.cache = null;
  }

  async listMovies() {
    if (!this.cache) {
      const content = await readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(content).map((movie) => ({
        ...movie,
        searchText: buildSearchText(movie),
      }));
    }

    return this.cache;
  }

  async getById(movieId) {
    const movies = await this.listMovies();
    return movies.find((movie) => movie.id === movieId) ?? null;
  }

  async listByIds(movieIds) {
    const ids = new Set(movieIds);
    const movies = await this.listMovies();
    return movies.filter((movie) => ids.has(movie.id));
  }

  async facets() {
    const movies = await this.listMovies();
    return {
      genres: [...new Set(movies.flatMap((movie) => movie.genres))].sort(),
      moods: [...new Set(movies.flatMap((movie) => movie.moods))].sort(),
      paces: [...new Set(movies.map((movie) => movie.pace))].sort(),
      languages: [...new Set(movies.map((movie) => movie.language))].sort(),
    };
  }
}
