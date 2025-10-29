function sanitizeConfigRecord(record) {
  if (!record) return null;
  const {
    id,
    company_id,
    tenantId,
    product_info_file,
    custom_prompt,
    ai_link,
    usage_count,
    last_used,
    status,
    sales_approach,
    qualification_questions,
    response_tone,
    support_categories,
    escalation_rules,
    response_style,
    primary_language,
    collect_feedback,
    save_transcripts,
    multi_language,
    job_role,
    job_description,
    interview_questions,
    createdAt,
    updatedAt
  } = record;

  return {
    id,
    company_id,
    tenantId,
    product_info_file,
    custom_prompt,
    ai_link,
    usage_count,
    last_used,
    status,
    sales_approach,
    qualification_questions,
    response_tone,
    support_categories,
    escalation_rules,
    response_style,
    primary_language,
    collect_feedback,
    save_transcripts,
    multi_language,
    job_role,
    job_description,
    interview_questions,
    createdAt,
    updatedAt
  };
}

function sanitizeAnalyticsRecords(records) {
  return (records || []).map(item => ({
    id: item.id,
    company_id: item.company_id,
    ai_type: item.ai_type,
    usage_date: item.usage_date,
    session_duration: item.session_duration,
    success: item.success,
    metadata: item.metadata || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}

function sanitizeCompanyRecord(record) {
  if (!record) return null;
  const { id, company_name, contact_person, email, phone, address, subscription_status, subscription_plan, subscription_date, next_billing_date, tenantId, createdAt, updatedAt } = record;
  return {
    id,
    company_name,
    contact_person,
    email,
    phone,
    address,
    subscription_status,
    subscription_plan,
    subscription_date,
    next_billing_date,
    tenantId,
    createdAt,
    updatedAt
  };
}

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { processFiles, categorizeFiles, saveProcessedFiles, validateFile, sanitizeTenantId } from './src/file-processor.js';
import { getStorage } from './src/storage/index.js';
import dataStore from './src/services/data-store.js';
import transcriptService from './src/services/transcript-service.js';
import { createClaudeClient } from './src/claude-client.js';
import { analyzeDataQuality } from './src/quality-analyzer.js';
import { loadManifest as loadTenantManifest, saveManifest as saveTenantManifest, deleteManifest as deleteTenantManifest, manifestRelativePath } from './src/services/manifest-store.js';
import analyticsService from './src/services/analytics-service.js';
import { emitUsageEvent } from './src/services/usage-events.js';
import aiConfigService from './src/services/ai-config-service.js';
import { buildRawKey, safeSegment } from './src/storage/paths.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const COMPANIES_COLLECTION = 'companies';
const SALES_AI_COLLECTION = 'sales_ai';
const SUPPORT_AI_COLLECTION = 'support_ai';
const INTERVIEW_AI_COLLECTION = 'interview_ai';
const ANALYTICS_COLLECTION = 'usage_analytics';
const TRANSCRIPTS_COLLECTION = 'transcripts';
const PERSONAS_COLLECTION = 'personas';

function getTenantId(req) {
  const headerTenant = req.headers['x-tenant-id'] || req.headers['x-tenant'];
  const queryTenant = req.query?.tenantId || req.query?.tenant;
  const candidate = headerTenant || queryTenant || 'default';
  const sanitized = sanitizeTenantId(candidate);
  return sanitized || 'default';
}

function getPersonaId(req) {
  const headerPersona = req.headers['x-persona-id'] || req.headers['x-persona'];
  const bodyPersona = req.body?.persona;
  const queryPersona = req.query?.persona || req.query?.personaId;
  const candidate = headerPersona || bodyPersona || queryPersona;
  return candidate ? sanitizeTenantId(candidate) : null;
}

function sanitizePersonaKey(value) {
  if (!value) return null;
  return sanitizeTenantId(value) || null;
}

function getArtifactFilenames(entry) {
  if (!entry?.artifacts) return [];
  const filenames = [];
  const { jsonKey, txtKey, metaKey } = entry.artifacts;
  if (jsonKey) filenames.push(jsonKey);
  if (txtKey) filenames.push(txtKey);
  if (metaKey) filenames.push(metaKey);
  return filenames;
}

async function deleteProcessedFile(key) {
  if (!key) return false;
  try {
    const storage = getStorage();
    await storage.remove(key);
    return true;
  } catch (err) {
    console.warn(`⚠️ Unable to delete artifact ${key}:`, err.message);
    return false;
  }
}

function recalculateManifestStats(manifest) {
  const fileTypes = manifest.files.reduce((acc, file) => {
    const category = file.category || 'other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, { tracking: 0, knowledge: 0, other: 0 });

  manifest.totalFiles = manifest.files.length;
  manifest.fileTypes = {
    tracking: fileTypes.tracking || 0,
    knowledge: fileTypes.knowledge || 0,
    other: fileTypes.other || 0
  };

  if (manifest.mainFile && !manifest.files.some(f => f.name === manifest.mainFile.filename)) {
    manifest.mainFile = null;
  }

  return manifest;
}

function deriveTenantId(inputTenant, fallback = 'default') {
  const candidate = inputTenant || fallback;
  return sanitizeTenantId(candidate) || 'default';
}

async function ensureTranscriptAccess(transcriptId, tenantId) {
  const transcript = await transcriptService.getById(transcriptId);
  if (!transcript || deriveTenantId(transcript.tenantId) !== deriveTenantId(tenantId)) {
    return null;
  }
  return transcript;
}

function serializeTranscriptToText(transcript) {
  if (!transcript) return '';
  const lines = [];
  lines.push(`Tenant: ${transcript.tenantId}`);
  lines.push(`Conversation ID: ${transcript.conversationId}`);
  lines.push(`Started At: ${transcript.startedAt}`);
  lines.push(`Last Message At: ${transcript.lastMessageAt}`);
  lines.push('');
  for (const message of transcript.messages || []) {
    const timestamp = message.timestamp || transcript.lastMessageAt;
    lines.push(`[${timestamp}] ${message.role?.toUpperCase?.() || 'UNKNOWN'}: ${message.content}`);
  }
  lines.push('');
  return lines.join('\n');
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
    files: parseInt(process.env.MAX_FILES) || 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/csv',
      'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype) ||
        file.originalname.match(/\.(xlsx|xls|csv|pdf|docx|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Supported file types: Excel (.xlsx, .xls), CSV, PDF, DOCX, TXT'));
    }
  }
});

// Initialize Claude client
const claudeClient = createClaudeClient();

// ===== API ROUTES =====

/**
 * Upload multiple Excel files
 * POST /api/upload
 */
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  let uploadedRawKeys = [];
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const manifestResult = await loadTenantManifest(tenantId, personaId);
    const existingManifest = manifestResult || null;
    const storage = getStorage();
    uploadedRawKeys = [];
    const rawArtifacts = [];
    const rawArtifactByName = new Map();

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No files uploaded' 
      });
    }

    console.log(`📁 Processing ${req.files.length} file(s)...`);

    const timestampSeed = Date.now();

    for (const [index, file] of req.files.entries()) {
      const originalExt = path.extname(file.originalname || '') || '';
      const originalBase = path.basename(file.originalname || `upload-${index}`, originalExt);
      const safeBase = safeSegment(originalBase || `upload-${index}`, `upload-${index}`);
      const rawFilename = `${timestampSeed}-${index}-${safeBase}${originalExt}`;
      const rawKey = buildRawKey(tenantId, personaId, rawFilename);
      const fileBuffer = file.buffer ? Buffer.from(file.buffer) : null;
      if (!fileBuffer) {
        throw new Error(`Upload for ${file.originalname || `file-${index}`} did not include a buffer`);
      }
      await storage.save(rawKey, fileBuffer, { contentType: file.mimetype || 'application/octet-stream', raw: true });
      const artifact = { rawKey, mimetype: file.mimetype, size: file.size, originalName: file.originalname };
      uploadedRawKeys.push(rawKey);
      rawArtifacts.push(artifact);
      if (file.originalname) {
        rawArtifactByName.set(file.originalname, artifact);
      }

      file.rawKey = rawKey;
      file.tenantId = tenantId;
      file.personaId = personaId;
      file.storageBackend = storage.backend;
    }

    // Process all files (Excel, PDF, DOCX, TXT, CSV)
    const processedFiles = await processFiles(req.files, { tenantId, personaId });

    if (!processedFiles || processedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to process files'
      });
    }

    // Categorize files (tracking vs knowledge)
    const categories = categorizeFiles(processedFiles);

    // Save processed files to filesystem (for MCP access)
    const savedFiles = await saveProcessedFiles(processedFiles, {
      tenantId,
      personaId
    });

    // Analyze data quality (if tracking files exist)
    let qualityReport = null;
    let mainFile = null;
    
    if (categories.tracking.length > 0) {
      mainFile = categories.tracking[0];
      qualityReport = analyzeDataQuality(mainFile.data, mainFile.metadata.columns);
    }

    // Load existing manifest or create new one
    const categoryByName = new Map();
    categories.tracking.forEach(f => categoryByName.set(f.originalName, 'tracking'));
    categories.knowledge.forEach(f => categoryByName.set(f.originalName, 'knowledge'));
    categories.other.forEach(f => categoryByName.set(f.originalName, 'other'));

    const timestamp = new Date().toISOString();
    const newFiles = processedFiles.map((f, idx) => ({
      name: f.originalName,
      type: f.fileType,
      metadata: f.metadata,
      category: categoryByName.get(f.originalName) || 'other',
      persona: personaId || f.persona || null,
      uploadedAt: timestamp,
      triage: f.triage || null,
      artifacts: {
        storageKey: savedFiles[idx]?.storageKey || null,
        rawKey: (rawArtifactByName.get(f.originalName)?.rawKey) || rawArtifacts[idx]?.rawKey || null,
        jsonKey: savedFiles[idx]?.jsonKey || null,
        txtKey: savedFiles[idx]?.txtKey || null,
        metaKey: savedFiles[idx]?.metaKey || null,
        downloadUrls: savedFiles[idx]?.downloadUrls || null,
        parsedJsonPath: savedFiles[idx]?.artifacts?.parsedJsonPath || f?.artifacts?.parsedJsonPath || null,
        rawResponsePath: savedFiles[idx]?.artifacts?.rawResponsePath || f?.artifacts?.rawResponsePath || null,
        visionModel: savedFiles[idx]?.artifacts?.model || f?.artifacts?.model || null,
        visionGeneratedAt: savedFiles[idx]?.artifacts?.generatedAt || f?.artifacts?.generatedAt || null,
        promptPath: savedFiles[idx]?.artifacts?.promptPath || f?.artifacts?.promptPath || null,
        source: savedFiles[idx]?.artifacts?.source || f?.artifacts?.source || null,
        rawSize: (rawArtifactByName.get(f.originalName)?.size) || rawArtifacts[idx]?.size || null,
        rawContentType: (rawArtifactByName.get(f.originalName)?.mimetype) || rawArtifacts[idx]?.mimetype || null
      }
    }));

    const newFileNames = new Set(newFiles.map(f => f.name));
    const existingFiles = existingManifest?.files || [];
    const filteredExisting = existingFiles.filter(file => !newFileNames.has(file.name));

    const combinedFilesRaw = [...filteredExisting, ...newFiles];

    const determineCategory = (file) => {
      if (file.category) return file.category;
      const type = (file.type || '').toLowerCase();
      if (type === 'excel') return 'tracking';
      if (['pdf', 'docx', 'txt'].includes(type)) return 'knowledge';
      return 'other';
    };

    const combinedFiles = combinedFilesRaw.map(file => ({
      ...file,
      persona: file.persona || personaId || null,
      category: determineCategory(file)
    }));

    const fileTypeCounts = combinedFiles.reduce((acc, file) => {
      const category = file.category || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, { tracking: 0, knowledge: 0, other: 0 });

    let manifestMainFile = existingManifest?.mainFile || null;
    if (mainFile) {
      manifestMainFile = {
        filename: mainFile.originalName,
        type: mainFile.fileType,
        rows: mainFile.data.length,
        columns: mainFile.metadata.columns
      };
    } else if (manifestMainFile && !combinedFiles.some(f => f.name === manifestMainFile.filename)) {
      const trackingEntry = combinedFiles.find(f => f.category === 'tracking');
      if (trackingEntry) {
        manifestMainFile = {
          filename: trackingEntry.name,
          type: trackingEntry.type,
          rows: trackingEntry.metadata?.rows ?? trackingEntry.metadata?.rowCount ?? 0,
          columns: trackingEntry.metadata?.columns || []
        };
      } else {
        manifestMainFile = null;
      }
    }

    const manifest = {
      uploadTime: new Date().toISOString(),
      totalFiles: combinedFiles.length,
      fileTypes: {
        tracking: fileTypeCounts.tracking || 0,
        knowledge: fileTypeCounts.knowledge || 0,
        other: fileTypeCounts.other || 0
      },
      files: combinedFiles,
      mainFile: manifestMainFile,
      qualityReport: qualityReport || existingManifest?.qualityReport,
      tenantId,
      persona: personaId || null
    };

    const saveKey = await saveTenantManifest(tenantId, manifest, personaId);

    console.log('✅ Files processed successfully');
    console.log(`📊 Total files: ${processedFiles.length}`);
    console.log(`📋 Tracking: ${categories.tracking.length}, Knowledge: ${categories.knowledge.length}`);
    if (qualityReport) {
      console.log(`📊 Quality score: ${qualityReport.qualityScore}%`);
    }

    res.json({
      success: true,
      filesProcessed: req.files.length,
      persona: personaId || null,
      categories: {
        tracking: categories.tracking.length,
        knowledge: categories.knowledge.length,
        other: categories.other.length
      },
      files: processedFiles.map((f, idx) => ({
        name: f.originalName,
        type: f.fileType,
        size: f.fileSize,
        triageRoute: f.triage?.route || null,
        artifacts: newFiles[idx]?.artifacts || null
      })),
      mainFile: mainFile ? {
        name: mainFile.originalName,
        type: mainFile.fileType,
        rows: mainFile.data?.length || 0
      } : null,
      qualityReport: qualityReport,
      manifest: {
        ...manifest,
        manifestPath: manifestRelativePath(tenantId, personaId)
      }
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    if (uploadedRawKeys?.length) {
      const storage = getStorage();
      await Promise.all(uploadedRawKeys.map(key => storage.remove(key, { raw: true }).catch(() => {})));
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process files'
    });
  }
});

