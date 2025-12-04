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
import auth from './src/services/auth.js';
import billing from './src/services/billing.js';
import { createTenantBuckets } from './src/services/tenant-buckets.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint for App Runner / Load Balancers
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    storage: process.env.STORAGE_BACKEND || 'local',
    cognito: auth.isCognitoConfigured() ? 'configured' : 'not configured'
  });
});

const COMPANIES_COLLECTION = 'companies';
const SALES_AI_COLLECTION = 'sales_ai';
const SUPPORT_AI_COLLECTION = 'support_ai';
const INTERVIEW_AI_COLLECTION = 'interview_ai';
const ANALYTICS_COLLECTION = 'usage_analytics';
const TRANSCRIPTS_COLLECTION = 'transcripts';
const PERSONAS_COLLECTION = 'personas';

const DEFAULT_PERSONA_TEMPLATES = [
  {
    personaId: 'sales',
    name: 'Sales Assistant',
    description: 'Handles prospect outreach and provides product context for sales conversations.',
    type: 'sales',
    config: { category: 'sales' },
    metadata: { role: 'sales', isDefault: true }
  },
  {
    personaId: 'support',
    name: 'Support Specialist',
    description: 'Guides customers through troubleshooting steps and support workflows.',
    type: 'support',
    config: { category: 'support' },
    metadata: { role: 'support', isDefault: true }
  },
  {
    personaId: 'interview',
    name: 'Interview Coach',
    description: 'Prepares candidates with behavioral and role-specific interview practice.',
    type: 'interview',
    config: { category: 'interview' },
    metadata: { role: 'interview', isDefault: true }
  }
];

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

