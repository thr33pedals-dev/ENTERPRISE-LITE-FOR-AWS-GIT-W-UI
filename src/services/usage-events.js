import { DataStore } from './data-store.js';

const DEFAULT_STREAM_NAME = process.env.FIREHOSE_STREAM_NAME || '';
const ANALYTICS_COLLECTION = 'usage_analytics';

let firehoseClient = null;
const dataStore = new DataStore();

async function getFirehoseClient() {
  if (!DEFAULT_STREAM_NAME) {
    return null;
  }

  if (firehoseClient) {
    return firehoseClient;
  }

  try {
    const { FirehoseClient, PutRecordCommand } = await import('@aws-sdk/client-firehose');
    firehoseClient = {
      client: new FirehoseClient({
        region: process.env.AWS_REGION || process.env.FIREHOSE_REGION || 'us-east-1',
        endpoint: process.env.FIREHOSE_ENDPOINT,
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          : undefined
      }),
      PutRecordCommand
    };
    return firehoseClient;
  } catch (error) {
    console.warn('UsageEvents: unable to load Firehose client:', error.message);
    return null;
  }
}

// S3-based analytics storage (no Firehose needed)
async function emitToS3(event) {
  try {
    await dataStore.create(ANALYTICS_COLLECTION, event, {
      tenantId: event.tenantId || 'default',
      personaId: event.persona || null
    });
    return true;
  } catch (error) {
    console.warn('UsageEvents: failed to write to S3:', error.message);
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function buildBaseEvent({ tenantId, organizationId, persona, action, metadata }) {
  return {
    tenantId,
    organizationId: organizationId || null,
    persona: persona || null,
    action,
    occurredAt: nowIso(),
    metadata: metadata || {}
  };
}

async function emitFirehose(event) {
  const clientBundle = await getFirehoseClient();
  if (!clientBundle) {
    return false;
  }

  const { client, PutRecordCommand } = clientBundle;
  const payload = JSON.stringify(event);

  try {
    await client.send(new PutRecordCommand({
      DeliveryStreamName: DEFAULT_STREAM_NAME,
      Record: {
        Data: Buffer.from(`${payload}\n`, 'utf-8')
      }
    }));
    return true;
  } catch (error) {
    console.warn('UsageEvents: failed to emit to Firehose:', error.message);
    return false;
  }
}

async function emitLocal(event) {
  if (!process.env.USAGE_EVENTS_DIR) {
    return false;
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(process.env.USAGE_EVENTS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(event, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.warn('UsageEvents: failed to write local event:', error.message);
    return false;
  }
}

export async function emitUsageEvent(event = {}) {
  if (!event.action) {
    console.warn('UsageEvents: action is required');
    return false;
  }

  const baseEvent = buildBaseEvent(event);
  const results = await Promise.all([
    emitToS3(baseEvent),      // Always store to S3
    emitFirehose(baseEvent),  // Optional: also to Firehose if configured
    emitLocal(baseEvent)      // Optional: also to local if configured
  ]);

  return results.some(success => success);
}

export function buildUsageEvent({ tenantId, organizationId, persona, action, metadata }) {
  return buildBaseEvent({ tenantId, organizationId, persona, action, metadata });
}