/**
 * Chat with Claude about tracking data
 * POST /api/chat
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], conversationId, transcriptId } = req.body;
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    // Check if tracking data exists
    const manifest = await loadTenantManifest(tenantId, personaId);
    if (!manifest) {
      return res.status(400).json({
        success: false,
        error: 'No tracking data uploaded. Please upload Excel files first.'
      });
    }

    console.log(`💬 Customer question: ${message}`);

    // Call Claude with MCP access to files
    const chatResult = await claudeClient.chat(message, conversationHistory, manifest);
    const assistantMessage = typeof chatResult === 'string' ? chatResult : chatResult?.message;
    const contactIntent = typeof chatResult === 'object' && chatResult ? chatResult.contactIntent : null;

    if (!assistantMessage) {
      throw new Error('Claude returned an empty response');
    }

    console.log(`🤖 Claude response: ${assistantMessage.substring(0, 100)}...`);

    const transcript = await transcriptService.logInteraction({
      tenantId,
      persona: personaId,
      conversationId,
      userMessage: message,
      assistantResponse: assistantMessage,
      conversationHistory: [...conversationHistory, { role: 'user', content: message }],
      contactIntent
    });

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: personaId || 'chat',
      action: 'chat_message',
      metadata: {
        conversationId: transcript?.conversationId || conversationId || null,
        transcriptId: transcript?.id || null,
        persona: personaId || null,
        contactIntent,
        responseLength: assistantMessage?.length || 0
      }
    });

    res.json({
      success: true,
      response: assistantMessage,
      sources: manifest.mainFile ? manifest.mainFile.filename : 'Uploaded files',
      contactIntent,
      transcriptId: transcript?.id || transcriptId || null,
      conversationId: transcript?.conversationId || conversationId || null,
      persona: personaId || null
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat message'
    });
  }
});

/**
 * Get current data quality report
 * GET /api/quality-report
 */
