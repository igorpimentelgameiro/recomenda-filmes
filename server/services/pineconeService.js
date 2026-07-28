import { Pinecone } from '@pinecone-database/pinecone';

export class PineconeMovieIndex {
  constructor(env = process.env) {
    this.apiKey = env.PINECONE_API_KEY;
    this.indexName = env.PINECONE_INDEX || 'recomenda-filmes';
    this.indexHost = env.PINECONE_INDEX_HOST || undefined;
    this.namespaceName = env.PINECONE_NAMESPACE || 'movies';
    this.cloud = env.PINECONE_CLOUD || 'aws';
    this.region = env.PINECONE_REGION || 'us-east-1';
    this.embedModel = env.PINECONE_EMBED_MODEL || 'llama-text-embed-v2';
    this.pc = this.apiKey ? new Pinecone({ apiKey: this.apiKey }) : null;
  }

  isEnabled() {
    return Boolean(this.pc);
  }

  status(options = {}) {
    const publicStatus = {
      enabled: this.isEnabled(),
    };

    if (!options.detailed) return publicStatus;

    return {
      ...publicStatus,
      indexName: this.indexName,
      namespace: this.namespaceName,
      embedModel: this.embedModel,
      needsSyncCommand: 'npm run seed:pinecone',
    };
  }

  async ensureIndex() {
    if (!this.pc) return { enabled: false, created: false };

    const indexList = await this.pc.listIndexes();
    const exists = indexList.indexes?.some((index) => index.name === this.indexName);

    if (!exists) {
      await this.pc.createIndexForModel({
        name: this.indexName,
        cloud: this.cloud,
        region: this.region,
        embed: {
          model: this.embedModel,
          fieldMap: { text: 'chunk_text' },
        },
        waitUntilReady: true,
      });

      return { enabled: true, created: true };
    }

    return { enabled: true, created: false };
  }

  async syncMovies(movies) {
    if (!this.pc) return { enabled: false, count: 0 };

    await this.ensureIndex();
    const namespace = this.namespace();
    const records = movies.map((movie) => ({
      _id: movie.id,
      chunk_text: movie.searchText,
      movieId: movie.id,
      title: movie.title,
      originalTitle: movie.originalTitle,
      year: movie.year,
      genres: movie.genres,
      moods: movie.moods,
      pace: movie.pace,
      language: movie.language,
      director: movie.director,
      posterUrl: movie.posterUrl,
      imdbUrl: movie.imdbUrl,
      rottenTomatoesUrl: movie.rottenTomatoesUrl,
      synopsis: movie.synopsis,
      communityScore: movie.communityScore,
    }));

    for (const batch of chunks(records, 96)) {
      await namespace.upsertRecords({ records: batch });
    }

    return {
      enabled: true,
      count: records.length,
      indexName: this.indexName,
      namespace: this.namespaceName,
    };
  }

  async searchMovies(queryText, options = {}) {
    if (!this.pc) return { enabled: false, hits: [] };

    const namespace = this.namespace();
    const response = await namespace.searchRecords({
      query: {
        topK: options.topK ?? 18,
        inputs: { text: queryText },
      },
      fields: [
        'movieId',
        'title',
        'genres',
        'moods',
        'pace',
        'posterUrl',
        'synopsis',
        'communityScore',
      ],
    });

    const hits = response.result?.hits ?? response.hits ?? [];
    return {
      enabled: true,
      hits: hits.map((hit) => ({
        movieId: hit.fields?.movieId ?? hit._id ?? hit.id,
        score: hit.score ?? 0,
        provider: 'pinecone',
      })),
    };
  }

  namespace() {
    const index = this.indexHost
      ? this.pc.index(this.indexName, this.indexHost)
      : this.pc.index(this.indexName);

    return index.namespace(this.namespaceName);
  }
}

function chunks(items, size) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}
