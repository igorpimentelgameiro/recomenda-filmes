# Recomenda Filmes

A movie recommendation application featuring authentication, user registration, taste onboarding, in-browser neural network training with TensorFlow.js, and optional Pinecone integration for vector search.

## Architecture

- `server/`: Express API for authentication, users, interactions, the movie catalog, and recommendations.
- `data/`: Seed data for movies and training profiles.
- `public/`: Static web client served by Express.
- `server/services/movieRecommender.js`: Local ranking service used as a fallback.
- `server/services/pineconeService.js`: Pinecone index creation, synchronization, and search using integrated embeddings.

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Pinecone

Copy `.env.example` to `.env` and configure at least the following variables:

```bash
PINECONE_API_KEY=your-api-key
PINECONE_INDEX=recomenda-filmes
PINECONE_NAMESPACE=movies
```

To enable administrative actions, such as synchronizing Pinecone and downloading browser training data, configure a comma-separated list of email addresses:

```bash
ADMIN_EMAILS=admin@example.com,another-admin@example.com
```

For production environments, also provide `PINECONE_INDEX_HOST` after creating or locating the index in the Pinecone dashboard. Then synchronize the movie catalog:

```bash
npm run seed:pinecone
```

When Pinecone is not configured, the API uses the local recommendation engine, which considers genres, moods, pacing, languages, and the user's interaction history.

## Kaggle dataset

To expand the catalog with international movies, use the Kaggle dataset `asaniczka/tmdb-movies-dataset-2023-930k-movies`, which contains TMDb data and is updated daily.

Download and extract the CSV file:

```bash
mkdir -p data/kaggle
kaggle datasets download -d asaniczka/tmdb-movies-dataset-2023-930k-movies -p data/kaggle --unzip
```

If you prefer not to install the Kaggle CLI, configure `KAGGLE_USERNAME` and `KAGGLE_KEY` in `.env`, then run:

```bash
npm run download:kaggle
```

Next, import and localize the dataset for the application:

```bash
npm run import:kaggle
npm run localize:ptbr
```

By default, the importer looks for `data/kaggle/TMDB_movie_dataset_v11.csv`, preserves the existing curated movies, and adds up to 500 Kaggle movies with overviews, posters, genres, languages, IMDb information, and Rotten Tomatoes search links. You can customize this behavior with:

```bash
KAGGLE_MOVIES_CSV=/path/to/file.csv KAGGLE_IMPORT_LIMIT=1000 KAGGLE_MIN_VOTES=500 npm run import:kaggle
```

After importing a new dataset, synchronize the vector index:

```bash
npm run seed:pinecone
```

## Recommendation flow

1. The user creates an account or signs in.
2. On first access, the user selects preferred genres, moods, pacing, languages, favorite movies, and terms to avoid.
3. The backend builds a preference query and retrieves candidates from Pinecone when the integration is enabled.
4. Without Pinecone, the backend ranks the closest movies using the local recommendation engine.
5. The client can train a TensorFlow.js neural network using seed users and the current user's interaction history.
6. The trained model reorders the candidates based on the numerical representations of users and movies.

## Movie data

The catalog includes posters, overviews, cast members, directors, genres, community ratings, and external links to IMDb and Rotten Tomatoes.