app.get('/api/quality-report', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const manifest = await loadTenantManifest(tenantId, personaId);

    if (!manifest) {
      return res.status(404).json({
        success: false,
        error: 'No data uploaded yet'
      });
    }

    res.json({
      success: true,
      qualityReport: manifest.qualityReport,
      uploadTime: manifest.uploadTime,
      mainFile: manifest.mainFile
    });

  } catch (error) {
    console.error('❌ Quality report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get system status
 * GET /api/status
 */
app.get('/api/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const manifest = await loadTenantManifest(tenantId, personaId);
    const hasData = Boolean(manifest);

    const transcripts = await transcriptService.listByTenant(tenantId);
    const totalTranscripts = transcripts.length;
    const lastTranscriptAt = transcripts.reduce((latest, item) => {
      if (!item?.lastMessageAt) return latest;
      const ts = new Date(item.lastMessageAt).getTime();
      return Math.max(latest, Number.isFinite(ts) ? ts : 0);
    }, 0);

    res.json({
      success: true,
      status: {
        serverRunning: true,
        dataUploaded: hasData,
        uploadTime: manifest?.uploadTime || null,
        totalRecords: manifest?.mainFile?.rows || 0,
        qualityScore: manifest?.qualityReport?.qualityScore || null,
        totalFiles: manifest?.files?.length || 0,
        fileTypes: manifest?.fileTypes || { tracking: 0, knowledge: 0, other: 0 },
        claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        tenantId,
        persona: personaId || null,
        manifestPath: manifest ? manifestRelativePath(tenantId, personaId) : null,
        transcripts: {
          total: totalTranscripts,
          lastMessageAt: lastTranscriptAt ? new Date(lastTranscriptAt).toISOString() : null
        }
      },
      manifest: manifest
    });
  } catch (error) {
    console.error('❌ Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load status'
    });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const companies = await dataStore.list(
      COMPANIES_COLLECTION,
      null,
      { tenantId, personaId }
    );

    res.json(companies);
  } catch (error) {
    console.error('Failed to list companies:', error);
    res.status(500).json({ error: 'Unable to load companies' });
  }
});

