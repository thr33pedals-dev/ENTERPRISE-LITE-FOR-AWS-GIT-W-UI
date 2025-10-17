import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processFiles, categorizeFiles, saveProcessedFiles, validateFile, sanitizeTenantId } from './src/file-processor.js';
import { createClaudeClient } from './src/claude-client.js';
import { analyzeDataQuality } from './src/quality-analyzer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create upload directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'uploads', 'processed');
const TEMP_DIR = path.join(__dirname, 'uploads', 'temp');
const MANIFESTS_DIR = path.join(PROCESSED_DIR, 'manifests');

[UPLOADS_DIR, PROCESSED_DIR, TEMP_DIR, MANIFESTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function getTenantId(req) {
  const headerTenant = req.headers['x-tenant-id'] || req.headers['x-tenant'];
  const queryTenant = req.query?.tenantId || req.query?.tenant;
  const candidate = headerTenant || queryTenant || 'default';
  const sanitized = sanitizeTenantId(candidate);
  return sanitized || 'default';
}

function getManifestPaths(tenantId) {
  const safeTenant = tenantId || 'default';
  const manifestFilename = `${safeTenant}.json`;
  const primaryPath = path.join(MANIFESTS_DIR, manifestFilename);
  const legacyPath = path.join(PROCESSED_DIR, 'manifest.json');
  return { safeTenant, primaryPath, legacyPath };
}

function loadTenantManifest(tenantId) {
  const { safeTenant, primaryPath, legacyPath } = getManifestPaths(tenantId);
  const candidates = safeTenant === 'default'
    ? [legacyPath, primaryPath]
    : [primaryPath];

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      return { manifest, path: candidate };
    } catch (err) {
      console.warn(`⚠️ Unable to parse manifest at ${candidate}:`, err.message);
    }
  }

  return null;
}

function saveTenantManifest(tenantId, manifest) {
  const { safeTenant, primaryPath, legacyPath } = getManifestPaths(tenantId);
  fs.writeFileSync(primaryPath, JSON.stringify({ ...manifest, tenantId: safeTenant }, null, 2));

  if (safeTenant === 'default' && legacyPath !== primaryPath && fs.existsSync(legacyPath)) {
    try {
      fs.unlinkSync(legacyPath);
    } catch (err) {
      console.warn('⚠️ Unable to remove legacy manifest:', err.message);
    }
  }

  return primaryPath;
}

function deleteTenantManifest(tenantId) {
  const { safeTenant, primaryPath, legacyPath } = getManifestPaths(tenantId);
  [primaryPath, legacyPath].forEach(candidate => {
    if (!candidate || !fs.existsSync(candidate)) return;
    try {
      fs.unlinkSync(candidate);
    } catch (err) {
      console.warn(`⚠️ Unable to delete manifest at ${candidate}:`, err.message);
    }
  });
}

function getArtifactFilenames(entry) {
  if (!entry?.artifacts) return [];
  const filenames = [];
  const { jsonFilename, txtFilename, metaFilename } = entry.artifacts;
  if (jsonFilename) filenames.push(jsonFilename);
  if (txtFilename) filenames.push(txtFilename);
  if (metaFilename) filenames.push(metaFilename);
  return filenames;
}

