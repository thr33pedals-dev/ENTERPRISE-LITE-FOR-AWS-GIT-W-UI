import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getStorage } from '../storage/index.js';
import { tenantPersonaPrefix, ensureKeyWithinTenant } from '../storage/paths.js';

export async function saveJson(storageKey, payload, { prettyPrint = false, prefix, tenantId, personaId } = {}) {
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId, personaId);
  const data = prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  return storage.save(resolvedKey, data, { contentType: 'application/json' });
}

export async function saveText(storageKey, text, contentType = 'text/plain', { prefix, tenantId, personaId } = {}) {
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId, personaId);
  return storage.save(resolvedKey, text, { contentType });
}

export async function downloadToTemp(storageKey, extension = '.json', { prefix, tenantId, personaId } = {}) {
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId, personaId);
  const buffer = await storage.read(resolvedKey);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'storage-cache-'));
  const extensionWithDot = extension.startsWith('.') ? extension : `.${extension}`;
  const tempPath = path.join(tempDir, `${crypto.randomUUID()}${extensionWithDot}`);
  await fs.promises.writeFile(tempPath, buffer);
  return tempPath;
}

export async function readText(storageKey, { prefix, tenantId, personaId } = {}) {
  if (!storageKey) return null;
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId, personaId);
  try {
    const buffer = await storage.read(resolvedKey);
    return buffer.toString('utf-8');
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

export async function readJson(storageKey, { prefix, tenantId, personaId } = {}) {
  const text = await readText(storageKey, { prefix, tenantId, personaId });
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${storageKey}: ${error.message}`);
  }
}

export async function readBuffer(storageKey, { prefix, tenantId, personaId } = {}) {
  if (!storageKey) return null;
  const storage = getStorage({ prefix });
  const resolvedKey = resolveKeyWithTenant(storageKey, tenantId, personaId);
  try {
    return await storage.read(resolvedKey);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

export async function loadVisionPayload(entry, { prefix, tenantId, personaId } = {}) {
  if (!entry) return null;
  const artifacts = entry.artifacts || {};
  const metadata = entry.metadata || {};
  const visionArtifacts = metadata.visionArtifacts || metadata.vision_artifacts || {};
  const key = artifacts.parsedJsonPath || artifacts.jsonKey ||
    visionArtifacts.parsedStorageKey || visionArtifacts.parsed_storage_key ||
    visionArtifacts.jsonKey || visionArtifacts.json_key;
  if (!key) return null;
  const text = await readText(key, { prefix, tenantId, personaId });
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn(`Failed to parse vision payload ${key}: ${error.message}`);
    return null;
  }
}

function resolveKeyWithTenant(storageKey, tenantId, personaId) {
  if (!tenantId) {
    return storageKey;
  }

  if (!storageKey) {
    return tenantPersonaPrefix(tenantId, personaId);
  }

  return ensureKeyWithinTenant(tenantId, personaId, storageKey);
}

export { tenantPersonaPrefix as buildTenantKey };
