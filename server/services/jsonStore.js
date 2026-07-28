import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DB = {
  users: [],
  interactions: [],
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const content = await readFile(this.filePath, 'utf8');
      return {
        ...DEFAULT_DB,
        ...JSON.parse(content),
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.write(DEFAULT_DB);
      return structuredClone(DEFAULT_DB);
    }
  }

  async write(data) {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    this.writeQueue = this.writeQueue.then(() => (
      writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`)
    ));

    return this.writeQueue;
  }

  async update(mutator) {
    const data = await this.read();
    const result = await mutator(data);
    await this.write(data);
    return result;
  }
}