app.post('/api/companies', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const payload = {
      ...(req.body || {}),
      tenantId,
      persona: personaId || null
    };

    const record = await dataStore.create(
      COMPANIES_COLLECTION,
      payload,
      { tenantId, personaId }
    );

    res.status(201).json(record);
  } catch (error) {
    console.error('Failed to create company:', error);
    res.status(500).json({ error: 'Unable to create company record' });
  }
});

app.get('/api/companies/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const record = await dataStore.get(
      COMPANIES_COLLECTION,
      req.params.id,
      { tenantId, personaId }
    );

    if (!record) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Failed to load company:', error);
    res.status(500).json({ error: 'Unable to load company' });
  }
});

app.patch('/api/companies/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const companyId = req.params.id;
    const existing = await dataStore.get(
      COMPANIES_COLLECTION,
      companyId,
      { tenantId, personaId }
    );

    if (!existing) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const updates = { ...(req.body || {}) };
    delete updates.id;
    delete updates.tenantId;
    delete updates.persona;

    const record = await dataStore.update(
      COMPANIES_COLLECTION,
      companyId,
      {
        ...updates,
        tenantId,
        persona: personaId || existing.persona || null
      },
      { tenantId, personaId }
    );

    res.json(record);
  } catch (error) {
    console.error('Failed to update company:', error);
    res.status(500).json({ error: 'Unable to update company' });
  }
});

