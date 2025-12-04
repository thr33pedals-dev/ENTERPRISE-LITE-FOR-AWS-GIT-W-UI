/**
 * DynamoDB Service for Enterprise Lite
 * Uses existing multi-table design:
 * - Companies (tenantId, companyId)
 * - Personas (tenantId, personaId)
 * - PersonasConfig (tenantId, personaId)
 * - Transcripts (tenantId, conversationId)
 * - Analytics (tenantId, eventId)
 * - LinkTracking (linkId)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  DeleteCommand,
  UpdateCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import logger from '../utils/logger.js';

// Table names from existing AWS setup
const TABLES = {
  COMPANIES: process.env.DYNAMODB_TABLE_COMPANIES || 'Companies',
  PERSONAS: process.env.DYNAMODB_TABLE_PERSONAS || 'Personas',
  PERSONAS_CONFIG: process.env.DYNAMODB_TABLE_PERSONAS_CONFIG || 'PersonasConfig',
  TRANSCRIPTS: process.env.DYNAMODB_TABLE_TRANSCRIPTS || 'Transcripts',
  ANALYTICS: process.env.DYNAMODB_TABLE_ANALYTICS || 'Analytics',
  LINK_TRACKING: process.env.DYNAMODB_TABLE_LINK_TRACKING || 'LinkTracking'
};

const REGION = process.env.AWS_REGION || process.env.S3_REGION || 'ap-southeast-1';

// Initialize client
const client = new DynamoDBClient({ 
  region: REGION,
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT })
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

/**
 * Generate unique ID
 */
function generateId(prefix = '') {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return prefix ? `${prefix}_${id}` : id;
}

// ============================================
// Companies Table Operations
// ============================================

export const Companies = {
  tableName: TABLES.COMPANIES,

  async create(tenantId, data) {
    const companyId = data.companyId || data.id || generateId('company');
    const now = new Date().toISOString();
    
    const item = {
      tenantId,
      companyId,
      ...data,
      id: companyId,
      createdAt: data.createdAt || now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.COMPANIES,
        Item: item
      }));
      logger.debug('Company created', { tenantId, companyId });
      return item;
    } catch (error) {
      logger.error('Failed to create company', { tenantId, companyId, error });
      throw error;
    }
  },

  async get(tenantId, companyId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.COMPANIES,
        Key: { tenantId, companyId }
      }));
      return result.Item || null;
    } catch (error) {
      logger.error('Failed to get company', { tenantId, companyId, error });
      throw error;
    }
  },

  async update(tenantId, companyId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value], index) => {
      if (key !== 'tenantId' && key !== 'companyId') {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    try {
      const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.COMPANIES,
        Key: { tenantId, companyId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));
      logger.debug('Company updated', { tenantId, companyId });
      return result.Attributes;
    } catch (error) {
      logger.error('Failed to update company', { tenantId, companyId, error });
      throw error;
    }
  },

  async list(tenantId, options = {}) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.COMPANIES,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: { ':tenantId': tenantId },
        Limit: options.limit || 100
      }));
      return { items: result.Items || [], count: result.Count };
    } catch (error) {
      logger.error('Failed to list companies', { tenantId, error });
      throw error;
    }
  },

  async delete(tenantId, companyId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLES.COMPANIES,
        Key: { tenantId, companyId }
      }));
      logger.debug('Company deleted', { tenantId, companyId });
      return true;
    } catch (error) {
      logger.error('Failed to delete company', { tenantId, companyId, error });
      throw error;
    }
  }
};

// ============================================
// Personas Table Operations
// ============================================

export const Personas = {
  tableName: TABLES.PERSONAS,

  async create(tenantId, data) {
    const personaId = data.personaId || data.id || generateId('persona');
    const now = new Date().toISOString();
    
    const item = {
      tenantId,
      personaId,
      ...data,
      id: personaId,
      createdAt: data.createdAt || now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.PERSONAS,
        Item: item
      }));
      logger.debug('Persona created', { tenantId, personaId });
      return item;
    } catch (error) {
      logger.error('Failed to create persona', { tenantId, personaId, error });
      throw error;
    }
  },

  async get(tenantId, personaId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.PERSONAS,
        Key: { tenantId, personaId }
      }));
      return result.Item || null;
    } catch (error) {
      logger.error('Failed to get persona', { tenantId, personaId, error });
      throw error;
    }
  },

  async update(tenantId, personaId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value], index) => {
      if (key !== 'tenantId' && key !== 'personaId') {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    try {
      const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.PERSONAS,
        Key: { tenantId, personaId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));
      logger.debug('Persona updated', { tenantId, personaId });
      return result.Attributes;
    } catch (error) {
      logger.error('Failed to update persona', { tenantId, personaId, error });
      throw error;
    }
  },

  async list(tenantId, options = {}) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.PERSONAS,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: { ':tenantId': tenantId },
        Limit: options.limit || 100
      }));
      return { items: result.Items || [], count: result.Count };
    } catch (error) {
      logger.error('Failed to list personas', { tenantId, error });
      throw error;
    }
  },

  async delete(tenantId, personaId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLES.PERSONAS,
        Key: { tenantId, personaId }
      }));
      logger.debug('Persona deleted', { tenantId, personaId });
      return true;
    } catch (error) {
      logger.error('Failed to delete persona', { tenantId, personaId, error });
      throw error;
    }
  }
};

