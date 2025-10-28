import crypto from 'crypto';
import dataStore from './data-store.js';
import { saveJson, downloadToTemp } from './storage-helper.js';
import { buildTranscriptKey, tenantPersonaPrefix } from '../storage/paths.js';
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

function normalizePersona(personaId) {
  return personaId ? personaId.toLowerCase() : null;
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
  const personaId = normalizePersona(transcript.persona);
  const conversationId = transcript.conversationId;
  const archiveKey = buildTranscriptKey(tenantId, personaId, conversationId, 'latest.json');
  return archiveKey;
}

async function ensureTranscriptArchive(transcript) {
  if (!transcript) return null;
  const archiveKey = await getTranscriptArchiveKey(transcript);
  if (!archiveKey) return null;
  const tenantPrefix = tenantPersonaPrefix(normalizeTenant(transcript.tenantId), normalizePersona(transcript.persona));
  const relativeKey = archiveKey.startsWith(`${tenantPrefix}/`)
    ? archiveKey.slice(tenantPrefix.length + 1)
    : archiveKey;
  await saveJson(
    relativeKey,
    transcript,
    { prettyPrint: true, tenantId: normalizeTenant(transcript.tenantId), personaId: normalizePersona(transcript.persona) }
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
  const tenantPrefix = tenantPersonaPrefix(normalizeTenant(transcript.tenantId), normalizePersona(transcript.persona));
  const relativeLatestKey = buildTranscriptKey(null, null, transcript.conversationId, 'latest.json');
  let tempPath = null;
  try {
    tempPath = await downloadToTemp(
      relativeLatestKey,
      '.json',
      { tenantId: normalizeTenant(transcript.tenantId), personaId: normalizePersona(transcript.persona) }
    );
  } catch (error) {
    console.warn('Transcript archive missing, proceeding without attachment:', error.message);
  }

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
    attachments: downloadUrl || !tempPath
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
  async findByConversation(tenantId, conversationId, personaId = null) {
    const normalizedTenant = normalizeTenant(tenantId);
    const normalizedPersona = normalizePersona(personaId);
    const conversation = ensureConversationId(conversationId);
    const transcripts = await dataStore.list(
      COLLECTION,
      record => record.tenantId === normalizedTenant && record.conversationId === conversation,
      { tenantId: normalizedTenant, personaId: normalizedPersona }
    );
    return transcripts.length > 0 ? transcripts[0] : null;
  }

  async listByTenant(tenantId, personaId = null) {
    const normalizedTenant = normalizeTenant(tenantId);
    const normalizedPersona = normalizePersona(personaId);
    return dataStore.list(
      COLLECTION,
      record => record.tenantId === normalizedTenant && (!normalizedPersona || record.persona === normalizedPersona),
      { tenantId: normalizedTenant, personaId: normalizedPersona }
    );
  }

  async getById(id, tenantId = null, personaId = null) {
    const normalizedTenant = tenantId ? normalizeTenant(tenantId) : undefined;
    const normalizedPersona = personaId ? normalizePersona(personaId) : null;
    if (normalizedTenant) {
      return dataStore.get(COLLECTION, id, { tenantId: normalizedTenant, personaId: normalizedPersona });
    }
    return dataStore.get(COLLECTION, id);
  }

  async logInteraction({ tenantId, persona, conversationId, userMessage, assistantResponse, conversationHistory = [], contactIntent = null }) {
    const normalizedTenant = normalizeTenant(tenantId);
    const normalizedPersona = normalizePersona(persona);
    const conversation = ensureConversationId(conversationId);
  const existing = await this.findByConversation(normalizedTenant, conversation, normalizedPersona);

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
        { tenantId: normalizedTenant, personaId: normalizedPersona }
      );
    } else {
      savedRecord = await dataStore.create(
        COLLECTION,
        {
          tenantId: normalizedTenant,
          persona: normalizedPersona,
          conversationId: conversation,
          startedAt: timestamp,
          lastMessageAt: timestamp,
          messages,
          metadata: {
            lastUserMessage: userMessage || null,
            contactIntent: contactIntent || null
          }
        },
        { tenantId: normalizedTenant, personaId: normalizedPersona }
      );
    }

    const transcriptKey = buildTranscriptKey(normalizedTenant, normalizedPersona, conversation, `${timestamp}.json`);

    const archiveData = {
      id: savedRecord.id,
      tenantId: normalizedTenant,
      persona: normalizedPersona,
      conversationId: conversation,
      startedAt: savedRecord.startedAt,
      lastMessageAt: timestamp,
      messages,
      metadata: savedRecord.metadata || {}
    };

    const tenantPrefix = tenantPersonaPrefix(normalizedTenant, normalizedPersona);
    const relativeKey = transcriptKey.startsWith(`${tenantPrefix}/`)
      ? transcriptKey.slice(tenantPrefix.length + 1)
      : transcriptKey;

    await saveJson(relativeKey, archiveData, { prettyPrint: true, tenantId: normalizedTenant, personaId: normalizedPersona });
    await ensureTranscriptArchive(archiveData);

    return savedRecord;
  }

  async deleteTranscript(id, tenantId, personaId = null) {
    const normalizedTenant = normalizeTenant(tenantId);
    const normalizedPersona = normalizePersona(personaId);
    return dataStore.delete(COLLECTION, id, { tenantId: normalizedTenant, personaId: normalizedPersona });
  }

  async sendTranscript(id, email, tenantId = null, personaId = null) {
    const transcript = await this.getById(id, tenantId, personaId);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    return emailTranscript(transcript, email);
  }

  async getDownloadLink(id, tenantId, personaId = null) {
    const transcript = await this.getById(id, tenantId, personaId);
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
