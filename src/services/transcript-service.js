import crypto from 'crypto';
import dataStore from './data-store.js';

const COLLECTION = 'transcripts';

function now() {
  return new Date().toISOString();
}

function normalizeTenant(tenantId) {
  return (tenantId || 'default').toLowerCase();
}

function ensureConversationId(conversationId) {
  return conversationId || crypto.randomUUID();
}

function buildMessages(history = [], assistantResponse) {
  const messages = Array.isArray(history) ? [...history] : [];
  if (assistantResponse) {
    messages.push({ role: 'assistant', content: assistantResponse, timestamp: now() });
  }
  return messages;
}

class TranscriptService {
  async findByConversation(tenantId, conversationId) {
    const normalizedTenant = normalizeTenant(tenantId);
    const conversation = ensureConversationId(conversationId);
    const transcripts = await dataStore.list(COLLECTION, record =>
      record.tenantId === normalizedTenant && record.conversationId === conversation
    );
    return transcripts.length > 0 ? transcripts[0] : null;
  }

  async listByTenant(tenantId) {
    const normalizedTenant = normalizeTenant(tenantId);
    return dataStore.list(COLLECTION, record => record.tenantId === normalizedTenant);
  }

  async getById(id) {
    return dataStore.get(COLLECTION, id);
  }

  async logInteraction({ tenantId, conversationId, userMessage, assistantResponse, conversationHistory = [] }) {
    const normalizedTenant = normalizeTenant(tenantId);
    const conversation = ensureConversationId(conversationId);
    const existing = await this.findByConversation(normalizedTenant, conversation);

    const timestamp = now();
    const messages = buildMessages(conversationHistory, assistantResponse).map(message => ({
      ...message,
      timestamp: message.timestamp || timestamp
    }));

    if (existing) {
      const updated = await dataStore.update(COLLECTION, existing.id, {
        messages,
        lastMessageAt: timestamp,
        updatedAt: timestamp
      });
      return updated;
    }

    const record = await dataStore.create(COLLECTION, {
      tenantId: normalizedTenant,
      conversationId: conversation,
      startedAt: timestamp,
      lastMessageAt: timestamp,
      messages,
      metadata: {
        lastUserMessage: userMessage || null
      }
    });
    return record;
  }

  async deleteTranscript(id) {
    return dataStore.delete(COLLECTION, id);
  }

  async sendTranscript(id, email) {
    const transcript = await this.getById(id);
    if (!transcript) {
      throw new Error('Transcript not found');
    }
    console.log(`📧 [stub] Sending transcript ${id} to ${email}`);
    return {
      transcript,
      email
    };
  }
}

const transcriptService = new TranscriptService();

export default transcriptService;
