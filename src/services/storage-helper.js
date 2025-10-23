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

export async function saveJson(storageKey, payload, { prettyPrint = false, prefix, tenantId } = {}) {
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId);
  const data = prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  return storage.save(resolvedKey, data, { contentType: 'application/json' });
}

export async function saveText(storageKey, text, contentType = 'text/plain', { prefix, tenantId } = {}) {
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId);
  return storage.save(resolvedKey, text, { contentType });
}

export async function downloadToTemp(storageKey, extension = '.json', { prefix, tenantId } = {}) {
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId);
  const buffer = await storage.read(resolvedKey);
  ensureDir(TEMP_ROOT);
  const tempPath = generateTempPath(resolvedKey, extension);
  await fs.promises.writeFile(tempPath, buffer);
  return tempPath;
}

function resolveKeyWithTenant(storageKey, tenantId) {
  if (!tenantId) {
    return storageKey;
  }

  const normalizedTenant = buildTenantKey(tenantId).split('/')[0];
  const key = storageKey || '';
  if (key.startsWith(`${normalizedTenant}/`)) {
    return key;
  }
  return buildTenantKey(tenantId, key);
}

export function buildTenantKey(tenantId, ...parts) {
  const safeTenant = (tenantId || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'default';
  return [safeTenant, ...parts.filter(Boolean)].join('/');
}
