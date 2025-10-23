import crypto from 'crypto';
import { getStorage } from '../storage/index.js';

const COLLECTION_PREFIX = process.env.METADATA_STORAGE_PREFIX || 'metadata';

function collectionPrefixForTenant(tenantId) {
  const safeTenant = (tenantId || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'default';
  return `${COLLECTION_PREFIX}/${safeTenant}`;
}

function collectionKey(name, tenantId) {
  const prefix = collectionPrefixForTenant(tenantId);
  return `${prefix}/${name}.json`;
}

function isNotFoundError(error) {
  if (!error) return false;
  if (error.code === 'ENOENT') return true;
  if (error.name === 'NoSuchKey') return true;
  if (error.$metadata?.httpStatusCode === 404) return true;
  return false;
}

async function readCollection(storage, name, tenantId) {
  const key = collectionKey(name, tenantId);
  try {
    const buffer = await storage.read(key);
    const text = buffer.toString('utf-8');
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

async function writeCollection(storage, name, tenantId, records) {
  const key = collectionKey(name, tenantId);
  await storage.save(key, records, { contentType: 'application/json' });
}

function now() {
  return new Date().toISOString();
}

function ensureId(record) {
  if (record && record.id) {
    return record;
  }
  return { ...record, id: crypto.randomUUID() };
}

function materializeRecord(record = {}, tenantId) {
  if (!record) return null;
  return {
    ...record,
    tenantId: record.tenantId || tenantId || null
  };
}

export class DataStore {
  constructor() {
    this.cache = new Map();
  }

  async list(collection, predicate = null, options = {}) {
    const storage = getStorage({ prefix: options.prefix });
    const records = await readCollection(storage, collection, options.tenantId);
    const materialized = Array.isArray(records)
      ? records.map(record => materializeRecord(record, options.tenantId))
      : [];
    if (typeof predicate === 'function') {
      return materialized.filter(predicate);
    }
    return materialized;
  }

  async get(collection, id, options = {}) {
    const records = await this.list(collection, null, options);
    return records.find(record => record.id === id) || null;
  }

  async create(collection, input, options = {}) {
    const storage = getStorage({ prefix: options.prefix });
    const records = await readCollection(storage, collection, options.tenantId);
    const baseRecord = ensureId({ ...input });
    const timestamp = now();
    const record = {
      ...baseRecord,
      createdAt: baseRecord.createdAt || timestamp,
      updatedAt: timestamp
    };
    records.push(record);
    await writeCollection(storage, collection, options.tenantId, records);
    return materializeRecord(record, options.tenantId);
  }

  async update(collection, id, updates = {}, options = {}) {
    const storage = getStorage({ prefix: options.prefix });
    const records = await readCollection(storage, collection, options.tenantId);
    const index = records.findIndex(record => record.id === id);
    if (index === -1) {
      throw new Error(`Record not found in ${collection}: ${id}`);
    }
    const timestamp = now();
    const updated = {
      ...records[index],
      ...updates,
      updatedAt: timestamp
    };
    records[index] = updated;
    await writeCollection(storage, collection, options.tenantId, records);
    return materializeRecord(updated, options.tenantId);
  }

  async delete(collection, id, options = {}) {
    const storage = getStorage({ prefix: options.prefix });
    const records = await readCollection(storage, collection, options.tenantId);
    const filtered = records.filter(record => record.id !== id);
    const deleted = records.length !== filtered.length;
    if (deleted) {
      await writeCollection(storage, collection, options.tenantId, filtered);
    }
    return deleted;
  }

  async upsert(collection, predicate, payload, options = {}) {
    const storage = getStorage({ prefix: options.prefix });
    const records = await readCollection(storage, collection, options.tenantId);
    const index = records.findIndex(predicate);
    if (index === -1) {
      const created = await this.create(collection, payload, options);
      return { record: created, created: true };
    }
    const timestamp = now();
    const updated = {
      ...records[index],
      ...payload,
      updatedAt: timestamp
    };
    records[index] = updated;
    await writeCollection(storage, collection, options.tenantId, records);
    return { record: materializeRecord(updated, options.tenantId), created: false };
  }
}

export default new DataStore();
