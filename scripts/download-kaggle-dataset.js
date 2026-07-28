import 'dotenv/config';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dataset = process.env.KAGGLE_DATASET || 'asaniczka/tmdb-movies-dataset-2023-930k-movies';
const outputDir = path.resolve(process.env.KAGGLE_DOWNLOAD_DIR || path.join(rootDir, 'data', 'kaggle'));
const zipPath = path.join(outputDir, `${dataset.split('/').at(-1)}.zip`);
const username = process.env.KAGGLE_USERNAME;
const key = process.env.KAGGLE_KEY;

if (!username || !key) {
  console.error([
    'Credenciais Kaggle ausentes.',
    '',
    'Crie um token em https://www.kaggle.com/settings/account e configure no .env:',
    '  KAGGLE_USERNAME=seu_usuario',
    '  KAGGLE_KEY=sua_chave',
  ].join('\n'));
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });
await downloadDataset();
await unzipDataset();

console.log(`Dataset ${dataset} baixado e descompactado em ${path.relative(rootDir, outputDir)}.`);

function downloadDataset() {
  const url = `https://www.kaggle.com/api/v1/datasets/download/${dataset}`;
  const auth = Buffer.from(`${username}:${key}`).toString('base64');

  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'recomenda-filmes-importer',
      },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const redirectUrl = response.headers.location;
        response.resume();
        if (!redirectUrl) {
          reject(new Error('Kaggle redirecionou sem URL de destino.'));
          return;
        }

        downloadRedirect(redirectUrl, auth).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Kaggle respondeu HTTP ${response.statusCode}. Verifique usuário, chave e aceite dos termos do dataset.`));
        return;
      }

      const file = createWriteStream(zipPath);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}

function downloadRedirect(url, auth) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'recomenda-filmes-importer',
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download redirecionado respondeu HTTP ${response.statusCode}.`));
        return;
      }

      const file = createWriteStream(zipPath);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    request.on('error', reject);
  });
}

function unzipDataset() {
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-o', zipPath, '-d', outputDir], {
      stdio: 'inherit',
    });

    unzip.on('error', reject);
    unzip.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`unzip terminou com código ${code}.`));
    });
  });
}