async function ensureDefaultPersonas(tenantId) {
  if (!tenantId) {
    return [];
  }

  const existing = await dataStore.list(
    PERSONAS_COLLECTION,
    null,
    { tenantId }
  );

  const personas = Array.isArray(existing) ? [...existing] : [];
  const existingKeys = new Set(
    personas
      .map(persona => {
        const key = sanitizePersonaKey(persona?.personaId || persona?.id);
        return key ? key.toLowerCase() : null;
      })
      .filter(Boolean)
  );

  let createdAny = false;

  for (const template of DEFAULT_PERSONA_TEMPLATES) {
    const personaKey = sanitizePersonaKey(template.personaId || template.name);
    if (!personaKey) {
      continue;
    }

    const keyToken = personaKey.toLowerCase();
    if (existingKeys.has(keyToken)) {
      continue;
    }

    const payload = {
      ...template,
      personaId: personaKey,
      tenantId,
      type: template.type || 'default',
      config: template.config ?? null,
      metadata: {
        ...(template.metadata || {}),
        isDefault: true
      }
    };

    const { record, created } = await dataStore.upsert(
      PERSONAS_COLLECTION,
      item => sanitizePersonaKey(item?.personaId || item?.id) === personaKey,
      payload,
      { tenantId }
    );

    existingKeys.add(keyToken);

    if (created && record) {
      personas.push(record);
      createdAny = true;
    }
  }

  let finalList = personas;

  if (createdAny) {
    finalList = await dataStore.list(
      PERSONAS_COLLECTION,
      null,
      { tenantId }
    );
  }

  return finalList
    .map(persona => ({
      ...persona,
      metadata: persona.metadata || { isDefault: false }
    }))
    .sort((a, b) => {
      const nameA = (a.name || a.personaId || '').toLowerCase();
      const nameB = (b.name || b.personaId || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
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
    const personas = await ensureDefaultPersonas(tenantId);

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
 * Get analytics summary with aggregated metrics
 * GET /api/analytics/summary
 */
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const summary = await analyticsService.getAnalyticsSummary(tenantId);

    res.json({
      success: true,
      tenantId,
      summary
    });
  } catch (error) {
    console.error('❌ Analytics summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load analytics summary'
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

// ===== INTERVIEW AI - AI-POWERED ENDPOINTS =====

// Generate interview questions using AI
app.post('/api/interview-ai/generate-questions', async (req, res) => {
  try {
    const { jobDescription, roleType, questionCount = 5 } = req.body;
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    
    if (!jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Job description is required'
      });
    }

    const prompt = `You are an expert HR interviewer. Generate ${questionCount} interview questions for the following role:

Role Type: ${roleType || 'general'}
Job Description: ${jobDescription}

Generate questions that:
1. Assess relevant skills and experience
2. Include behavioral/situational questions
3. Are appropriate for the role level
4. Help identify strong candidates

Return ONLY a JSON array of question objects with this format:
[
  {
    "question": "The interview question",
    "category": "Experience|Situational|Technical|Behavioral|Cultural Fit",
    "evaluationCriteria": "What to look for in a good answer"
  }
]`;

    const response = await claudeClient.rawChat([
      { role: 'user', content: prompt }
    ]);

    // Parse the response
    let questions = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to template questions
      questions = getTemplateQuestions(roleType);
    }

    res.json({
      success: true,
      questions: questions.map((q, i) => ({
        id: `ai_q${i + 1}_${Date.now()}`,
        question: q.question,
        category: q.category || 'General',
        evaluationCriteria: q.evaluationCriteria || '',
        editable: true
      })),
      tags: {
        tenantId,
        personaId,
        roleType: roleType || 'general',
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Generate questions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate interview questions'
    });
  }
});

// Generate job description using AI
app.post('/api/interview-ai/generate-job-description', async (req, res) => {
  try {
    const { roleInput, roleType } = req.body;
    
    if (!roleInput) {
      return res.status(400).json({
        success: false,
        error: 'Role input is required'
      });
    }

    const prompt = `You are an HR expert. Generate a professional job description based on this input:

Role Type: ${roleType || 'general'}
Input: ${roleInput}

Generate a structured job description with:
1. Job Title
2. Department
3. Job Summary (2-3 sentences)
4. Key Responsibilities (5 bullet points)
5. Requirements (5 bullet points)
6. Benefits (4 bullet points)

Return ONLY a JSON object with this format:
{
  "jobTitle": "...",
  "department": "...",
  "jobSummary": "...",
  "keyResponsibilities": ["...", "...", "...", "...", "..."],
  "requirements": ["...", "...", "...", "...", "..."],
  "benefits": ["...", "...", "...", "..."]
}`;

    const response = await claudeClient.rawChat([
      { role: 'user', content: prompt }
    ]);

    let jobDescription = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jobDescription = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    if (!jobDescription) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate job description'
      });
    }

    res.json({
      success: true,
      jobDescription
    });

  } catch (error) {
    console.error('❌ Generate job description error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate job description'
    });
  }
});

// Start candidate interview session
app.post('/api/interview-ai/start-session', async (req, res) => {
  try {
    const { configId, candidateName, candidateEmail } = req.body;
    const tenantId = getTenantId(req);
    const personaId = getPersonaId(req);
    const companyId = req.headers['x-company-id'] || null;
    
    // Generate session ID
    const sessionId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get interview config
    const config = await aiConfigService.getById('interview', configId, tenantId);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Interview configuration not found'
      });
    }

    // Parse questions
    let questions = [];
    try {
      questions = JSON.parse(config.interview_questions || '[]');
    } catch (e) {
      questions = [];
    }

    // Create session record with company and persona tags
    const session = {
      sessionId,
      configId,
      tenantId,
      personaId,
      companyId,
      candidateName,
      candidateEmail,
      questions,
      currentQuestionIndex: 0,
      responses: [],
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      jobRole: config.job_role,
      jobDescription: config.custom_prompt,
      // Tags for filtering and billing
      tags: {
        company: config.company_name || tenantId,
        persona: personaId || 'interview',
        roleType: config.job_role || 'custom',
        tenantId: tenantId
      }
    };

    // Store session (using data store)
    await dataStore.create('interview_sessions', session, { tenantId });

    res.json({
      success: true,
      sessionId,
      totalQuestions: questions.length,
      currentQuestion: questions[0] || null,
      jobTitle: config.job_role,
      tags: session.tags
    });

  } catch (error) {
    console.error('❌ Start interview session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start interview session'
    });
  }
});