app.delete('/api/companies/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const deleted = await dataStore.delete(
      COMPANIES_COLLECTION,
      req.params.id,
      { tenantId, personaId }
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ deleted: true });
  } catch (error) {
    console.error('Failed to delete company:', error);
    res.status(500).json({ error: 'Unable to delete company' });
  }
});

app.get('/api/personas', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personas = await dataStore.list(
      PERSONAS_COLLECTION,
      null,
      { tenantId }
    );

    res.json({
      success: true,
      tenantId,
      count: personas.length,
      data: personas
    });
  } catch (error) {
    console.error('Failed to list personas:', error);
    res.status(500).json({ success: false, error: 'Unable to load personas' });
  }
});

app.post('/api/personas', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description, personaId: rawPersonaId, type, config, metadata } = req.body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'Persona name is required' });
    }

    const personaKey = sanitizePersonaKey(rawPersonaId || name);
    if (!personaKey) {
      return res.status(400).json({ success: false, error: 'Invalid persona identifier' });
    }

    const existing = await dataStore.list(
      PERSONAS_COLLECTION,
      record => record?.personaId === personaKey,
      { tenantId }
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Persona already exists' });
    }

    const payload = {
      name,
      description: description || '',
      personaId: personaKey,
      tenantId,
      type: type || 'custom',
      config: config ?? null,
      metadata: metadata ?? null
    };

    const record = await dataStore.create(
      PERSONAS_COLLECTION,
      payload,
      { tenantId }
    );

    res.status(201).json({ success: true, record });
  } catch (error) {
    console.error('Failed to create persona:', error);
    res.status(500).json({ success: false, error: 'Unable to create persona' });
  }
});

