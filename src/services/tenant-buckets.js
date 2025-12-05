/**
 * Per-Tenant S3 Bucket Management
 * Creates and manages separate S3 buckets for each customer
 */

import { 
  S3Client, 
  CreateBucketCommand, 
  DeleteBucketCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutPublicAccessBlockCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import logger from '../utils/logger.js';

const REGION = process.env.AWS_REGION || process.env.S3_REGION || 'ap-southeast-1';
const BUCKET_PREFIX = process.env.BUCKET_PREFIX || 'enterprise-lite';

// Initialize S3 client
const s3Client = new S3Client({ region: REGION });

// In-memory cache of tenant buckets (in production, store in DynamoDB)
const tenantBucketsCache = new Map();

/**
 * Generate bucket names for a tenant
 */
export function getTenantBucketNames(tenantId) {
  const safeTenantId = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 40);
  return {
    documents: `${BUCKET_PREFIX}-${safeTenantId}-documents`,
    raw: `${BUCKET_PREFIX}-${safeTenantId}-raw`
  };
}

/**
 * Check if a bucket exists
 */
export async function bucketExists(bucketName) {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Create S3 buckets for a new tenant
 */
export async function createTenantBuckets(tenantId, companyName) {
  const bucketNames = getTenantBucketNames(tenantId);
  const createdBuckets = [];

  logger.info('Creating tenant buckets', { tenantId, bucketNames });

  for (const [type, bucketName] of Object.entries(bucketNames)) {
    try {
      // Check if bucket already exists
      if (await bucketExists(bucketName)) {
        logger.info('Bucket already exists', { bucketName });
        createdBuckets.push({ type, bucketName, existed: true });
        continue;
      }

      // Create bucket
      const createParams = {
        Bucket: bucketName
      };
      
      // Add location constraint for non-us-east-1 regions
      if (REGION !== 'us-east-1') {
        createParams.CreateBucketConfiguration = {
          LocationConstraint: REGION
        };
      }

      await s3Client.send(new CreateBucketCommand(createParams));

      // Block public access
      await s3Client.send(new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true
        }
      }));

      // Enable versioning for documents bucket
      if (type === 'documents') {
        await s3Client.send(new PutBucketVersioningCommand({
          Bucket: bucketName,
          VersioningConfiguration: { Status: 'Enabled' }
        }));
      }

      // Add tags for billing and identification
      await s3Client.send(new PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: {
          TagSet: [
            { Key: 'tenant-id', Value: tenantId },
            { Key: 'company-name', Value: companyName || tenantId },
            { Key: 'bucket-type', Value: type },
            { Key: 'managed-by', Value: 'enterprise-lite-platform' },
            { Key: 'created-at', Value: new Date().toISOString() }
          ]
        }
      }));

      logger.info('Bucket created successfully', { bucketName, type });
      createdBuckets.push({ type, bucketName, created: true });

    } catch (error) {
      logger.error('Failed to create bucket', { bucketName, error: error.message });
      throw error;
    }
  }

  // Cache the bucket names
  tenantBucketsCache.set(tenantId, bucketNames);

  return {
    success: true,
    tenantId,
    buckets: bucketNames,
    details: createdBuckets
  };
}

/**
 * Get bucket names for a tenant (from cache or generate)
 */
export function getTenantBuckets(tenantId) {
  if (tenantBucketsCache.has(tenantId)) {
    return tenantBucketsCache.get(tenantId);
  }
  
  const bucketNames = getTenantBucketNames(tenantId);
  tenantBucketsCache.set(tenantId, bucketNames);
  return bucketNames;
}

/**
 * Check if tenant has dedicated buckets
 */
export async function tenantHasDedicatedBuckets(tenantId) {
  const bucketNames = getTenantBucketNames(tenantId);
  return await bucketExists(bucketNames.documents);
}

/**
 * Delete all objects in a bucket
 */
async function emptyBucket(bucketName) {
  let continuationToken;
  
  do {
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken
    }));

    if (listResult.Contents && listResult.Contents.length > 0) {
      for (const obj of listResult.Contents) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: obj.Key
        }));
      }
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);
}

/**
 * Delete tenant buckets (for offboarding)
 * WARNING: This deletes all customer data!
 */
export async function deleteTenantBuckets(tenantId, confirmDelete = false) {
  if (!confirmDelete) {
    throw new Error('Must confirm deletion by passing confirmDelete=true');
  }

  const bucketNames = getTenantBucketNames(tenantId);
  const deletedBuckets = [];

  logger.warn('Deleting tenant buckets', { tenantId, bucketNames });

  for (const [type, bucketName] of Object.entries(bucketNames)) {
    try {
      // Check if bucket exists
      if (!await bucketExists(bucketName)) {
        logger.info('Bucket does not exist, skipping', { bucketName });
        continue;
      }

      // Empty the bucket first
      await emptyBucket(bucketName);

      // Delete the bucket
      await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
      
      logger.info('Bucket deleted', { bucketName });
      deletedBuckets.push({ type, bucketName, deleted: true });

    } catch (error) {
      logger.error('Failed to delete bucket', { bucketName, error: error.message });
      deletedBuckets.push({ type, bucketName, deleted: false, error: error.message });
    }
  }

  // Remove from cache
  tenantBucketsCache.delete(tenantId);

  return {
    success: deletedBuckets.every(b => b.deleted !== false),
    tenantId,
    deletedBuckets
  };
}

/**
 * Register existing buckets for a tenant (if created manually)
 */
export function registerTenantBuckets(tenantId, documentsBucket, rawBucket) {
  const buckets = {
    documents: documentsBucket,
    raw: rawBucket
  };
  tenantBucketsCache.set(tenantId, buckets);
  logger.debug('Registered tenant buckets', { tenantId, buckets });
  return buckets;
}

/**
 * List all tenant buckets (for admin)
 */
export async function listAllTenantBuckets() {
  // In production, query DynamoDB for all tenants
  // For now, return cached tenants
  return Array.from(tenantBucketsCache.entries()).map(([tenantId, buckets]) => ({
    tenantId,
    ...buckets
  }));
}

export default {
  getTenantBucketNames,
  getTenantBuckets,
  createTenantBuckets,
  deleteTenantBuckets,
  tenantHasDedicatedBuckets,
  registerTenantBuckets,
  listAllTenantBuckets,
  bucketExists
};




