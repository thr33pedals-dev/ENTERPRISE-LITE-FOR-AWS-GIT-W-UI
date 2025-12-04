import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function toSafeKey(prefix, key) {
  const normalizedPrefix = (prefix || '').replace(/^\/+|\/+$/g, '');
  const normalizedKey = (key || '').replace(/^\/+/, '');
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedKey}` : normalizedKey;
}

/**
 * Build S3 object tags for billing and tracking
 * @param {Object} options - Tagging options
 * @returns {string} URL-encoded tag string for S3
 */
function buildTagging(options = {}) {
  const tags = [];
  
  if (options.tenantId) {
    tags.push(`tenant-id=${encodeURIComponent(options.tenantId)}`);
  }
  if (options.personaId) {
    tags.push(`persona-id=${encodeURIComponent(options.personaId)}`);
  }
  if (options.companyId) {
    tags.push(`company-id=${encodeURIComponent(options.companyId)}`);
  }
  if (options.fileType) {
    tags.push(`file-type=${encodeURIComponent(options.fileType)}`);
  }
  
  // Add timestamp for billing period tracking
  tags.push(`upload-month=${new Date().toISOString().slice(0, 7)}`);
  
  return tags.length > 0 ? tags.join('&') : undefined;
}

/**
 * Create S3 storage instance
 * @param {Object} config - S3 configuration
 * @param {string} config.bucket - Primary bucket name
 * @param {string} [config.rawBucket] - Raw uploads bucket (optional)
 * @param {string} [config.prefix] - Key prefix for all operations
 * @param {string} config.region - AWS region
 * @param {string} [config.endpoint] - Custom endpoint (for MinIO/LocalStack)
 * @param {boolean} [config.forcePathStyle] - Use path-style URLs
 * @param {number} [config.signingTTLSeconds] - Pre-signed URL TTL
 * @param {Function} [config.bucketResolver] - Future: resolve bucket per tenant
 */
export function createS3Storage({ 
  bucket, 
  rawBucket, 
  prefix = '', 
  region, 
  endpoint, 
  forcePathStyle = false, 
  signingTTLSeconds = 3600,
  bucketResolver = null  // Future: for per-company buckets
}) {
  if (!bucket && !bucketResolver) {
    throw new Error('createS3Storage requires a bucket or bucketResolver');
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle
  });

  const rawClient = rawBucket && rawBucket !== bucket
    ? new S3Client({ region, endpoint, forcePathStyle })
    : client;

  /**
   * Resolve the bucket name for a given tenant
   * Future-proofed for per-company buckets
   */
  function resolveBucket(tenantId, options = {}) {
    // Future: if bucketResolver is provided, use it for per-tenant buckets
    if (bucketResolver && typeof bucketResolver === 'function') {
      const resolved = bucketResolver(tenantId, options);
      if (resolved) return resolved;
    }
    
    // Default: use shared bucket
    if (options.raw === true && rawBucket) {
      return rawBucket;
    }
    return bucket;
  }

  /**
   * Save data to S3 with billing tags
   */
  async function save(key, data, options = {}) {
    const safeKey = toSafeKey(prefix, key);
    const body = (typeof data === 'string' || Buffer.isBuffer(data)) ? data : JSON.stringify(data);

    const targetBucket = resolveBucket(options.tenantId, options);
    const targetClient = options.raw === true && rawBucket ? rawClient : client;

    // Build tagging for billing tracking
    const tagging = buildTagging({
      tenantId: options.tenantId,
      personaId: options.personaId,
      companyId: options.companyId,
      fileType: options.contentType || 'application/octet-stream'
    });

    const putCommand = {
      Bucket: targetBucket,
      Key: safeKey,
      Body: body,
      ContentType: options.contentType
    };

    // Add tagging if we have any tags
    if (tagging) {
      putCommand.Tagging = tagging;
    }

    // Add metadata for additional tracking
    if (options.tenantId || options.personaId) {
      putCommand.Metadata = {
        ...(options.tenantId && { 'tenant-id': options.tenantId }),
        ...(options.personaId && { 'persona-id': options.personaId }),
        ...(options.companyId && { 'company-id': options.companyId }),
        'upload-timestamp': new Date().toISOString()
      };
    }

    await targetClient.send(new PutObjectCommand(putCommand));

    return { 
      key, 
      backend: 's3', 
      bucket: targetBucket, 
      resolvedKey: safeKey,
      tagged: !!tagging
    };
  }

  /**
   * Read data from S3
   */
  async function read(key, options = {}) {
    const safeKey = toSafeKey(prefix, key);
    const targetBucket = resolveBucket(options.tenantId, options);
    
    const result = await client.send(new GetObjectCommand({ 
      Bucket: targetBucket, 
      Key: safeKey 
    }));
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  /**
   * Read and parse JSON from S3
   */
  async function readJson(key, options = {}) {
    const body = await read(key, options);
    return JSON.parse(Buffer.from(body).toString('utf-8'));
  }

  /**
   * Check if key exists in S3
   */
  async function exists(key, options = {}) {
    const safeKey = toSafeKey(prefix, key);
    const targetBucket = resolveBucket(options.tenantId, options);
    
    try {
      await client.send(new HeadObjectCommand({ 
        Bucket: targetBucket, 
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
   * Delete object from S3
   */
  async function remove(key, options = {}) {
    const safeKey = toSafeKey(prefix, key);
    const targetBucket = resolveBucket(options.tenantId, options);
    
    await client.send(new DeleteObjectCommand({ 
      Bucket: targetBucket, 
      Key: safeKey 
    }));
    return true;
  }

  /**
   * Get pre-signed download URL
   */
  async function getDownloadUrl(key, ttlSeconds = signingTTLSeconds, options = {}) {
    const safeKey = toSafeKey(prefix, key);
    const targetBucket = resolveBucket(options.tenantId, options);
    
    const command = new GetObjectCommand({ 
      Bucket: targetBucket, 
      Key: safeKey 
    });
    return getSignedUrl(client, command, { expiresIn: ttlSeconds });
  }

  /**
   * List objects with a prefix (useful for tenant data enumeration)
   */
  async function list(keyPrefix, options = {}) {
    const safePrefix = toSafeKey(prefix, keyPrefix);
    const targetBucket = resolveBucket(options.tenantId, options);
    
    const result = await client.send(new ListObjectsV2Command({
      Bucket: targetBucket,
      Prefix: safePrefix,
      MaxKeys: options.maxKeys || 1000
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
   * Calculate storage usage for a tenant (for billing)
   */
  async function getTenantStorageUsage(tenantId, personaId) {
    const keyPrefix = personaId 
      ? `${tenantId}/${personaId}` 
      : tenantId;
    
    let totalSize = 0;
    let totalObjects = 0;
    let continuationToken;
    
    do {
      const result = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: keyPrefix,
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
      personaId,
      totalBytes: totalSize,
      totalMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      totalObjects,
      calculatedAt: new Date().toISOString()
    };
  }

  return {
    backend: 's3',
    bucket,
    rawBucket,
    prefix,
    save,
    read,
    readJson,
    exists,
    remove,
    getDownloadUrl,
    list,
    getTenantStorageUsage,
    resolveBucket  // Exposed for future per-company bucket support
  };
}
