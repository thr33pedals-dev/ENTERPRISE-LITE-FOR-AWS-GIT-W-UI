import path from 'path';
import { fileURLToPath } from 'url';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const storageCache = new Map();

function resolveOptions(rawOptions = {}) {
  const backend = (rawOptions.backend || process.env.STORAGE_BACKEND || 'local').toLowerCase();
  const prefix = rawOptions.prefix ?? process.env.STORAGE_PREFIX ?? '';

  if (backend === 'local') {
    const defaultDir = path.join(PROJECT_ROOT, 'uploads', 'processed');
    const baseDir = rawOptions.baseDir
      ? path.resolve(PROJECT_ROOT, rawOptions.baseDir)
      : (process.env.LOCAL_STORAGE_DIR
          ? path.resolve(PROJECT_ROOT, process.env.LOCAL_STORAGE_DIR)
          : defaultDir);

    return { backend, baseDir, prefix };
  }

  if (backend === 's3') {
    const bucket = rawOptions.bucket || process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error('STORAGE_BACKEND is set to "s3" but S3_BUCKET is not configured.');
    }

    return {
      backend,
      bucket,
      prefix,
      region: rawOptions.region || process.env.S3_REGION,
      endpoint: rawOptions.endpoint || process.env.S3_ENDPOINT,
      forcePathStyle: rawOptions.forcePathStyle ?? process.env.S3_FORCE_PATH_STYLE === 'true',
      signingTTLSeconds: rawOptions.signingTTLSeconds || parseInt(process.env.S3_SIGNED_URL_TTL || '3600', 10)
    };
  }

  throw new Error(`Unsupported STORAGE_BACKEND: ${backend}`);
}

function createStorageInstance(resolved) {
  if (resolved.backend === 'local') {
    return createLocalStorage({ baseDir: resolved.baseDir, prefix: resolved.prefix });
  }

  return createS3Storage({
    bucket: resolved.bucket,
    prefix: resolved.prefix,
    region: resolved.region,
    endpoint: resolved.endpoint,
    forcePathStyle: resolved.forcePathStyle,
    signingTTLSeconds: resolved.signingTTLSeconds
  });
}

function getCacheKey(resolved) {
  return JSON.stringify({
    backend: resolved.backend,
    baseDir: resolved.baseDir,
    bucket: resolved.bucket,
    prefix: resolved.prefix,
    region: resolved.region,
    endpoint: resolved.endpoint,
    forcePathStyle: resolved.forcePathStyle,
    signingTTLSeconds: resolved.signingTTLSeconds
  });
}

export function getStorage(options = {}) {
  const resolved = resolveOptions(options);
  const cacheKey = getCacheKey(resolved);

  if (!options.forceNew && storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey);
  }

  const instance = createStorageInstance(resolved);
  storageCache.set(cacheKey, instance);
  return instance;
}

export function resetStorage() {
  storageCache.clear();
}