function deleteProcessedFile(filename) {
  if (!filename) return false;
  const fullPath = path.join(PROCESSED_DIR, filename);
  if (!fs.existsSync(fullPath)) return false;
  const stats = fs.lstatSync(fullPath);
  if (!stats.isFile()) return false;
  fs.unlinkSync(fullPath);
  return true;
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
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
  try {
    const tenantId = getTenantId(req);
    const tenantManifest = loadTenantManifest(tenantId);
    const manifestPath = tenantManifest?.path;
    const existingManifest = tenantManifest?.manifest || null;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No files uploaded' 
      });
    }

    console.log(`📁 Processing ${req.files.length} file(s)...`);

    // Process all files (Excel, PDF, DOCX, TXT, CSV)
    const processedFiles = await processFiles(req.files, { tenantId });

    if (!processedFiles || processedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to process files'
      });
    }

    // Categorize files (tracking vs knowledge)
    const categories = categorizeFiles(processedFiles);

    // Save processed files to filesystem (for MCP access)
    const savedFiles = saveProcessedFiles(processedFiles, PROCESSED_DIR, {
      tenantId,
      processedRoot: UPLOADS_DIR
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
      uploadedAt: timestamp,
      triage: f.triage || null,
      artifacts: {
        storageKey: savedFiles[idx]?.storageKey || null,
        jsonFilename: savedFiles[idx]?.jsonFilename || null,
        txtFilename: savedFiles[idx]?.txtFilename || null,
        metaFilename: savedFiles[idx]?.metaFilename || null,
        relativeJsonPath: savedFiles[idx]?.relativeJsonPath || null,
        relativeTxtPath: savedFiles[idx]?.relativeTxtPath || null,
        relativeMetaPath: savedFiles[idx]?.relativeMetaPath || null,
        parsedJsonPath: savedFiles[idx]?.artifacts?.parsedJsonPath || f?.artifacts?.parsedJsonPath || null,
        rawResponsePath: savedFiles[idx]?.artifacts?.rawResponsePath || f?.artifacts?.rawResponsePath || null,
        visionModel: savedFiles[idx]?.artifacts?.model || f?.artifacts?.model || null,
        visionGeneratedAt: savedFiles[idx]?.artifacts?.generatedAt || f?.artifacts?.generatedAt || null,
        promptPath: savedFiles[idx]?.artifacts?.promptPath || f?.artifacts?.promptPath || null,
        source: savedFiles[idx]?.artifacts?.source || f?.artifacts?.source || null
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
      tenantId
    };

    const savePath = saveTenantManifest(tenantId, manifest);

    // Clean up temp files
    req.files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn(`Failed to delete temp file: ${file.path}`);
      }
    });

    console.log('✅ Files processed successfully');
    console.log(`📊 Total files: ${processedFiles.length}`);
    console.log(`📋 Tracking: ${categories.tracking.length}, Knowledge: ${categories.knowledge.length}`);
    if (qualityReport) {
      console.log(`📊 Quality score: ${qualityReport.qualityScore}%`);
    }

    res.json({
      success: true,
      filesProcessed: req.files.length,
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
        manifestPath: path.relative(UPLOADS_DIR, savePath)
      }
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    // Clean up temp files on error
    if (req.files) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          // Ignore cleanup errors
        }
      });
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
    const { message, conversationHistory = [] } = req.body;
    const tenantId = getTenantId(req);

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    // Check if tracking data exists
    const tenantManifest = loadTenantManifest(tenantId);
    if (!tenantManifest?.manifest) {
      return res.status(400).json({
        success: false,
        error: 'No tracking data uploaded. Please upload Excel files first.'
      });
    }

    const manifest = tenantManifest.manifest;

    console.log(`💬 Customer question: ${message}`);

    // Call Claude with MCP access to files
    const response = await claudeClient.chat(message, conversationHistory, manifest);

    console.log(`🤖 Claude response: ${response.substring(0, 100)}...`);

    res.json({
      success: true,
      response: response,
      sources: manifest.mainFile ? manifest.mainFile.filename : 'Uploaded files' // Let user know which data was used
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
app.get('/api/quality-report', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tenantManifest = loadTenantManifest(tenantId);

    if (!tenantManifest?.manifest) {
      return res.status(404).json({
        success: false,
        error: 'No data uploaded yet'
      });
    }

    const manifest = tenantManifest.manifest;
    
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
app.get('/api/status', (req, res) => {
  const tenantId = getTenantId(req);
  const tenantManifest = loadTenantManifest(tenantId);
  const manifest = tenantManifest?.manifest || null;
  const manifestPath = tenantManifest?.path || null;
  const hasData = Boolean(manifest);

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
      manifestPath: manifestPath ? path.relative(UPLOADS_DIR, manifestPath) : null
    },
    manifest: manifest
  });
});

/**
 * Delete individual file
 * DELETE /api/delete-file
 */
app.delete('/api/delete-file', (req, res) => {
  try {
    const { fileName } = req.body;
    const tenantId = getTenantId(req);
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    const tenantManifest = loadTenantManifest(tenantId);
    const manifest = tenantManifest?.manifest;

    if (!manifest) {
      return res.status(404).json({
        success: false,
        error: 'No data uploaded for current tenant'
      });
    }

    const filesToDelete = manifest.files.filter(f => f.name === fileName);
    let deletedCount = 0;
    const deletedArtifacts = [];

    filesToDelete.forEach(entry => {
      const filenames = getArtifactFilenames(entry);
      filenames.forEach(filename => {
        if (deleteProcessedFile(filename)) {
          deletedCount++;
          deletedArtifacts.push(filename);
        }
      });
    });

    // Update manifest if it exists
    manifest.files = manifest.files.filter(f => f.name !== fileName);
    recalculateManifestStats(manifest);

    if (manifest.files.length === 0) {
      deleteTenantManifest(tenantId);
    } else {
      saveTenantManifest(tenantId, manifest);
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
app.delete('/api/clear', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    let deletedCount = 0;

    const tenantManifest = loadTenantManifest(tenantId);
    const manifest = tenantManifest?.manifest;

    const manifestArtifacts = manifest?.files?.flatMap(entry => getArtifactFilenames(entry)) || [];

    manifestArtifacts.forEach(filename => {
      if (deleteProcessedFile(filename)) {
        deletedCount++;
      }
    });

    deleteTenantManifest(tenantId);

    console.log(`🗑️ Cleared ${deletedCount} processed artifacts for tenant ${tenantId}`);

    res.json({
      success: true,
      message: `All data cleared for tenant ${tenantId}`,
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
  console.log(`📁 Uploads directory: ${PROCESSED_DIR}`);
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

