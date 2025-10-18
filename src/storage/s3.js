import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function toSafeKey(prefix, key) {
  const normalizedPrefix = (prefix || '').replace(/^\/+|\/+$/g, '');
  const normalizedKey = (key || '').replace(/^\/+/, '');
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedKey}` : normalizedKey;
}

export function createS3Storage({ bucket, prefix = '', region, endpoint, forcePathStyle = false, signingTTLSeconds = 3600 }) {
  if (!bucket) {
    throw new Error('createS3Storage requires a bucket');
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle
  });

  async function save(key, data, options = {}) {
    const safeKey = toSafeKey(prefix, key);
    const body = (typeof data === 'string' || Buffer.isBuffer(data)) ? data : JSON.stringify(data, null, 2);

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: safeKey,
      Body: body,
      ContentType: options.contentType
    }));

    return { key, backend: 's3', bucket, resolvedKey: safeKey };
  }

  async function read(key) {
    const safeKey = toSafeKey(prefix, key);
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: safeKey }));
    return result.Body.transformToByteArray();
  }

  async function readJson(key) {
    const body = await read(key);
    return JSON.parse(Buffer.from(body).toString('utf-8'));
  }

  async function exists(key) {
    const safeKey = toSafeKey(prefix, key);
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: safeKey }));
      return true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
        return false;
      }
      throw err;
    }
  }

  async function remove(key) {
    const safeKey = toSafeKey(prefix, key);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: safeKey }));
    return true;
  }

  async function getDownloadUrl(key, ttlSeconds = signingTTLSeconds) {
    const safeKey = toSafeKey(prefix, key);
    const command = new GetObjectCommand({ Bucket: bucket, Key: safeKey });
    return getSignedUrl(client, command, { expiresIn: ttlSeconds });
  }

  return {
    backend: 's3',
    bucket,
    prefix,
    save,
    read,
    readJson,
    exists,
    remove,
    getDownloadUrl
  };
}