// ============================================
// PersonasConfig Table Operations (AI Configs)
// ============================================

export const PersonasConfig = {
  tableName: TABLES.PERSONAS_CONFIG,

  async save(tenantId, personaId, configType, data) {
    const now = new Date().toISOString();
    
    const item = {
      tenantId,
      personaId,
      configType, // 'sales', 'support', 'interview'
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.PERSONAS_CONFIG,
        Item: item
      }));
      logger.debug('PersonaConfig saved', { tenantId, personaId, configType });
      return item;
    } catch (error) {
      logger.error('Failed to save persona config', { tenantId, personaId, error });
      throw error;
    }
  },

  async get(tenantId, personaId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.PERSONAS_CONFIG,
        Key: { tenantId, personaId }
      }));
      return result.Item || null;
    } catch (error) {
      logger.error('Failed to get persona config', { tenantId, personaId, error });
      throw error;
    }
  },

  async update(tenantId, personaId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([key, value], index) => {
      if (key !== 'tenantId' && key !== 'personaId') {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      }
    });

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    try {
      const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.PERSONAS_CONFIG,
        Key: { tenantId, personaId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));
      logger.debug('PersonaConfig updated', { tenantId, personaId });
      return result.Attributes;
    } catch (error) {
      logger.error('Failed to update persona config', { tenantId, personaId, error });
      throw error;
    }
  },

  async list(tenantId, options = {}) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.PERSONAS_CONFIG,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: { ':tenantId': tenantId },
        Limit: options.limit || 100
      }));
      return { items: result.Items || [], count: result.Count };
    } catch (error) {
      logger.error('Failed to list persona configs', { tenantId, error });
      throw error;
    }
  },

  async delete(tenantId, personaId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLES.PERSONAS_CONFIG,
        Key: { tenantId, personaId }
      }));
      logger.debug('PersonaConfig deleted', { tenantId, personaId });
      return true;
    } catch (error) {
      logger.error('Failed to delete persona config', { tenantId, personaId, error });
      throw error;
    }
  }
};

// ============================================
// Transcripts Table Operations
// ============================================

export const Transcripts = {
  tableName: TABLES.TRANSCRIPTS,

  async create(tenantId, data) {
    const conversationId = data.conversationId || generateId('conv');
    const now = new Date().toISOString();
    
    const item = {
      tenantId,
      conversationId,
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.TRANSCRIPTS,
        Item: item
      }));
      logger.debug('Transcript created', { tenantId, conversationId });
      return item;
    } catch (error) {
      logger.error('Failed to create transcript', { tenantId, conversationId, error });
      throw error;
    }
  },

  async get(tenantId, conversationId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.TRANSCRIPTS,
        Key: { tenantId, conversationId }
      }));
      return result.Item || null;
    } catch (error) {
      logger.error('Failed to get transcript', { tenantId, conversationId, error });
      throw error;
    }
  },

  async appendMessage(tenantId, conversationId, message) {
    try {
      const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.TRANSCRIPTS,
        Key: { tenantId, conversationId },
        UpdateExpression: 'SET #messages = list_append(if_not_exists(#messages, :empty), :message), #updatedAt = :now',
        ExpressionAttributeNames: {
          '#messages': 'messages',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':message': [message],
          ':empty': [],
          ':now': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      }));
      return result.Attributes;
    } catch (error) {
      logger.error('Failed to append message', { tenantId, conversationId, error });
      throw error;
    }
  },

  async list(tenantId, options = {}) {
    try {
      const params = {
        TableName: TABLES.TRANSCRIPTS,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: { ':tenantId': tenantId },
        Limit: options.limit || 50,
        ScanIndexForward: false // Most recent first
      };

      if (options.personaId) {
        params.FilterExpression = 'personaId = :personaId';
        params.ExpressionAttributeValues[':personaId'] = options.personaId;
      }

      const result = await docClient.send(new QueryCommand(params));
      return { items: result.Items || [], count: result.Count };
    } catch (error) {
      logger.error('Failed to list transcripts', { tenantId, error });
      throw error;
    }
  },

  async delete(tenantId, conversationId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLES.TRANSCRIPTS,
        Key: { tenantId, conversationId }
      }));
      logger.debug('Transcript deleted', { tenantId, conversationId });
      return true;
    } catch (error) {
      logger.error('Failed to delete transcript', { tenantId, conversationId, error });
      throw error;
    }
  }
};

