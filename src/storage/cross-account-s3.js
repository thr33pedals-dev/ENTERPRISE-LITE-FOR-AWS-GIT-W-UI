/**
 * Cross-Account S3 Storage for Multi-Account Architecture
 * Handles S3 operations in customer AWS accounts via STS assume role
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger.js';

const REGION = process.env.AWS_REGION || process.env.S3_REGION || 'ap-southeast-1';
const CROSS_ACCOUNT_ROLE_NAME = process.env.CROSS_ACCOUNT_ROLE_NAME || 'EnterpriseLitePlatformRole';
const BUCKET_PREFIX = process.env.BUCKET_PREFIX || 'enterprise-lite';

// STS client for assuming roles
const stsClient = new STSClient({ region: REGION });

// Cache for assumed credentials (per account)
const credentialsCache = new Map();
const CREDENTIALS_CACHE_TTL = 50 * 60 * 1000; // 50 minutes (roles are valid for 1 hour)

/**
 * Tenant account configuration
 * In production, this would be stored in DynamoDB
 */
const tenantAccounts = new Map();

/**
 * Register a tenant's AWS account configuration
 */
export function registerTenantAccount(tenantId, config) {
  tenantAccounts.set(tenantId, {
    accountId: config.accountId,
    roleArn: config.roleArn || `arn:aws:iam::${config.accountId}:role/${CROSS_ACCOUNT_ROLE_NAME}`,
    documentsBucket: config.documentsBucket || `${BUCKET_PREFIX}-${tenantId}-documents`,
    rawBucket: config.rawBucket || `${BUCKET_PREFIX}-${tenantId}-raw`,
    region: config.region || REGION,
    externalId: config.externalId || tenantId
  });
  
  logger.debug('Tenant account registered', { tenantId, accountId: config.accountId });
}

/**
 * Get tenant account configuration
 */
export function getTenantAccount(tenantId) {
  return tenantAccounts.get(tenantId) || null;
}

/**
 * Check if tenant has a dedicated AWS account
 */
export function hasDedicatedAccount(tenantId) {
  return tenantAccounts.has(tenantId);
}

/**
 * Assume role in customer account and get credentials
 */
async function assumeCustomerRole(tenantId) {
  const tenantConfig = getTenantAccount(tenantId);
  if (!tenantConfig) {
    throw new Error(`No account configuration found for tenant: ${tenantId}`);
  }

  // Check cache
  const cacheKey = tenantConfig.accountId;
  const cached = credentialsCache.get(cacheKey);
  if (cached && cached.expiration > Date.now()) {
    return cached.credentials;
  }

  logger.debug('Assuming role for tenant', { tenantId, accountId: tenantConfig.accountId });

  try {
    const result = await stsClient.send(new AssumeRoleCommand({
      RoleArn: tenantConfig.roleArn,
      RoleSessionName: `platform-${tenantId}-${Date.now()}`,
      ExternalId: tenantConfig.externalId,
      DurationSeconds: 3600
    }));

    const credentials = {
      accessKeyId: result.Credentials.AccessKeyId,
      secretAccessKey: result.Credentials.SecretAccessKey,
      sessionToken: result.Credentials.SessionToken
    };

    // Cache the credentials
    credentialsCache.set(cacheKey, {
      credentials,
      expiration: Date.now() + CREDENTIALS_CACHE_TTL
    });

    return credentials;
  } catch (error) {
    logger.error('Failed to assume role', { tenantId, roleArn: tenantConfig.roleArn, error: error.message });
    throw error;
  }
}

/**
 * Get S3 client for a tenant's account
 */
async function getS3ClientForTenant(tenantId) {
  const tenantConfig = getTenantAccount(tenantId);
  if (!tenantConfig) {
    throw new Error(`No account configuration found for tenant: ${tenantId}`);
  }

  const credentials = await assumeCustomerRole(tenantId);

  return new S3Client({
    region: tenantConfig.region,
    credentials
  });
}

/**
 * Get bucket name for a tenant
 */
function getBucketForTenant(tenantId, options = {}) {
  const tenantConfig = getTenantAccount(tenantId);
  if (!tenantConfig) {
    throw new Error(`No account configuration found for tenant: ${tenantId}`);
  }

  return options.raw ? tenantConfig.rawBucket : tenantConfig.documentsBucket;
}

/**
 * Build safe key with optional prefix
 */