// Submit candidate response and get next question
app.post('/api/interview-ai/submit-response', async (req, res) => {
  try {
    const { sessionId, questionId, response } = req.body;
    const tenantId = getTenantId(req);

    // Get session
    const sessions = await dataStore.list('interview_sessions', { tenantId });
    const session = sessions.find(s => s.sessionId === sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found'
      });
    }

    // Evaluate response using AI
    const currentQuestion = session.questions[session.currentQuestionIndex];
    const evaluationPrompt = `You are an expert interviewer evaluating a candidate's response.

Question: ${currentQuestion.question}
Category: ${currentQuestion.category}
${currentQuestion.evaluationCriteria ? `Evaluation Criteria: ${currentQuestion.evaluationCriteria}` : ''}

Candidate's Response: ${response}

Evaluate the response and provide:
1. A score from 1-10
2. Key strengths in the answer
3. Areas for improvement
4. Overall assessment

Return ONLY a JSON object:
{
  "score": 7,
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "assessment": "Brief overall assessment"
}`;

    let evaluation = { score: 5, strengths: [], improvements: [], assessment: 'Response recorded' };
    try {
      const aiResponse = await claudeClient.rawChat([
        { role: 'user', content: evaluationPrompt }
      ]);
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      }
    } catch (evalError) {
      console.error('Failed to evaluate response:', evalError);
    }

    // Store response
    session.responses.push({
      questionId,
      question: currentQuestion.question,
      response,
      evaluation,
      answeredAt: new Date().toISOString()
    });

    // Move to next question
    session.currentQuestionIndex++;
    const isComplete = session.currentQuestionIndex >= session.questions.length;

    if (isComplete) {
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      
      // Calculate overall score
      const totalScore = session.responses.reduce((sum, r) => sum + (r.evaluation?.score || 0), 0);
      session.overallScore = Math.round(totalScore / session.responses.length * 10) / 10;
    }

    // Update session
    await dataStore.update('interview_sessions', session.id, session, { tenantId });

    res.json({
      success: true,
      evaluation,
      isComplete,
      nextQuestion: isComplete ? null : session.questions[session.currentQuestionIndex],
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.questions.length,
      overallScore: session.overallScore || null
    });

  } catch (error) {
    console.error('❌ Submit response error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit response'
    });
  }
});

// Get interview results
app.get('/api/interview-ai/results/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const tenantId = getTenantId(req);

    const sessions = await dataStore.list('interview_sessions', { tenantId });
    const session = sessions.find(s => s.sessionId === sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found'
      });
    }

    res.json({
      success: true,
      results: {
        sessionId: session.sessionId,
        candidateName: session.candidateName,
        candidateEmail: session.candidateEmail,
        jobRole: session.jobRole,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        overallScore: session.overallScore,
        responses: session.responses,
        totalQuestions: session.questions.length,
        questionsAnswered: session.responses.length,
        tags: session.tags || {
          company: session.tenantId,
          persona: session.personaId || 'interview',
          tenantId: session.tenantId
        }
      }
    });

  } catch (error) {
    console.error('❌ Get results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get interview results'
    });
  }
});

