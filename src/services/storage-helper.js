import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getStorage } from '../storage/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_ROOT = process.env.STORAGE_TEMP_DIR
  ? path.resolve(__dirname, '..', '..', process.env.STORAGE_TEMP_DIR)
  : path.join(os.tmpdir(), 'sme-storage-cache');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function generateTempPath(key, extension = '.tmp') {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  const fileName = `${hash}${extension.startsWith('.') ? extension : `.${extension}`}`;
  return path.join(TEMP_ROOT, fileName);
}

export async function saveJson(storageKey, payload, { prettyPrint = false } = {}) {
  const storage = getStorage();
  const data = prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  return storage.save(storageKey, data, { contentType: 'application/json' });
}

export async function saveText(storageKey, text, contentType = 'text/plain') {
  const storage = getStorage();
  return storage.save(storageKey, text, { contentType });
}

export async function downloadToTemp(storageKey, extension = '.json') {
  const storage = getStorage();
  const buffer = await storage.read(storageKey);
  ensureDir(TEMP_ROOT);
  const tempPath = generateTempPath(storageKey, extension);
  await fs.promises.writeFile(tempPath, buffer);
  return tempPath;
}
