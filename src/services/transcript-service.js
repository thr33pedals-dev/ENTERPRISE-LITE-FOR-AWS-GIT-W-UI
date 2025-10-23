import crypto from 'crypto';
import dataStore from './data-store.js';
import { saveJson, buildTenantKey, downloadToTemp } from './storage-helper.js';
import nodemailer from 'nodemailer';
import { getStorage } from '../storage/index.js';

const COLLECTION = 'transcripts';
const TRANSCRIPT_ARCHIVE_PREFIX = 'transcripts';

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

async function getTranscriptArchiveKey(transcript) {
  if (!transcript) return null;
  const tenantId = normalizeTenant(transcript.tenantId);
  const conversationId = transcript.conversationId;
  const archiveKey = buildTenantKey(
    tenantId,
    TRANSCRIPT_ARCHIVE_PREFIX,
    conversationId,
    'latest.json'
  );
  return archiveKey;
}

async function ensureTranscriptArchive(transcript) {
  if (!transcript) return null;
  const archiveKey = await getTranscriptArchiveKey(transcript);
  if (!archiveKey) return null;
  await saveJson(
    archiveKey.replace(`${normalizeTenant(transcript.tenantId)}/`, ''),
    transcript,
    { prettyPrint: true, tenantId: normalizeTenant(transcript.tenantId) }
  );
  return archiveKey;
}

async function createDownloadUrl(transcript) {
  const storage = getStorage();
  const archiveKey = await getTranscriptArchiveKey(transcript);
  if (!archiveKey) return null;
  if (typeof storage.getDownloadUrl !== 'function') {
    return null;
  }
  return storage.getDownloadUrl(archiveKey);
}

async function emailTranscript(transcript, email) {
  if (!email) {
    throw new Error('Email is required to send transcript');
  }

  const downloadUrl = await createDownloadUrl(transcript);
  const tempPath = await downloadToTemp(
    `${TRANSCRIPT_ARCHIVE_PREFIX}/${transcript.conversationId}/latest.json`,
    '.json',
    { tenantId: normalizeTenant(transcript.tenantId) }
  );

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      : undefined
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to: email,
    subject: `Transcript ${transcript.conversationId}`,
    text: downloadUrl
      ? `Transcript is available at: ${downloadUrl}`
      : 'Transcript is attached.',
    attachments: downloadUrl
      ? undefined
      : [
          {
            filename: `${transcript.conversationId}.json`,
            path: tempPath
          }
        ]
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send transcript email:', error);
    throw new Error('Unable to send transcript email');
  }

  return {
    email,
    downloadUrl: downloadUrl || null
  };
}

class TranscriptService {
  async findByConversation(tenantId, conversationId) {
    const normalizedTenant = normalizeTenant(tenantId);
    const conversation = ensureConversationId(conversationId);
    const transcripts = await dataStore.list(
      COLLECTION,
      record => record.tenantId === normalizedTenant && record.conversationId === conversation,
      { tenantId: normalizedTenant }
    );
    return transcripts.length > 0 ? transcripts[0] : null;
  }

  async listByTenant(tenantId) {
    const normalizedTenant = normalizeTenant(tenantId);
    return dataStore.list(
      COLLECTION,
      record => record.tenantId === normalizedTenant,
      { tenantId: normalizedTenant }
    );
  }

  async getById(id) {
    // Tenant is unknown here; look across the default prefix for backwards compatibility
    return dataStore.get(COLLECTION, id);
  }

  async logInteraction({ tenantId, conversationId, userMessage, assistantResponse, conversationHistory = [], contactIntent = null }) {
    const normalizedTenant = normalizeTenant(tenantId);
    const conversation = ensureConversationId(conversationId);
    const existing = await this.findByConversation(normalizedTenant, conversation);

    const timestamp = now();
    const messages = buildMessages(conversationHistory, assistantResponse).map(message => ({
      ...message,
      timestamp: message.timestamp || timestamp
    }));

    let savedRecord;

    if (existing) {
      savedRecord = await dataStore.update(
        COLLECTION,
        existing.id,
        {
          messages,
          lastMessageAt: timestamp,
          updatedAt: timestamp,
          metadata: {
            ...(existing.metadata || {}),
            lastUserMessage: userMessage || existing.metadata?.lastUserMessage || null,
            contactIntent: contactIntent || existing.metadata?.contactIntent || null
          }
        },
        { tenantId: normalizedTenant }
      );
    } else {
      savedRecord = await dataStore.create(
        COLLECTION,
        {
          tenantId: normalizedTenant,
          conversationId: conversation,
          startedAt: timestamp,
          lastMessageAt: timestamp,
          messages,
          metadata: {
            lastUserMessage: userMessage || null,
            contactIntent: contactIntent || null
          }
        },
        { tenantId: normalizedTenant }
      );
    }

    const transcriptKey = buildTenantKey(
      normalizedTenant,
      TRANSCRIPT_ARCHIVE_PREFIX,
      conversation,
      `${timestamp}.json`
    );

    const archiveData = {
      id: savedRecord.id,
      tenantId: normalizedTenant,
      conversationId: conversation,
      startedAt: savedRecord.startedAt,
      lastMessageAt: timestamp,
      messages,
      metadata: savedRecord.metadata || {}
    };

    await saveJson(transcriptKey.replace(`${normalizedTenant}/`, ''), archiveData, { prettyPrint: true, tenantId: normalizedTenant });
    await ensureTranscriptArchive(archiveData);

    return savedRecord;
  }

  async deleteTranscript(id, tenantId) {
    const normalizedTenant = normalizeTenant(tenantId);
    return dataStore.delete(COLLECTION, id, { tenantId: normalizedTenant });
  }

  async sendTranscript(id, email) {
    const transcript = await this.getById(id);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    return emailTranscript(transcript, email);
  }

  async getDownloadLink(id, tenantId) {
    const transcript = await this.getById(id);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    if (normalizeTenant(transcript.tenantId) !== normalizeTenant(tenantId)) {
      throw new Error('Forbidden');
    }

    await ensureTranscriptArchive(transcript);

    const url = await createDownloadUrl(transcript);
    if (!url) {
      throw new Error('Download URL unavailable');
    }

    return url;
  }
}

const transcriptService = new TranscriptService();

export default transcriptService;
