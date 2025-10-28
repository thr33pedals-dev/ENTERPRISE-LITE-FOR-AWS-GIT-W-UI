import fs from 'fs';
import path from 'path';

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toSafeKey(prefix, key) {
  const normalizedPrefix = (prefix || '').replace(/^\/+|\/+$/g, '');
  const normalizedKey = (key || '').replace(/^\/+/, '');
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedKey}` : normalizedKey;
}

export function createLocalStorage({ baseDir, prefix = '' }) {
  if (!baseDir) {
    throw new Error('createLocalStorage requires a baseDir option');
  }

  const resolvedBaseDir = path.resolve(baseDir);

  if (!fs.existsSync(resolvedBaseDir)) {
    fs.mkdirSync(resolvedBaseDir, { recursive: true });
  }

  function resolveKey(key) {
    const safeKey = toSafeKey(prefix, key);
    return path.join(resolvedBaseDir, safeKey);
  }

  return {
    baseDir: resolvedBaseDir,
    backend: 'local',
    prefix,

    async save(key, data, options = {}) {
      const targetPath = resolveKey(key);
      const content = (typeof data === 'string' || Buffer.isBuffer(data)) ? data : JSON.stringify(data, null, 2);
      ensureDirectory(targetPath);
      await fs.promises.writeFile(targetPath, content, options.encoding ? { encoding: options.encoding } : undefined);
      return { key, path: targetPath, backend: 'local' };
    },

    async read(key, options = {}) {
      const targetPath = resolveKey(key);
      return fs.promises.readFile(targetPath, options);
    },

    async readJson(key) {
      const buffer = await this.read(key);
      return JSON.parse(buffer.toString('utf-8'));
    },

    async exists(key) {
      const targetPath = resolveKey(key);
      try {
        await fs.promises.access(targetPath);
        return true;
      } catch {
        return false;
      }
    },

    async remove(key) {
      const targetPath = resolveKey(key);
      try {
        await fs.promises.unlink(targetPath);
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
      }
    },

    resolvePath(key) {
      return resolveKey(key);
    },

    getDownloadUrl(key) {
      return `file://${resolveKey(key)}`;
    }
  };
}

