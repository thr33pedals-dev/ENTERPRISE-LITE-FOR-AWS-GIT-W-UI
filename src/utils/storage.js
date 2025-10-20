import path from 'path';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, dynamoDocClient } from './aws-clients.js';
import { logger } from './logger.js';
import fs from 'node:fs';

const uploadBucket = process.env.S3_UPLOAD_BUCKET;
const processedBucket = process.env.S3_PROCESSED_BUCKET;
const manifestTable = process.env.DYNAMODB_MANIFEST_TABLE;

async function streamToString(stream) {
  if (typeof stream.text === 'function') {
    return stream.text();
  }

  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

function sanitizeFileName(filename) {
  const base = path.basename(filename);
  const safe = base.replace(/[^a-zA-Z0-9-_\.]+/g, '-');
  if (!safe || safe === '.' || safe === '..') {
    throw new Error('Invalid filename');
  }
  return safe;
}

export async function uploadOriginalFile({ tenantId, file }) {
  if (!uploadBucket) {
    logger.warn({ msg: 'Upload bucket not configured; skipping original file upload.' });
    return null;
  }

  const safeName = sanitizeFileName(file.originalname);
  const key = `${tenantId}/raw/${Date.now()}-${safeName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: uploadBucket,
      Key: key,
      Body: await fs.promises.readFile(file.path),
      ContentType: file.mimetype || 'application/octet-stream'
    })
  );

  return key;
}

export async function storeProcessedArtifact({ tenantId, file, index }) {
  if (!processedBucket) {
    throw new Error('S3_PROCESSED_BUCKET not configured');
  }

  const safeName = sanitizeFileName(file.originalName);
  const baseKey = `${tenantId}/${Date.now()}-${index}/${safeName}`;

  const uploads = [];

  if (file.fileType === 'excel') {
    uploads.push(
      s3Client.send(
        new PutObjectCommand({
          Bucket: processedBucket,
          Key: `${baseKey}.json`,
          Body: Buffer.from(JSON.stringify(file.data, null, 2)),
          ContentType: 'application/json'
        })
      )
    );

    const textContent = file.data
      .map((row, i) => {
        const rowText = file.metadata.columns
          .map(col => `${col}: ${row[col] || 'N/A'}`)
          .join(', ');
        return `Row ${i + 1}: ${rowText}`;
      })
      .join('\n');

    uploads.push(
      s3Client.send(
        new PutObjectCommand({
          Bucket: processedBucket,
          Key: `${baseKey}.txt`,
          Body: Buffer.from(textContent),
          ContentType: 'text/plain'
        })
      )
    );
  } else {
    const textPayload = file.data?.fullText
      ? file.data.fullText
      : [
          '### Vision Processing Required ###',
          `Original file: ${file.originalName}`,
          file.triage?.reason ? `Reason: ${file.triage.reason}` : 'Reason: Escalated to Path C',
          file.triage?.recommendedTool
            ? `Recommended tool: ${file.triage.recommendedTool}`
            : 'Recommended tool: process_pdf_with_vlm',
          file.metadata?.preview ? `Preview snippet: ${file.metadata.preview}` : ''
        ]
          .filter(Boolean)
          .join('\n');

    uploads.push(
      s3Client.send(
        new PutObjectCommand({
          Bucket: processedBucket,
          Key: `${baseKey}.txt`,
          Body: Buffer.from(textPayload),
          ContentType: 'text/plain'
        })
      )
    );

    uploads.push(
      s3Client.send(
        new PutObjectCommand({
          Bucket: processedBucket,
          Key: `${baseKey}_meta.json`,
          Body: Buffer.from(JSON.stringify({
            originalName: file.originalName,
            fileType: file.fileType,
            metadata: file.metadata,
            triage: file.triage || null
          }, null, 2)),
          ContentType: 'application/json'
        })
      )
    );
  }

  await Promise.all(uploads);

  return {
    type: file.fileType,
    name: file.originalName,
    s3BaseKey: baseKey
  };
}

export async function saveManifest({ tenantId, manifest }) {
  if (!manifestTable) {
    throw new Error('DYNAMODB_MANIFEST_TABLE not configured');
  }

  await dynamoDocClient.send(
    new PutCommand({
      TableName: manifestTable,
      Item: {
        tenantId,
        manifestId: 'latest',
        manifest,
        updatedAt: new Date().toISOString()
      }
    })
  );
}

export async function loadManifest(tenantId) {
  if (!manifestTable) {
    throw new Error('DYNAMODB_MANIFEST_TABLE not configured');
  }

  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: manifestTable,
      Key: {
        tenantId,
        manifestId: 'latest'
      }
    })
  );

  return result.Item?.manifest || null;
}

export async function deleteManifest(tenantId) {
  if (!manifestTable) {
    return;
  }

  await dynamoDocClient.send(
    new DeleteCommand({
      TableName: manifestTable,
      Key: {
        tenantId,
        manifestId: 'latest'
      }
    })
  );
}

export async function fetchStructuredDataFromS3(baseKey) {
  if (!processedBucket) return null;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: processedBucket,
        Key: `${baseKey}.json`
      })
    );
    const body = await streamToString(response.Body);
    return JSON.parse(body);
  } catch (error) {
    logger.warn({ msg: 'Failed to fetch structured data from S3', baseKey, error: error.message });
    return null;
  }
}

export async function fetchTextArtifactFromS3(baseKey) {
  if (!processedBucket) return null;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: processedBucket,
        Key: `${baseKey}.txt`
      })
    );
    return await streamToString(response.Body);
  } catch (error) {
    logger.warn({ msg: 'Failed to fetch text artifact from S3', baseKey, error: error.message });
    return null;
  }
}

export async function deleteArtifactsForFile(baseKey) {
  if (!processedBucket || !baseKey) return;

  try {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: processedBucket,
        Delete: {
          Objects: [
            { Key: `${baseKey}.json` },
            { Key: `${baseKey}.txt` },
            { Key: `${baseKey}_meta.json` }
          ]
        }
      })
    );
  } catch (error) {
    logger.warn({ msg: 'Failed to delete processed artifacts', baseKey, error: error.message });
  }
}

export async function deleteAllTenantArtifacts(tenantId) {
  if (!processedBucket) return;

  let continuationToken;
  const prefix = `${tenantId}/`;

  do {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: processedBucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: processedBucket,
          Delete: {
            Objects: listResponse.Contents.map(item => ({ Key: item.Key }))
          }
        })
      );
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);
}

export function ensureAwsConfig() {
  if (!uploadBucket || !processedBucket || !manifestTable) {
    logger.warn({
      msg: 'AWS storage configuration incomplete',
      uploadBucketConfigured: Boolean(uploadBucket),
      processedBucketConfigured: Boolean(processedBucket),
      manifestTableConfigured: Boolean(manifestTable)
    });
  }
}

export const storageHelpers = {
  sanitizeFileName,
  streamToString
};