app.get('/api/personas/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const record = await dataStore.get(
      PERSONAS_COLLECTION,
      req.params.id,
      { tenantId }
    );

    if (!record) {
      return res.status(404).json({ success: false, error: 'Persona not found' });
    }

    res.json({ success: true, record });
  } catch (error) {
    console.error('Failed to load persona:', error);
    res.status(500).json({ success: false, error: 'Unable to load persona' });
  }
});

app.patch('/api/personas/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = req.params.id;
    const existing = await dataStore.get(
      PERSONAS_COLLECTION,
      personaId,
      { tenantId }
    );

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Persona not found' });
    }

    const updates = { ...(req.body || {}) };
    if (updates.personaId) {
      const newKey = sanitizePersonaKey(updates.personaId);
      if (!newKey) {
        return res.status(400).json({ success: false, error: 'Invalid persona identifier' });
      }

      const conflict = await dataStore.list(
        PERSONAS_COLLECTION,
        record => record?.personaId === newKey && record?.id !== personaId,
        { tenantId }
      );
      if (conflict.length > 0) {
        return res.status(409).json({ success: false, error: 'Persona identifier already in use' });
      }

      updates.personaId = newKey;
    }

    delete updates.id;
    delete updates.tenantId;

    const record = await dataStore.update(
      PERSONAS_COLLECTION,
      personaId,
      updates,
      { tenantId }
    );

    res.json({ success: true, record });
  } catch (error) {
    console.error('Failed to update persona:', error);
    res.status(500).json({ success: false, error: 'Unable to update persona' });
  }
});

app.delete('/api/personas/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await dataStore.delete(
      PERSONAS_COLLECTION,
      req.params.id,
      { tenantId }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Persona not found' });
    }

    res.json({ success: true, deleted: true });
  } catch (error) {
    console.error('Failed to delete persona:', error);
    res.status(500).json({ success: false, error: 'Unable to delete persona' });
  }
});

/**
 * Delete individual file
 * DELETE /api/delete-file
 */
app.delete('/api/delete-file', async (req, res) => {
  try {
    const { fileName } = req.body;
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    const manifest = await loadTenantManifest(tenantId, personaId);

    if (!manifest) {
      return res.status(404).json({
        success: false,
        error: 'No data uploaded for current tenant'
      });
    }

    const filesToDelete = manifest.files.filter(f => f.name === fileName);
    let deletedCount = 0;
    const deletedArtifacts = [];

    for (const entry of filesToDelete) {
      const filenames = getArtifactFilenames(entry);
      for (const filename of filenames) {
        if (await deleteProcessedFile(filename)) {
          deletedCount++;
          deletedArtifacts.push(filename);
        }
      }
    }

    manifest.files = manifest.files.filter(f => f.name !== fileName);
    recalculateManifestStats(manifest);

    if (manifest.files.length === 0) {
      await deleteTenantManifest(tenantId, personaId);
    } else {
      await saveTenantManifest(tenantId, manifest, personaId);
    }

    console.log(`🗑️ Deleted ${deletedCount} processed artifacts for ${fileName} (tenant=${tenantId})`);

    res.json({
      success: true,
      message: `File ${fileName} deleted successfully`,
      deletedArtifacts
    });

  } catch (error) {
    console.error('❌ Delete file error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete file'
    });
  }
});

/**
 * Clear all data (for testing)
 * DELETE /api/clear
 */