function toSafeKey(prefix, key) {
  const normalizedPrefix = (prefix || '').replace(/^\/+|\/+$/g, '');
  const normalizedKey = (key || '').replace(/^\/+/, '');
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedKey}` : normalizedKey;
}

/**
 * Create cross-account S3 storage instance for a tenant
 */
export function createCrossAccountStorage(tenantId, options = {}) {
  const prefix = options.prefix || '';

  /**
   * Save data to tenant's S3 bucket
   */
  async function save(key, data, saveOptions = {}) {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId, saveOptions);
    const safeKey = toSafeKey(prefix, key);
    
    const body = (typeof data === 'string' || Buffer.isBuffer(data)) ? data : JSON.stringify(data);

    const putCommand = {
      Bucket: bucket,
      Key: safeKey,
      Body: body,
      ContentType: saveOptions.contentType || 'application/octet-stream'
    };

    // Add metadata
    putCommand.Metadata = {
      'tenant-id': tenantId,
      'upload-timestamp': new Date().toISOString(),
      ...(saveOptions.personaId && { 'persona-id': saveOptions.personaId })
    };

    await s3Client.send(new PutObjectCommand(putCommand));

    logger.debug('Saved to cross-account bucket', { tenantId, bucket, key: safeKey });

    return {
      key,
      backend: 's3-cross-account',
      bucket,
      resolvedKey: safeKey,
      accountId: getTenantAccount(tenantId).accountId
    };
  }

  /**
   * Read data from tenant's S3 bucket
   */
  async function read(key, readOptions = {}) {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId, readOptions);
    const safeKey = toSafeKey(prefix, key);

    const result = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: safeKey
    }));

    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  /**
   * Read and parse JSON
   */
  async function readJson(key, readOptions = {}) {
    const body = await read(key, readOptions);
    return JSON.parse(Buffer.from(body).toString('utf-8'));
  }

  /**
   * Check if key exists
   */
  async function exists(key, existsOptions = {}) {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId, existsOptions);
    const safeKey = toSafeKey(prefix, key);

    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: safeKey
      }));
      return true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Delete object
   */
  async function remove(key, removeOptions = {}) {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId, removeOptions);
    const safeKey = toSafeKey(prefix, key);

    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: safeKey
    }));

    return true;
  }

  /**
   * Get pre-signed download URL
   */
  async function getDownloadUrl(key, ttlSeconds = 3600, urlOptions = {}) {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId, urlOptions);
    const safeKey = toSafeKey(prefix, key);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: safeKey
    });

    return getSignedUrl(s3Client, command, { expiresIn: ttlSeconds });
  }

  /**
   * List objects with prefix
   */
  async function list(keyPrefix, listOptions = {}) {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId, listOptions);
    const safePrefix = toSafeKey(prefix, keyPrefix);

    const result = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: safePrefix,
      MaxKeys: listOptions.maxKeys || 1000
    }));

    return {
      keys: (result.Contents || []).map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified
      })),
      truncated: result.IsTruncated,
      nextToken: result.NextContinuationToken
    };
  }

  /**
   * Get storage usage for billing
   */
  async function getStorageUsage() {
    const s3Client = await getS3ClientForTenant(tenantId);
    const bucket = getBucketForTenant(tenantId);

    let totalSize = 0;
    let totalObjects = 0;
    let continuationToken;

    do {
      const result = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken
      }));

      for (const obj of result.Contents || []) {
        totalSize += obj.Size || 0;
        totalObjects++;
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return {
      tenantId,
      accountId: getTenantAccount(tenantId).accountId,
      bucket,
      totalBytes: totalSize,
      totalMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      totalObjects,
      calculatedAt: new Date().toISOString()
    };
  }

  return {
    backend: 's3-cross-account',
    tenantId,
    accountId: getTenantAccount(tenantId)?.accountId,
    save,
    read,
    readJson,
    exists,
    remove,
    getDownloadUrl,
    list,
    getStorageUsage
  };
}

/**
 * Get storage instance - automatically chooses shared or cross-account
 */
export function getStorageForTenant(tenantId, sharedStorage, options = {}) {
  // If tenant has a dedicated account, use cross-account storage
  if (hasDedicatedAccount(tenantId)) {
    return createCrossAccountStorage(tenantId, options);
  }
  
  // Otherwise, use shared storage
  return sharedStorage;
}

export default {
  registerTenantAccount,
  getTenantAccount,
  hasDedicatedAccount,
  createCrossAccountStorage,
  getStorageForTenant
};




