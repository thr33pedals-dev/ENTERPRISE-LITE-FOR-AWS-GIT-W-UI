import fs from 'fs';
import path from 'path';
import { getStorage } from '../storage/index.js';
import { sanitizeTenantId } from '../file-processor.js';
import { manifestsKey } from '../storage/paths.js';

const LEGACY_MANIFEST_FILENAME = 'manifest.json';

const PROJECT_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const LEGACY_PROCESSED_DIR = path.join(PROJECT_ROOT, 'uploads', 'processed');
const LEGACY_MANIFESTS_DIR = path.join(LEGACY_PROCESSED_DIR, 'manifests');

function manifestKey(rawTenantId, personaId = null) {
  const tenantId = sanitizeTenantId(rawTenantId) || 'default';
  const personaSegment = personaId ? sanitizeTenantId(personaId) : null;
  return manifestsKey(tenantId, personaSegment);
}

function isNotFoundError(error) {
  if (!error) return false;
  if (error.code === 'ENOENT') return true;
  if (error.name === 'NoSuchKey') return true;
  if (error.$metadata?.httpStatusCode === 404) return true;
  return false;
}

function readLegacyManifest(tenantId) {
  const safeTenant = sanitizeTenantId(tenantId) || 'default';
  const legacyPaths = [];

  if (safeTenant === 'default') {
    legacyPaths.push(path.join(LEGACY_PROCESSED_DIR, LEGACY_MANIFEST_FILENAME));
  }

  legacyPaths.push(path.join(LEGACY_MANIFESTS_DIR, `${safeTenant}.json`));

  for (const legacyPath of legacyPaths) {
    if (!legacyPath) continue;
    if (!fs.existsSync(legacyPath)) continue;
    try {
      const content = fs.readFileSync(legacyPath, 'utf-8');
      if (!content) continue;
      return JSON.parse(content);
    } catch (error) {
      console.warn(`ManifestStore: failed to parse legacy manifest at ${legacyPath}: ${error.message}`);
    }
  }

  return null;
}

export async function loadManifest(tenantId, personaId = null) {
  const storage = getStorage();
  const key = manifestKey(tenantId, personaId);

  try {
    const buffer = await storage.read(key);
    const text = buffer.toString('utf-8');
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed || null;
  } catch (error) {
    if (isNotFoundError(error)) {
      const legacy = readLegacyManifest(personaId ? `${tenantId}-${personaId}` : tenantId);
      if (legacy) {
        return legacy;
      }
      if (personaId) {
        return loadManifest(tenantId, null);
      }
      return readLegacyManifest(tenantId);
    }
    throw error;
  }
}

export async function saveManifest(tenantId, manifest, personaId = null) {
  const storage = getStorage();
  const key = manifestKey(tenantId, personaId);
  const payload = {
    ...manifest,
    tenantId: sanitizeTenantId(tenantId) || 'default',
    persona: personaId ? sanitizeTenantId(personaId) : manifest.persona || null
  };
  await storage.save(key, payload, { contentType: 'application/json' });
  return key;
}

export async function deleteManifest(tenantId, personaId = null) {
  const storage = getStorage();
  const key = manifestKey(tenantId, personaId);
  try {
    await storage.remove(key);
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.warn(`ManifestStore: failed to delete manifest ${key}: ${error.message}`);
    }
  }

  const safeTenant = sanitizeTenantId(tenantId) || 'default';
  const safePersona = personaId ? sanitizeTenantId(personaId) : null;
  const legacyPaths = [
    path.join(LEGACY_MANIFESTS_DIR, safePersona ? `${safeTenant}-${safePersona}.json` : `${safeTenant}.json`)
  ];
  if (!personaId && safeTenant === 'default') {
    legacyPaths.push(path.join(LEGACY_PROCESSED_DIR, LEGACY_MANIFEST_FILENAME));
  }

  legacyPaths.forEach(legacyPath => {
    if (!legacyPath) return;
    if (!fs.existsSync(legacyPath)) return;
    try {
      fs.unlinkSync(legacyPath);
    } catch (error) {
      console.warn(`ManifestStore: unable to remove legacy manifest ${legacyPath}: ${error.message}`);
    }
  });
}

export function manifestRelativePath(tenantId, personaId = null) {
  const key = manifestKey(tenantId, personaId);
  return key;
}