app.delete('/api/clear', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    let deletedCount = 0;

    const manifest = await loadTenantManifest(tenantId, personaId);

    const manifestArtifacts = manifest?.files?.flatMap(entry => getArtifactFilenames(entry)) || [];

    for (const filename of manifestArtifacts) {
      if (await deleteProcessedFile(filename)) {
        deletedCount++;
      }
    }

    await deleteTenantManifest(tenantId, personaId);

    console.log(`🗑️ Cleared ${deletedCount} processed artifacts for tenant ${tenantId}`);

    res.json({
      success: true,
      message: `All data cleared for tenant ${tenantId}`,
      persona: personaId || null,
      deletedCount
    });

  } catch (error) {
    console.error('❌ Clear error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get analytics records
 * GET /api/analytics
 */
app.get('/api/analytics', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const type = (req.query?.type || '').toString().trim() || null;
    const personaId = getPersonaId(req);

    const records = await analyticsService.listAnalyticsRecords({
      tenantId,
      type,
      personaId,
      limit: parseInt(req.query?.limit, 10) || 500
    });

    res.json({
      success: true,
      tenantId,
      persona: personaId || null,
      type,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('❌ Analytics fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load analytics data'
    });
  }
});

/**
 * Record analytics event
 * POST /api/analytics
 */
app.post('/api/analytics', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const payload = {
      ...req.body,
      tenantId,
      persona: personaId
    };

    const record = await analyticsService.recordAnalyticsEvent(payload);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: payload.ai_type || personaId || 'unknown',
      action: 'analytics_recorded',
      metadata: {
        recordId: record.id,
        usageDate: record.usage_date,
        success: record.success,
        sessionDuration: record.session_duration || null
      }
    });

    res.status(201).json({
      success: true,
      record
    });
  } catch (error) {
    console.error('❌ Analytics record error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record analytics event'
    });
  }
});

function buildConfigResponse(record) {
  if (!record) return null;
  const {
    id,
    tenantId,
    persona,
    company_id,
    ai_link,
    product_info_file,
    custom_prompt,
    sales_approach,
    qualification_questions,
    response_tone,
    support_categories,
    escalation_rules,
    response_style,
    primary_language,
    collect_feedback,
    save_transcripts,
    multi_language,
    job_role,
    job_description,
    interview_questions,
    usage_count,
    last_used,
    status,
    createdAt,
    updatedAt
  } = record;

  return {
    id,
    tenantId,
    persona,
    company_id,
    ai_link,
    product_info_file,
    custom_prompt,
    sales_approach,
    qualification_questions,
    response_tone,
    support_categories,
    escalation_rules,
    response_style,
    primary_language,
    collect_feedback,
    save_transcripts,
    multi_language,
    job_role,
    job_description,
    interview_questions,
    usage_count,
    last_used,
    status,
    createdAt,
    updatedAt
  };
}

function buildLinkEventMetadata(record) {
  return {
    configId: record?.id || null,
    tenantId: record?.tenantId || null,
    persona: record?.persona || null,
    aiLink: record?.ai_link || null
  };
}

app.get('/api/sales-ai', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const config = await aiConfigService.getConfig('sales', tenantId, personaId);
    res.json({
      success: true,
      data: config ? [buildConfigResponse(config)] : []
    });
  } catch (error) {
    console.error('❌ Sales AI fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load Sales AI configuration'
    });
  }
});

app.post('/api/sales-ai', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const record = await aiConfigService.upsertConfig('sales', tenantId, {
      ...req.body
    }, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: 'sales',
      action: 'config_created',
      metadata: buildLinkEventMetadata(record)
    });

    res.status(201).json({
      success: true,
      record: buildConfigResponse(record)
    });
  } catch (error) {
    console.error('❌ Sales AI create error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Sales AI configuration'
    });
  }
});

app.patch('/api/sales-ai/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const { id } = req.params;
    const updated = await aiConfigService.updateConfig('sales', id, tenantId, req.body, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: 'sales',
      action: 'config_updated',
      metadata: buildLinkEventMetadata(updated)
    });

    res.json({
      success: true,
      record: buildConfigResponse(updated)
    });
  } catch (error) {
    console.error('❌ Sales AI update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update Sales AI configuration'
    });
  }
});

app.get('/api/support-ai', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const config = await aiConfigService.getConfig('support', tenantId, personaId);
    res.json({
      success: true,
      data: config ? [buildConfigResponse(config)] : []
    });
  } catch (error) {
    console.error('❌ Support AI fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load Support AI configuration'
    });
  }
});

app.post('/api/support-ai', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const record = await aiConfigService.upsertConfig('support', tenantId, {
      ...req.body
    }, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: 'support',
      action: 'config_created',
      metadata: buildLinkEventMetadata(record)
    });

    res.status(201).json({
      success: true,
      record: buildConfigResponse(record)
    });
  } catch (error) {
    console.error('❌ Support AI create error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Support AI configuration'
    });
  }
});

