import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processFiles, categorizeFiles, saveProcessedFiles, validateFile } from './src/file-processor.js';
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

[UPLOADS_DIR, PROCESSED_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No files uploaded' 
      });
    }

    console.log(`📁 Processing ${req.files.length} file(s)...`);

    // Process all files (Excel, PDF, DOCX, TXT, CSV)
    const processedFiles = await processFiles(req.files);

    if (!processedFiles || processedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to process files'
      });
    }

    // Categorize files (tracking vs knowledge)
    const categories = categorizeFiles(processedFiles);

    // Save processed files to filesystem (for MCP access)
    const savedFiles = saveProcessedFiles(processedFiles, PROCESSED_DIR);

    // Analyze data quality (if tracking files exist)
    let qualityReport = null;
    let mainFile = null;
    
    if (categories.tracking.length > 0) {
      mainFile = categories.tracking[0];
      qualityReport = analyzeDataQuality(mainFile.data, mainFile.metadata.columns);
    }

    // Load existing manifest or create new one
    const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');
    let existingManifest = null;
    
    if (fs.existsSync(manifestPath)) {
      try {
        existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.log('⚠️ Could not load existing manifest, creating new one');
      }
    }

    // Create or update manifest for Claude (deduplicate by filename)
    const categoryByName = new Map();
    categories.tracking.forEach(f => categoryByName.set(f.originalName, 'tracking'));
    categories.knowledge.forEach(f => categoryByName.set(f.originalName, 'knowledge'));
    categories.other.forEach(f => categoryByName.set(f.originalName, 'other'));

    const timestamp = new Date().toISOString();
    const newFiles = processedFiles.map(f => ({
      name: f.originalName,
      type: f.fileType,
      metadata: f.metadata,
      category: categoryByName.get(f.originalName) || 'other',
      uploadedAt: timestamp
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
      qualityReport: qualityReport || existingManifest?.qualityReport
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

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
      files: processedFiles.map(f => ({
        name: f.originalName,
        type: f.fileType,
        size: f.fileSize
      })),
      mainFile: mainFile ? {
        name: mainFile.originalName,
        type: mainFile.fileType,
        rows: mainFile.data?.length || 0
      } : null,
      qualityReport: qualityReport,
      manifest: manifest
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

    if (!message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    // Check if tracking data exists
    const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.status(400).json({
        success: false,
        error: 'No tracking data uploaded. Please upload Excel files first.'
      });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

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
    const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({
        success: false,
        error: 'No data uploaded yet'
      });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
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
  const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');
  const hasData = fs.existsSync(manifestPath);
  
  let manifest = null;
  if (hasData) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (err) {
      // Ignore
    }
  }

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
      claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022'
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
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    // Find and delete files related to this filename (more precise matching)
    const files = fs.readdirSync(PROCESSED_DIR);
    let deletedCount = 0;
    
    files.forEach(file => {
      // More precise matching - only delete files that start with the exact filename
      const baseFileName = fileName.replace(/\.[^/.]+$/, '');
      if (file.startsWith(baseFileName) && !file.includes('manifest.json')) {
        fs.unlinkSync(path.join(PROCESSED_DIR, file));
        deletedCount++;
      }
    });

    // Update manifest if it exists
    const manifestPath = path.join(PROCESSED_DIR, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.files = manifest.files.filter(f => f.name !== fileName);
      manifest.totalFiles = manifest.files.length;
      
      if (manifest.files.length === 0) {
        // No files left, delete manifest
        fs.unlinkSync(manifestPath);
      } else {
        // Update manifest
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }

    console.log(`🗑️ Deleted ${deletedCount} files related to ${fileName}`);

    res.json({
      success: true,
      message: `File ${fileName} deleted successfully`,
      deletedCount: deletedCount
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
    const files = fs.readdirSync(PROCESSED_DIR);
    files.forEach(file => {
      fs.unlinkSync(path.join(PROCESSED_DIR, file));
    });

    console.log('🗑️ All data cleared');

    res.json({
      success: true,
      message: 'All data cleared successfully'
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
  console.log(`🤖 Claude Model: ${process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022'}`);
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

