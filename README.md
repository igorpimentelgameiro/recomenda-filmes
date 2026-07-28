# Recomenda Filmes

Aplicação de recomendação de filmes com login, cadastro, onboarding de gosto, treinamento de rede neural no navegador com TensorFlow.js e integração opcional com Pinecone para busca vetorial.

## Arquitetura

- `server/`: API Express com autenticação, usuários, interações, catálogo e recomendações.
- `data/`: base seed de filmes e perfis de treino.
- `public/`: cliente web estático servido pelo Express.
- `server/services/movieRecommender.js`: ranking local usado como fallback.
- `server/services/pineconeService.js`: criação/sync/busca em índice Pinecone com embedding integrado.

## Executar

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Pinecone

Copie `.env.example` para `.env` e configure pelo menos:

```bash
PINECONE_API_KEY=sua-chave
PINECONE_INDEX=recomenda-filmes
PINECONE_NAMESPACE=movies
```

Para liberar ações administrativas, como sincronizar Pinecone e baixar dados de treino no navegador, configure uma lista de e-mails separados por vírgula:

```bash
ADMIN_EMAILS=admin@example.com,outro-admin@example.com
```

Para melhor uso em produção, também informe `PINECONE_INDEX_HOST` depois de criar ou localizar o índice no painel do Pinecone. Em seguida, sincronize os filmes:

```bash
npm run seed:pinecone
```

Quando o Pinecone não estiver configurado, a API usa recomendação local baseada em gêneros, climas, ritmo, idioma e histórico do usuário.

## Dataset Kaggle

Para ampliar o catálogo com filmes mundiais, use o dataset Kaggle `asaniczka/tmdb-movies-dataset-2023-930k-movies`, que reúne dados do TMDb e é atualizado diariamente.

Baixe e descompacte o CSV:

```bash
mkdir -p data/kaggle
kaggle datasets download -d asaniczka/tmdb-movies-dataset-2023-930k-movies -p data/kaggle --unzip
```

Se você não quiser instalar a CLI do Kaggle, configure `KAGGLE_USERNAME` e `KAGGLE_KEY` no `.env` e rode:

```bash
npm run download:kaggle
```

Depois importe para o formato do app:

```bash
npm run import:kaggle
npm run localize:ptbr
```

Por padrão, o importador procura `data/kaggle/TMDB_movie_dataset_v11.csv`, preserva os filmes curados atuais e adiciona até 500 filmes do Kaggle com sinopse, pôster, gêneros, idioma, IMDb e busca no Rotten Tomatoes. Para ajustar:

```bash
KAGGLE_MOVIES_CSV=/caminho/arquivo.csv KAGGLE_IMPORT_LIMIT=1000 KAGGLE_MIN_VOTES=500 npm run import:kaggle
```

Depois de importar uma base nova, sincronize o índice vetorial:

```bash
npm run seed:pinecone
```

## Fluxo de recomendação

1. O usuário cria conta ou entra.
2. No primeiro acesso, informa gêneros, climas, ritmo, idiomas, filmes favoritos e termos a evitar.
3. O backend monta uma consulta de gosto e busca candidatos no Pinecone, quando ativo.
4. Sem Pinecone, o backend ranqueia localmente os filmes mais próximos.
5. A tela pode treinar uma rede TensorFlow.js com usuários seed e histórico atual.
6. O modelo treinado reordena os candidatos conforme a representação numérica de usuário e filme.

## Dados de filmes

A base inclui pôster, sinopse, elenco, diretor, gêneros, nota comunitária e links externos para IMDb e Rotten Tomatoes.