app.patch('/api/support-ai/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const { id } = req.params;
    const updated = await aiConfigService.updateConfig('support', id, tenantId, req.body, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: 'support',
      action: 'config_updated',
      metadata: buildLinkEventMetadata(updated)
    });

    res.json({
      success: true,
      record: buildConfigResponse(updated)
    });
  } catch (error) {
    console.error('❌ Support AI update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update Support AI configuration'
    });
  }
});

app.get('/api/interview-ai', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = req.query?.persona || req.headers['x-persona-id'] || null;
    const config = await aiConfigService.getConfig('interview', tenantId, personaId);
    res.json({
      success: true,
      data: config ? [buildConfigResponse(config)] : []
    });
  } catch (error) {
    console.error('❌ Interview AI fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load Interview AI configuration'
    });
  }
});

app.post('/api/interview-ai', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const record = await aiConfigService.upsertConfig('interview', tenantId, {
      ...req.body
    }, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: 'interview',
      action: 'config_created',
      metadata: buildLinkEventMetadata(record)
    });

    res.status(201).json({
      success: true,
      record: buildConfigResponse(record)
    });
  } catch (error) {
    console.error('❌ Interview AI create error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Interview AI configuration'
    });
  }
});

app.patch('/api/interview-ai/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const { id } = req.params;
    const updated = await aiConfigService.updateConfig('interview', id, tenantId, req.body, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: 'interview',
      action: 'config_updated',
      metadata: buildLinkEventMetadata(updated)
    });

    res.json({
      success: true,
      record: buildConfigResponse(updated)
    });
  } catch (error) {
    console.error('❌ Interview AI update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update Interview AI configuration'
    });
  }
});

app.get('/api/transcripts', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = req.query?.persona || req.headers['x-persona-id'] || null;
    const transcripts = await transcriptService.listByTenant(tenantId, personaId);
    const sanitized = transcripts.map(item => ({
      id: item.id,
      conversationId: item.conversationId,
      tenantId: item.tenantId,
      persona: item.persona || null,
      startedAt: item.startedAt,
      lastMessageAt: item.lastMessageAt,
      metadata: item.metadata || {}
    }));

    res.json({
      success: true,
      data: sanitized
    });
  } catch (error) {
    console.error('❌ Transcript list error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load transcripts'
    });
  }
});

app.get('/api/transcripts/:id/download', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = req.query?.persona || req.headers['x-persona-id'] || null;
    const { id } = req.params;
    const url = await transcriptService.getDownloadLink(id, tenantId, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: personaId || 'transcript',
      action: 'transcript_download_link',
      metadata: {
        transcriptId: id,
        persona: personaId || null,
        url
      }
    });

    res.json({
      success: true,
      url
    });
  } catch (error) {
    console.error('❌ Transcript download error:', error);
    const status = error.message === 'Forbidden' ? 403 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to generate download link'
    });
  }
});

app.post('/api/transcripts/:id/send', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const personaId = req.query?.persona || req.headers['x-persona-id'] || null;
    const { id } = req.params;
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const result = await transcriptService.sendTranscript(id, email, tenantId, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: personaId || 'transcript',
      action: 'transcript_send',
      metadata: {
        transcriptId: id,
        persona: personaId || null,
        email: result.email,
        downloadUrl: result.downloadUrl || null
      }
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('❌ Transcript send error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send transcript'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB per file.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum is 10 files per upload.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Support AI Server with MCP');
  console.log('================================');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🤖 Claude Model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'}`);
  console.log('📁 Storage backend:', process.env.STORAGE_BACKEND || 'local');
  console.log('');
  console.log('📋 API Endpoints:');
  console.log(`   POST   http://localhost:${PORT}/api/upload`);
  console.log(`   POST   http://localhost:${PORT}/api/chat`);
  console.log(`   GET    http://localhost:${PORT}/api/status`);
  console.log(`   GET    http://localhost:${PORT}/api/quality-report`);
  console.log(`   DELETE http://localhost:${PORT}/api/clear`);
  console.log('');
  console.log('💡 Open http://localhost:${PORT} in your browser to use the web interface');
  console.log('');
});

export default app;

