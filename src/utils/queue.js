import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient } from './aws-clients.js';
import { logger } from './logger.js';

const queueUrl = process.env.SQS_PROCESSING_QUEUE_URL;

export async function enqueueProcessingJob(payload) {
  if (!queueUrl) {
    throw new Error('SQS_PROCESSING_QUEUE_URL not configured');
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload)
    })
  );

  logger.info({ msg: 'Queued processing job', queueUrl, jobType: payload.type, tenantId: payload.tenantId });
}