// Download interview results as formatted HTML
app.get('/api/interview-ai/results/:sessionId/download', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const tenantId = getTenantId(req);
    const format = req.query?.format || 'html';

    const sessions = await dataStore.list('interview_sessions', { tenantId });
    const session = sessions.find(s => s.sessionId === sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found'
      });
    }

    if (format === 'json') {
      // Return raw JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="interview-${sessionId.slice(-6)}.json"`);
      return res.json(session);
    }

    // Generate formatted HTML
    const html = generateInterviewHTML(session);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="interview-${sessionId.slice(-6)}.html"`);
    return res.send(html);

  } catch (error) {
    console.error('❌ Download results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download interview results'
    });
  }
});

// Generate formatted interview HTML
function generateInterviewHTML(session, timezone = 'Asia/Singapore') {
  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('en-SG', { 
      timeZone: timezone,
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true 
    });
  };

  const escapeHtml = (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
  };

  const getScoreColor = (score) => {
    if (score >= 8) return '#059669';
    if (score >= 6) return '#d97706';
    return '#dc2626';
  };

  const overallScore = session.overallScore || 0;
  const status = session.status || 'in_progress';
  const statusLabel = status === 'completed' ? '✅ Completed' : '🔄 In Progress';
  const statusColor = status === 'completed' ? '#059669' : '#d97706';

  const responsesHtml = (session.responses || []).map((r, idx) => {
    const score = r.evaluation?.score || 0;
    const scoreColor = getScoreColor(score);
    
    return `
      <div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #374151;">
            Question ${idx + 1}
          </div>
          <div style="background: ${scoreColor}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 600;">
            ${score}/10
          </div>
        </div>
        
        <div style="margin-bottom: 12px;">
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">QUESTION</div>
          <div style="color: #1f2937; padding: 8px; background: white; border-radius: 4px;">
            ${escapeHtml(r.question)}
          </div>
        </div>
        
        <div style="margin-bottom: 12px;">
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">CANDIDATE RESPONSE</div>
          <div style="color: #1f2937; padding: 8px; background: white; border-radius: 4px; border-left: 3px solid #C8102E;">
            ${escapeHtml(r.response)}
          </div>
        </div>
        
        ${r.evaluation?.feedback ? `
        <div>
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">AI EVALUATION</div>
          <div style="color: #4b5563; padding: 8px; background: #fef2f2; border-radius: 4px; font-style: italic;">
            ${escapeHtml(r.evaluation.feedback)}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');

  const questionsAnswered = (session.responses || []).length;
  const totalQuestions = (session.questions || []).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Results - ${session.candidateName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #fff; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div style="border-bottom: 3px solid #C8102E; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="color: #C8102E; margin: 0 0 8px 0; font-size: 24px;">📋 Interview Results</h1>
    <div style="font-size: 20px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">
      ${escapeHtml(session.candidateName)}
    </div>
    <div style="color: #6b7280; font-size: 14px;">
      ${escapeHtml(session.candidateEmail)}
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
    <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
      <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">JOB ROLE</div>
      <div style="color: #1f2937; font-weight: 600;">${escapeHtml(session.jobRole) || 'Custom Role'}</div>
    </div>
    <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
      <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">STATUS</div>
      <div style="color: ${statusColor}; font-weight: 600;">${statusLabel}</div>
    </div>
    <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
      <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">STARTED</div>
      <div style="color: #1f2937; font-weight: 600;">${formatTime(session.startedAt)}</div>
    </div>
    <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
      <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">COMPLETED</div>
      <div style="color: #1f2937; font-weight: 600;">${formatTime(session.completedAt)}</div>
    </div>
  </div>

  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; padding: 24px 48px; background: linear-gradient(135deg, #C8102E 0%, #8B0000 100%); border-radius: 12px; color: white;">
      <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px;">OVERALL SCORE</div>
      <div style="font-size: 48px; font-weight: bold;">${overallScore}<span style="font-size: 24px; opacity: 0.8;">/10</span></div>
      <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${questionsAnswered} of ${totalQuestions} questions answered</div>
    </div>
  </div>

  <h2 style="color: #1f2937; margin-bottom: 16px; font-size: 18px;">Responses & Evaluations</h2>
  ${responsesHtml || '<p style="color: #6b7280;">No responses recorded yet.</p>'}

  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center;">
    Generated by Enterprise Lite AI Platform • ${formatTime(new Date().toISOString())}
  </div>

  <div class="no-print" style="margin-top: 24px; text-align: center;">
    <button onclick="window.print()" style="background: #C8102E; color: white; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-size: 14px;">
      🖨️ Print / Save as PDF
    </button>
  </div>
</body>
</html>`;
}

