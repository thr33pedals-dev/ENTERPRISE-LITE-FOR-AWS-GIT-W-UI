import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { SQSClient } from '@aws-sdk/client-sqs';

const region = process.env.AWS_REGION || 'us-east-1';

export const s3Client = new S3Client({ region });

const baseDynamoClient = new DynamoDBClient({ region });
export const dynamoDocClient = DynamoDBDocumentClient.from(baseDynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

export const cloudWatchClient = new CloudWatchClient({ region });

export const sqsClient = new SQSClient({ region });

