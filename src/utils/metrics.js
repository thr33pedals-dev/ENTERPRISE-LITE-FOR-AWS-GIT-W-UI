import { PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { cloudWatchClient } from './aws-clients.js';
import { logger } from './logger.js';

const namespace = process.env.CLOUDWATCH_NAMESPACE || 'SupportAI';

export async function emitMetric(metricName, value, dimensions = []) {
  try {
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: [
          {
            MetricName: metricName,
            Timestamp: new Date(),
            Value: value,
            Unit: 'Count',
            Dimensions: dimensions
          }
        ]
      })
    );
  } catch (error) {
    logger.warn({ msg: 'Failed to emit CloudWatch metric', metricName, error: error.message });
  }
}

