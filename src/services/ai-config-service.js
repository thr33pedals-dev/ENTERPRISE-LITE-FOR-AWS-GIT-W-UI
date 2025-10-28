import dataStore from './data-store.js';
import { sanitizeTenantId } from '../file-processor.js';

const COLLECTIONS = {
  sales: 'sales_ai',
  support: 'support_ai',
  interview: 'interview_ai'
};

function resolveCollection(persona) {
  const normalized = String(persona || '').toLowerCase();
  if (!COLLECTIONS[normalized]) {
    throw new Error(`Unsupported persona: ${persona}`);
  }
  return COLLECTIONS[normalized];
}

function normalizeTenant(tenantId) {
  return sanitizeTenantId(tenantId) || 'default';
}

function sanitizePayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

export async function getConfig(persona, tenantId) {
  const collection = resolveCollection(persona);
  const normalizedTenant = normalizeTenant(tenantId);
  const records = await dataStore.list(
    collection,
    record => record?.persona === persona,
    { tenantId: normalizedTenant, personaId: persona }
  );
  return records.length > 0 ? records[0] : null;
}

export async function getById(persona, id, tenantId) {
  if (!id) return null;
  const collection = resolveCollection(persona);
  const normalizedTenant = normalizeTenant(tenantId);
  const record = await dataStore.get(collection, id, { tenantId: normalizedTenant, personaId: persona });
  if (record?.persona !== persona) {
    return null;
  }
  return record;
}

export async function upsertConfig(persona, tenantId, payload) {
  const collection = resolveCollection(persona);
  const normalizedTenant = normalizeTenant(tenantId);
  const input = {
    persona,
    tenantId: normalizedTenant,
    ...sanitizePayload(payload)
  };

  const { record } = await dataStore.upsert(
    collection,
    candidate => candidate?.persona === persona,
    input,
    { tenantId: normalizedTenant, personaId: persona }
  );

  return record;
}

export async function updateConfig(persona, id, tenantId, updates = {}) {
  if (!id) {
    throw new Error('Config ID is required');
  }
  const collection = resolveCollection(persona);
  const normalizedTenant = normalizeTenant(tenantId);
  const sanitizedUpdates = sanitizePayload(updates);
  const updated = await dataStore.update(
    collection,
    id,
    sanitizedUpdates,
    { tenantId: normalizedTenant, personaId: persona }
  );
  return updated;
}

export async function listConfigs(persona, tenantId) {
  const collection = resolveCollection(persona);
  const normalizedTenant = normalizeTenant(tenantId);
  return dataStore.list(
    collection,
    record => record?.persona === persona,
    { tenantId: normalizedTenant, personaId: persona }
  );
}

export default {
  getConfig,
  getById,
  upsertConfig,
  updateConfig,
  listConfigs
};