// ============================================
// Analytics Table Operations
// ============================================

export const Analytics = {
  tableName: TABLES.ANALYTICS,

  async record(tenantId, eventType, data = {}) {
    const eventId = generateId('evt');
    const now = new Date().toISOString();
    
    const item = {
      tenantId,
      eventId,
      eventType,
      ...data,
      timestamp: now,
      month: now.slice(0, 7) // YYYY-MM for billing aggregation
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.ANALYTICS,
        Item: item
      }));
      logger.usage(eventType, { tenantId, ...data });
      return item;
    } catch (error) {
      logger.error('Failed to record analytics', { tenantId, eventType, error });
      // Don't throw - analytics shouldn't break main flow
      return null;
    }
  },

  async query(tenantId, options = {}) {
    try {
      const params = {
        TableName: TABLES.ANALYTICS,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: { ':tenantId': tenantId },
        Limit: options.limit || 100,
        ScanIndexForward: false
      };

      if (options.eventType) {
        params.FilterExpression = 'eventType = :eventType';
        params.ExpressionAttributeValues[':eventType'] = options.eventType;
      }

      const result = await docClient.send(new QueryCommand(params));
      return { items: result.Items || [], count: result.Count };
    } catch (error) {
      logger.error('Failed to query analytics', { tenantId, error });
      throw error;
    }
  },

  async getUsageSummary(tenantId, month) {
    try {
      const params = {
        TableName: TABLES.ANALYTICS,
        KeyConditionExpression: 'tenantId = :tenantId',
        FilterExpression: '#month = :month',
        ExpressionAttributeNames: { '#month': 'month' },
        ExpressionAttributeValues: { 
          ':tenantId': tenantId,
          ':month': month || new Date().toISOString().slice(0, 7)
        }
      };

      const result = await docClient.send(new QueryCommand(params));
      
      // Aggregate by event type
      const summary = {};
      for (const item of result.Items || []) {
        if (!summary[item.eventType]) {
          summary[item.eventType] = 0;
        }
        summary[item.eventType]++;
      }

      return {
        tenantId,
        month: month || new Date().toISOString().slice(0, 7),
        events: summary,
        totalEvents: result.Count
      };
    } catch (error) {
      logger.error('Failed to get usage summary', { tenantId, error });
      throw error;
    }
  }
};

// ============================================
// LinkTracking Table Operations
// ============================================

export const LinkTracking = {
  tableName: TABLES.LINK_TRACKING,

  async create(data) {
    const linkId = data.linkId || generateId('link');
    const now = new Date().toISOString();
    
    const item = {
      linkId,
      ...data,
      clicks: 0,
      createdAt: now,
      updatedAt: now
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.LINK_TRACKING,
        Item: item
      }));
      logger.debug('Link created', { linkId });
      return item;
    } catch (error) {
      logger.error('Failed to create link', { linkId, error });
      throw error;
    }
  },

  async get(linkId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLES.LINK_TRACKING,
        Key: { linkId }
      }));
      return result.Item || null;
    } catch (error) {
      logger.error('Failed to get link', { linkId, error });
      throw error;
    }
  },

  async incrementClicks(linkId) {
    try {
      const result = await docClient.send(new UpdateCommand({
        TableName: TABLES.LINK_TRACKING,
        Key: { linkId },
        UpdateExpression: 'SET clicks = if_not_exists(clicks, :zero) + :inc, lastClickedAt = :now, #updatedAt = :now',
        ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':inc': 1,
          ':now': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      }));
      return result.Attributes;
    } catch (error) {
      logger.error('Failed to increment clicks', { linkId, error });
      throw error;
    }
  },

  async listByTenant(tenantId, options = {}) {
    try {
      // Need to scan since linkId is the only key
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.LINK_TRACKING,
        FilterExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: { ':tenantId': tenantId },
        Limit: options.limit || 100
      }));
      return { items: result.Items || [], count: result.Count };
    } catch (error) {
      logger.error('Failed to list links', { tenantId, error });
      throw error;
    }
  },

  async delete(linkId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLES.LINK_TRACKING,
        Key: { linkId }
      }));
      logger.debug('Link deleted', { linkId });
      return true;
    } catch (error) {
      logger.error('Failed to delete link', { linkId, error });
      throw error;
    }
  }
};

// ============================================
// Convenience exports
// ============================================

export { TABLES };

export default {
  Companies,
  Personas,
  PersonasConfig,
  Transcripts,
  Analytics,
  LinkTracking,
  TABLES
};