// Send interview results via email
app.post('/api/interview-ai/results/:sessionId/send', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { email } = req.body;
    const tenantId = getTenantId(req);

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    const sessions = await dataStore.list('interview_sessions', { tenantId });
    const session = sessions.find(s => s.sessionId === sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Interview session not found'
      });
    }

    // Build email content
    const overallScore = session.overallScore ? `${session.overallScore}/10` : 'N/A';
    const responseSummary = (session.responses || []).map((r, idx) => 
      `Question ${idx + 1}: ${r.question}\nAnswer: ${r.response}\nScore: ${r.evaluation?.score || '-'}/10\n`
    ).join('\n');

    const emailContent = `
Interview Results for ${session.candidateName}
================================================

Job Role: ${session.jobRole || 'Custom Role'}
Status: ${session.status}
Completed: ${session.completedAt || 'In Progress'}
Overall Score: ${overallScore}

Responses:
${responseSummary}

---
Powered by Enterprise Lite AI Platform
    `.trim();

    // For now, log and return success (email service integration pending)
    console.log(`📧 Interview results email requested for ${sessionId} to ${email}`);
    console.log('Email content preview:', emailContent.substring(0, 200) + '...');

    // TODO: Integrate with actual email service (nodemailer configured in transcript-service)
    // For now return success - can be enhanced later
    
    res.json({
      success: true,
      message: `Interview results would be sent to ${email}`,
      preview: emailContent.substring(0, 500)
    });

  } catch (error) {
    console.error('❌ Send results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send interview results'
    });
  }
});

// List all interview sessions for a tenant
app.get('/api/interview-ai/sessions', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const sessions = await dataStore.list('interview_sessions', { tenantId });

    res.json({
      success: true,
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        candidateName: s.candidateName,
        candidateEmail: s.candidateEmail,
        jobRole: s.jobRole,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        overallScore: s.overallScore,
        questionsAnswered: s.responses?.length || 0,
        totalQuestions: s.questions?.length || 0
      }))
    });

  } catch (error) {
    console.error('❌ List sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list interview sessions'
    });
  }
});

// Helper function for template questions
function getTemplateQuestions(roleType) {
  const templates = {
    'sales': [
      { question: 'Tell me about your previous sales experience and your biggest achievement.', category: 'Experience', evaluationCriteria: 'Look for specific metrics and results' },
      { question: 'How do you handle rejection and maintain motivation in sales?', category: 'Behavioral', evaluationCriteria: 'Resilience and positive mindset' },
      { question: 'Describe your approach to building relationships with new clients.', category: 'Situational', evaluationCriteria: 'Relationship-building skills' },
      { question: 'What strategies do you use to meet and exceed sales targets?', category: 'Experience', evaluationCriteria: 'Goal-oriented approach' },
      { question: 'How would you handle a situation where a customer is unhappy with our product?', category: 'Situational', evaluationCriteria: 'Problem-solving and empathy' }
    ],
    'customer-service': [
      { question: 'Describe a time when you dealt with a difficult customer. How did you handle it?', category: 'Behavioral', evaluationCriteria: 'Patience and conflict resolution' },
      { question: 'What does excellent customer service mean to you?', category: 'Cultural Fit', evaluationCriteria: 'Service mindset' },
      { question: 'How do you prioritize multiple customer requests when busy?', category: 'Situational', evaluationCriteria: 'Time management' },
      { question: 'Tell me about a time you went above and beyond for a customer.', category: 'Behavioral', evaluationCriteria: 'Initiative and dedication' },
      { question: 'How would you handle a situation where you don\'t know the answer?', category: 'Situational', evaluationCriteria: 'Honesty and resourcefulness' }
    ],
    'junior-tech': [
      { question: 'What interests you most about working in technology?', category: 'Cultural Fit', evaluationCriteria: 'Passion and motivation' },
      { question: 'Describe your experience with troubleshooting technical problems.', category: 'Technical', evaluationCriteria: 'Problem-solving approach' },
      { question: 'How do you stay current with new technologies and trends?', category: 'Experience', evaluationCriteria: 'Learning mindset' },
      { question: 'Tell me about a technical challenge you faced and how you solved it.', category: 'Behavioral', evaluationCriteria: 'Critical thinking' },
      { question: 'How would you explain a technical concept to a non-technical user?', category: 'Situational', evaluationCriteria: 'Communication skills' }
    ]
  };
  return templates[roleType] || templates['sales'];
}

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
    const format = req.query?.format || 'json'; // 'json' or 'html'

    if (format === 'html') {
      // Return formatted HTML for viewing/printing
      const html = await transcriptService.getFormattedTranscript(id, tenantId, personaId);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="transcript-${id.slice(-6)}.html"`);
      return res.send(html);
    }

    // Default: return S3 presigned URL for JSON
    const url = await transcriptService.getDownloadLink(id, tenantId, personaId);

    await emitUsageEvent({
      tenantId,
      organizationId: req.headers['x-company-id'] || null,
      persona: personaId || 'transcript',
      action: 'transcript_download_link',
      metadata: {
        transcriptId: id,
        persona: personaId || null,
        format,
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

// ===== AUTH ROUTES =====

/**
 * Check if auth is configured
 * GET /api/auth/status
 */
app.get('/api/auth/status', (req, res) => {
  res.json({
    success: true,
    configured: auth.isCognitoConfigured(),
    hostedUI: auth.isCognitoConfigured() ? auth.getHostedUIUrls(`${req.protocol}://${req.get('host')}/auth/callback`) : null
  });
});

