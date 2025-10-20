import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const TRIAGE_PATH_C = 'vision_pdf';

const queueState = {
  config: null,
  jobs: new Map(),
  pending: [],
  processing: false
};

export function initializeQueue(config) {
  if (!config) {
    throw new Error('Queue configuration is required');
  }

  queueState.config = config;
}

export function enqueueJob(payload) {
  if (!queueState.config) {
    throw new Error('Job queue has not been initialized');
  }

  const jobId = randomUUID();
  const job = {
    id: jobId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    payload,
    validation: payload.validation || [],
    progress: 0
  };

  queueState.jobs.set(jobId, job);
  queueState.pending.push(job);
  scheduleProcessing();

  return jobId;
}

export function getJobStatus(jobId) {
  const job = queueState.jobs.get(jobId);
  if (!job) return null;

  const { payload, ...rest } = job;
  return {
    ...rest,
    validation: job.validation,
    result: job.result ? sanitizeResult(job.result) : null,
    error: job.error || null
  };
}

function scheduleProcessing() {
  if (queueState.processing) return;
  if (queueState.pending.length === 0) return;

  queueState.processing = true;
  setImmediate(processNextJob);
}

async function processNextJob() {
  const job = queueState.pending.shift();

  if (!job) {
    queueState.processing = false;
    return;
  }

  try {
    await runJob(job);
  } finally {
    queueState.processing = false;
    if (queueState.pending.length > 0) {
      scheduleProcessing();
    }
  }
}

async function runJob(job) {
  const {
    processFiles,
    categorizeFiles,
    saveProcessedFiles,
    analyzeDataQuality,
    processedDir,
    visionClient
  } = queueState.config;

  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  job.progress = 0.05;

  const files = job.payload?.files || [];
  const manifestPath = path.join(processedDir, 'manifest.json');

  try {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('No files provided for processing');
    }

    console.log(`⚙️  [Job ${job.id}] Processing ${files.length} file(s)...`);

    const processedFiles = await processFiles(files);
    job.progress = 0.35;

    const visionSummary = await handleVisionEscalations(processedFiles, visionClient, job);
    job.progress = 0.5;

    if (!processedFiles || processedFiles.length === 0) {
      throw new Error('Failed to process files');
    }

    const categories = categorizeFiles(processedFiles);
    job.progress = 0.6;

    saveProcessedFiles(processedFiles, processedDir);
    job.progress = 0.8;

    let qualityReport = null;
    let mainFile = null;

    if (categories.tracking.length > 0) {
      mainFile = categories.tracking[0];
      qualityReport = analyzeDataQuality(
        mainFile.data,
        mainFile.metadata.columns
      );
    }

    let existingManifest = null;
    if (fs.existsSync(manifestPath)) {
      try {
        existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.log('⚠️ Could not load existing manifest, creating new one');
      }
    }

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
      uploadedAt: timestamp,
      triage: f.triage || null
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

    console.log(`✅ [Job ${job.id}] Files processed successfully`);
    console.log(`📊 [Job ${job.id}] Tracking: ${categories.tracking.length}, Knowledge: ${categories.knowledge.length}, Other: ${categories.other.length}`);
    if (qualityReport) {
      console.log(`📈 [Job ${job.id}] Quality score: ${qualityReport.qualityScore}%`);
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.progress = 1;
    job.result = {
      filesProcessed: files.length,
      categories: {
        tracking: categories.tracking.length,
        knowledge: categories.knowledge.length,
        other: categories.other.length
      },
      mainFile: mainFile ? {
        name: mainFile.originalName,
        type: mainFile.fileType,
        rows: mainFile.data?.length || 0
      } : null,
      qualityReport,
      vision: visionSummary,
      manifest
    };

  } catch (error) {
    console.error(`❌ [Job ${job.id}] Processing failed:`, error);
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.progress = 1;
    job.error = error.message || 'Unknown error';
    job.errorDetails = error.stack;
  } finally {
    cleanupTempFiles(files);
    job.payload = null;
  }
}

function cleanupTempFiles(files) {
  files?.forEach(file => {
    if (!file?.path) return;
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to delete temp file: ${file.path}`);
    }
  });
}

function sanitizeResult(result) {
  if (!result) return result;

  const sanitizedManifest = result.manifest ? {
    ...result.manifest,
    files: result.manifest.files
  } : null;

  return {
    ...result,
    manifest: sanitizedManifest
  };
}

async function handleVisionEscalations(processedFiles, visionClient, job) {
  if (!visionClient) {
    return [];
  }

  const summary = [];

  for (const file of processedFiles) {
    if (file?.triage?.route !== TRIAGE_PATH_C) continue;

    const filePath = file.originalPath;
    if (!filePath || !fs.existsSync(filePath)) {
      summary.push({
        name: file.originalName,
        status: 'skipped',
        reason: 'Original file not found for vision escalation.'
      });
      continue;
    }

    try {
      const result = await visionClient.processPdf({
        filePath,
        originalName: file.originalName,
        preview: file.metadata?.preview
      });

      if (result?.data?.fullText) {
        file.data = result.data;
      }

      file.metadata = {
        ...(file.metadata || {}),
        vision: {
          model: result.model,
          latencyMs: result.latencyMs,
          tablesExtracted: Array.isArray(result.data?.tables) ? result.data.tables.length : 0,
          rawJson: result.json
        }
      };

      summary.push({
        name: file.originalName,
        status: 'completed',
        latencyMs: result.latencyMs,
        tables: result.data?.tables?.length || 0
      });

      console.log(`👁️  [Job ${job.id}] Vision processing completed for ${file.originalName}`);

    } catch (error) {
      console.error(`❌  [Job ${job.id}] Vision processing failed for ${file.originalName}:`, error);
      summary.push({
        name: file.originalName,
        status: 'failed',
        error: error.message || 'Unknown vision error'
      });
    }
  }

  return summary;
}

