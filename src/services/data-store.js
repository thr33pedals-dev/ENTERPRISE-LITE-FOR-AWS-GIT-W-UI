import crypto from 'crypto';
import { getStorage } from '../storage/index.js';

const COLLECTION_PREFIX = process.env.METADATA_STORAGE_PREFIX || 'metadata';

function collectionKey(name) {
  return `${COLLECTION_PREFIX}/${name}.json`;
}

function isNotFoundError(error) {
  if (!error) return false;
  if (error.code === 'ENOENT') return true;
  if (error.name === 'NoSuchKey') return true;
  if (error.$metadata?.httpStatusCode === 404) return true;
  return false;
}

async function readCollection(storage, name) {
  const key = collectionKey(name);
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

async function writeCollection(storage, name, records) {
  const key = collectionKey(name);
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

export class DataStore {
  constructor() {
    this.cache = new Map();
  }

  async list(collection, predicate = null) {
    const storage = getStorage();
    const records = await readCollection(storage, collection);
    if (typeof predicate === 'function') {
      return records.filter(predicate);
    }
    return records;
  }

  async get(collection, id) {
    const records = await this.list(collection);
    return records.find(record => record.id === id) || null;
  }

  async create(collection, input) {
    const storage = getStorage();
    const records = await readCollection(storage, collection);
    const baseRecord = ensureId({ ...input });
    const timestamp = now();
    const record = {
      ...baseRecord,
      createdAt: baseRecord.createdAt || timestamp,
      updatedAt: timestamp
    };
    records.push(record);
    await writeCollection(storage, collection, records);
    return record;
  }

  async update(collection, id, updates = {}) {
    const storage = getStorage();
    const records = await readCollection(storage, collection);
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
    await writeCollection(storage, collection, records);
    return updated;
  }

  async delete(collection, id) {
    const storage = getStorage();
    const records = await readCollection(storage, collection);
    const filtered = records.filter(record => record.id !== id);
    const deleted = records.length !== filtered.length;
    if (deleted) {
      await writeCollection(storage, collection, filtered);
    }
    return deleted;
  }

  async upsert(collection, predicate, payload) {
    const storage = getStorage();
    const records = await readCollection(storage, collection);
    const index = records.findIndex(predicate);
    if (index === -1) {
      const created = await this.create(collection, payload);
      return { record: created, created: true };
    }
    const timestamp = now();
    const updated = {
      ...records[index],
      ...payload,
      updatedAt: timestamp
    };
    records[index] = updated;
    await writeCollection(storage, collection, records);
    return { record: updated, created: false };
  }
}

export default new DataStore();