/**
 * Sign up a new user
 * POST /api/auth/signup
 */
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, companyName, phone, address } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Generate tenant ID from company name or email
    const tenantId = companyName 
      ? sanitizeTenantId(companyName) 
      : sanitizeTenantId(email.split('@')[0]);

    const result = await auth.signUp(email, password, {
      name,
      tenantId,
      companyId: tenantId
    });

    // Create company record in database and S3 buckets
    if (result.success) {
      try {
        await dataStore.create(COMPANIES_COLLECTION, {
          tenantId,
          company_name: companyName || email.split('@')[0],
          contact_person: name || '',
          email,
          phone: phone || '',
          address: address || '',
          subscription_status: 'pending',
          subscription_plan: 'complete',
          cognitoSub: result.userSub
        }, { tenantId });

        // Create dedicated S3 buckets for this tenant if enabled
        if (process.env.PER_TENANT_BUCKETS === 'true') {
          try {
            const bucketResult = await createTenantBuckets(tenantId, companyName);
            console.log(`✅ Created S3 buckets for tenant ${tenantId}:`, bucketResult.buckets);
          } catch (bucketError) {
            console.warn('Failed to create tenant buckets:', bucketError.message);
            // Don't fail signup if bucket creation fails
          }
        }
      } catch (dbError) {
        console.warn('Failed to create company record:', dbError.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Signup failed'
    });
  }
});

/**
 * Confirm signup with verification code
 * POST /api/auth/confirm
 */
app.post('/api/auth/confirm', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Email and code are required' });
    }

    const result = await auth.confirmSignUp(email, code);
    res.json(result);
  } catch (error) {
    console.error('Confirm signup error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Confirmation failed'
    });
  }
});

/**
 * Sign in
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const result = await auth.signIn(email, password);

    // Get user info to include tenant
    if (result.success) {
      try {
        const user = await auth.getUser(result.accessToken);
        result.user = user;
      } catch (e) {
        console.warn('Could not fetch user info:', e.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Login failed'
    });
  }
});

/**
 * Refresh tokens
 * POST /api/auth/refresh
 */
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required' });
    }

    const result = await auth.refreshTokens(refreshToken);
    res.json(result);
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Token refresh failed'
    });
  }
});

/**
 * Get current user info
 * GET /api/auth/me
 */
