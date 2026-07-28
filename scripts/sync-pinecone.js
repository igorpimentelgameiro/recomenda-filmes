import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MovieRepository } from '../server/services/movieRepository.js';
import { PineconeMovieIndex } from '../server/services/pineconeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const repository = new MovieRepository(path.join(rootDir, 'data', 'movies.seed.json'));
const pineconeIndex = new PineconeMovieIndex(process.env);

if (!pineconeIndex.isEnabled()) {
  console.error('PINECONE_API_KEY não configurada. Copie .env.example para .env e preencha a chave.');
  process.exit(1);
}

const movies = await repository.listMovies();
const result = await pineconeIndex.syncMovies(movies);
console.log(`Sincronizados ${result.count} filmes em ${result.indexName}/${result.namespace}.`);
