import path from 'path';
import { fileURLToPath } from 'url';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';
import { 
  hasDedicatedAccount, 
  createCrossAccountStorage, 
  registerTenantAccount,
  getTenantAccount 
} from './cross-account-s3.js';
import {
  getTenantBuckets,
  tenantHasDedicatedBuckets,
  createTenantBuckets
} from '../services/tenant-buckets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const storageCache = new Map();
const crossAccountStorageCache = new Map();
const tenantStorageCache = new Map();

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
    const processedBucket = rawOptions.bucket || process.env.S3_BUCKET;
    if (!processedBucket) {
      throw new Error('STORAGE_BACKEND is set to "s3" but S3_BUCKET is not configured.');
    }

    return {
      backend,
      bucket: processedBucket,
      rawBucket: rawOptions.rawBucket || process.env.S3_RAW_BUCKET || processedBucket,
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
    rawBucket: resolved.rawBucket,
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
    rawBucket: resolved.rawBucket,
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
  crossAccountStorageCache.clear();
}

/**
 * Get storage for a specific tenant
 * Priority: 1) Cross-account storage, 2) Per-tenant buckets, 3) Shared storage
 * @param {string} tenantId - Tenant identifier
 * @param {Object} options - Storage options
 */
export function getStorageForTenant(tenantId, options = {}) {
  // Priority 1: Check if tenant has a dedicated AWS account
  if (hasDedicatedAccount(tenantId)) {
    const cacheKey = `cross-account:${tenantId}:${options.prefix || ''}`;
    
    if (!options.forceNew && crossAccountStorageCache.has(cacheKey)) {
      return crossAccountStorageCache.get(cacheKey);
    }
    
    const instance = createCrossAccountStorage(tenantId, options);
    crossAccountStorageCache.set(cacheKey, instance);
    return instance;
  }
  
  // Priority 2: Check if per-tenant buckets are enabled
  const perTenantBuckets = process.env.PER_TENANT_BUCKETS === 'true';
  
  if (perTenantBuckets && tenantId && tenantId !== 'default') {
    const cacheKey = `tenant-bucket:${tenantId}:${options.prefix || ''}`;
    
    if (!options.forceNew && tenantStorageCache.has(cacheKey)) {
      return tenantStorageCache.get(cacheKey);
    }
    
    // Get tenant-specific bucket names
    const tenantBuckets = getTenantBuckets(tenantId);
    
    // Create storage instance for this tenant's buckets
    const instance = createS3Storage({
      bucket: tenantBuckets.documents,
      rawBucket: tenantBuckets.raw,
      prefix: options.prefix || '',
      region: process.env.S3_REGION || process.env.AWS_REGION,
      signingTTLSeconds: parseInt(process.env.S3_SIGNED_URL_TTL || '3600', 10)
    });
    
    tenantStorageCache.set(cacheKey, instance);
    return instance;
  }
  
  // Priority 3: Use shared storage (default behavior)
  return getStorage(options);
}

/**
 * Register a tenant's dedicated AWS account
 * Call this after provisioning a new account via Account Factory
 */
export function registerTenantAWSAccount(tenantId, config) {
  registerTenantAccount(tenantId, config);
}

/**
 * Check if a tenant has a dedicated AWS account
 */
export function tenantHasDedicatedAccount(tenantId) {
  return hasDedicatedAccount(tenantId);
}

/**
 * Get tenant's AWS account configuration
 */
export function getTenantAWSAccount(tenantId) {
  return getTenantAccount(tenantId);
}

// Re-export cross-account utilities
export { 
  hasDedicatedAccount, 
  createCrossAccountStorage, 
  registerTenantAccount 
} from './cross-account-s3.js';

// Re-export tenant bucket utilities
export {
  getTenantBuckets,
  createTenantBuckets,
  tenantHasDedicatedBuckets
} from '../services/tenant-buckets.js';