app.get('/api/auth/me', auth.authMiddleware({ required: true }), async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

/**
 * Sign out
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', auth.authMiddleware({ required: false }), async (req, res) => {
  try {
    if (req.accessToken) {
      await auth.signOut(req.accessToken);
    }
    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    // Even if server-side signout fails, client should clear tokens
    res.json({ success: true, message: 'Signed out' });
  }
});

/**
 * Forgot password - initiate reset
 * POST /api/auth/forgot-password
 */
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const result = await auth.forgotPassword(email);
    res.json(result);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to initiate password reset'
    });
  }
});

/**
 * Reset password with code
 * POST /api/auth/reset-password
 */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, code, and new password are required' });
    }

    const result = await auth.confirmForgotPassword(email, code, newPassword);
    res.json(result);
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to reset password'
    });
  }
});

// ===== BILLING ROUTES =====

/**
 * Create Stripe checkout session
 * POST /api/billing/checkout
 */
app.post('/api/billing/checkout', auth.authMiddleware({ required: false }), async (req, res) => {
  try {
    const { email, companyName, plan = 'complete' } = req.body;
    const userEmail = req.user?.email || email;

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const session = await billing.createCheckoutSession({
      email: userEmail,
      companyName,
      plan,
      successUrl: `${baseUrl}/admin.html?subscription=success`,
      cancelUrl: `${baseUrl}/index.html?subscription=cancelled`
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

/**
 * Stripe webhook handler
 * POST /api/billing/webhook
 */
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const result = await billing.handleWebhook(req.body, sig);
    
    if (result.type === 'checkout.session.completed') {
      // Update company subscription status
      const { customer_email, metadata } = result.data;
      const tenantId = metadata?.tenantId || sanitizeTenantId(customer_email?.split('@')[0]);
      
      if (tenantId) {
        const companies = await dataStore.list(COMPANIES_COLLECTION, 
          c => c.email === customer_email, 
          { tenantId }
        );
        
        if (companies.length > 0) {
          await dataStore.update(COMPANIES_COLLECTION, companies[0].id, {
            subscription_status: 'active',
            subscription_date: new Date().toISOString(),
            stripeCustomerId: result.data.customer
          }, { tenantId });
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get subscription status
 * GET /api/billing/subscription
 */
app.get('/api/billing/subscription', auth.authMiddleware({ required: true }), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || getTenantId(req);
    
    const companies = await dataStore.list(COMPANIES_COLLECTION,
      c => c.tenantId === tenantId,
      { tenantId }
    );

    if (companies.length === 0) {
      return res.json({
        success: true,
        subscription: null
      });
    }

    const company = companies[0];
    
    res.json({
      success: true,
      subscription: {
        status: company.subscription_status,
        plan: company.subscription_plan,
        subscriptionDate: company.subscription_date,
        nextBillingDate: company.next_billing_date
      }
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get subscription status'
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
  console.log('🚀 Enterprise Lite AI Platform');
  console.log('================================');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🤖 Claude Model: ${process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'}`);
  console.log('📁 Storage backend:', process.env.STORAGE_BACKEND || 'local');
  console.log('🔐 Cognito auth:', auth.isCognitoConfigured() ? 'configured' : 'not configured');
  console.log('');
  console.log('📋 API Endpoints:');
  console.log(`   POST   /api/upload          - Upload files`);
  console.log(`   POST   /api/chat            - Chat with AI`);
  console.log(`   GET    /api/status          - System status`);
  console.log('');
  console.log('🔐 Auth Endpoints:');
  console.log(`   POST   /api/auth/signup     - Register new user`);
  console.log(`   POST   /api/auth/login      - Sign in`);
  console.log(`   GET    /api/auth/me         - Get current user`);
  console.log(`   POST   /api/auth/logout     - Sign out`);
  console.log('');
  console.log('💳 Billing Endpoints:');
  console.log(`   POST   /api/billing/checkout    - Create checkout`);
  console.log(`   GET    /api/billing/subscription - Get status`);
  console.log('');
  console.log(`💡 Open http://localhost:${PORT} in your browser`);
  console.log('');
});

export default app;

