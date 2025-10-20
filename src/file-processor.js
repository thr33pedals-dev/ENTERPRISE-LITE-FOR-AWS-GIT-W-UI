import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { processPDFAdvanced } from './pdf-processor-advanced.js';
import { runVisionPipeline } from './vision-processor.js';
import { getStorage } from './storage/index.js';
import { saveJson as saveJsonArtifact, saveText as saveTextArtifact } from './services/storage-helper.js';

export const TRIAGE_ROUTES = {
  PATH_A: 'structured_excel',
  PATH_B: 'text_pdf',
  PATH_B_DOCX: 'text_doc',
  PATH_B_TXT: 'text_plain',
  PATH_C: 'vision_pdf'
};

/**
 * Universal file processor - handles Excel, PDF, DOCX, CSV, TXT
 * Extracts text/data and converts to searchable format
 */

/**
 * Process multiple files of different types
 * @param {Array} files - Array of uploaded file objects from multer
 * @returns {Array} Array of processed file data
 */
export async function processFiles(files, options = {}) {
  const tenantId = options?.tenantId || 'default';
  const processedFiles = [];

  for (const file of files) {
    try {
      console.log(`📄 Processing: ${file.originalname} (${file.mimetype})`);

      const triageResult = await triageAndProcessFile(file, tenantId);

      if (triageResult) {
        processedFiles.push({
          originalName: file.originalname,
          fileType: triageResult.fileType,
          data: triageResult.data,
          metadata: {
            ...(triageResult.metadata || {}),
            triageRoute: triageResult.triageRoute,
            triageReason: triageResult.triageReason
          },
          fileSize: file.size,
          triage: {
            route: triageResult.triageRoute,
            reason: triageResult.triageReason,
            quality: triageResult.textQuality,
            recommendedTool: triageResult.recommendedTool || null
          },
          originalPath: file.path,
          artifacts: triageResult.artifacts || null
        });

        console.log(`✅ Processed ${file.originalname} via triage route ${triageResult.triageRoute}`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${file.originalname}:`, error.message);
      throw new Error(`Failed to process ${file.originalname}: ${error.message}`);
    }
  }

  return processedFiles;
}

async function triageAndProcessFile(file, tenantId = 'default') {
  if (isExcelFile(file)) {
    const excelResult = await processExcelFile(file);
    return {
      ...excelResult,
      triageRoute: TRIAGE_ROUTES.PATH_A,
      triageReason: 'Structured spreadsheet processed with local Excel parser (Path A).',
      textQuality: {
        score: 1,
        isUsable: true,
        reason: 'Structured spreadsheet'
      }
    };
  }

  if (isPDFFile(file)) {
    return await triagePdfFile(file, tenantId);
  }

  if (isDOCXFile(file)) {
    const docResult = await processDOCXFile(file);
    const quality = summarizeTextQuality(docResult.data.fullText);
    const reason = quality.isUsable
      ? 'DOCX text extracted locally (Path B).'
      : `DOCX content may require vision assistance (${quality.reason})`;

    return {
      ...docResult,
      triageRoute: TRIAGE_ROUTES.PATH_B_DOCX,
      triageReason: reason,
      textQuality: quality
    };
  }

  if (isTXTFile(file)) {
    const txtResult = await processTXTFile(file);
    const quality = summarizeTextQuality(txtResult.data.fullText);
    const reason = quality.isUsable
      ? 'Plain text file processed locally (Path B).'
      : `Plain text content appears degraded (${quality.reason})`;

    return {
      ...txtResult,
      triageRoute: TRIAGE_ROUTES.PATH_B_TXT,
      triageReason: reason,
      textQuality: quality
    };
  }

  console.warn(`⚠️ No triage handler for file type: ${file.mimetype}`);
  return null;
}

function buildVisionDataPayload(quickExtract, visionResult) {
  const visionPayload = visionResult?.data;

  if (!visionPayload) {
    return quickExtract?.data || null;
  }

  const rawText = typeof visionPayload.raw_text === 'string' ? visionPayload.raw_text.trim() : '';
  const quickText = quickExtract?.data?.fullText ? String(quickExtract.data.fullText) : '';
  const serialized = rawText || quickText || JSON.stringify(visionPayload, null, 2);

  return {
    fullText: serialized,
    visionPayload,
    quickExtract: quickExtract?.data || null
  };
}

async function triagePdfFile(file, tenantId = 'default') {
  let quickExtract = null;

  try {
    quickExtract = await quickPdfExtract(file);
  } catch (error) {
    console.warn(`⚠️ Quick PDF extraction failed for ${file.originalname}: ${error.message}`);
  }

  const quality = quickExtract?.textQuality || {
    score: 0,
    isUsable: false,
    reason: 'Quick extraction unavailable'
  };

  const visionEnabled = process.env.VISION_PDF_ENABLED === 'true';
  const tableConfidenceScore = quality.tableConfidence?.score ?? 1;
  const tableConfidenceThreshold = quality.tableConfidence?.threshold ?? 0.25;
  const tableLikelyLost = tableConfidenceScore < tableConfidenceThreshold;
  const textLooksBad = !quality.isUsable || (typeof quality.score === 'number' && quality.score < 0.7);
  const veryLowDensity = typeof quality.metrics?.textDensity === 'number' && quality.metrics.textDensity < 80;
  const shouldEscalateForTables = visionEnabled && tableLikelyLost && textLooksBad;

  if (!shouldEscalateForTables && !veryLowDensity && quality.isUsable && quickExtract?.data?.fullText?.trim()) {
    return {
      fileType: 'pdf',
      data: quickExtract.data,
      metadata: {
        ...quickExtract.metadata,
        textQuality: quality,
        extractionMethod: 'quick_pdf_parse'
      },
      triageRoute: TRIAGE_ROUTES.PATH_B,
      triageReason: 'Quick PDF text extraction succeeded (Path B).',
      textQuality: quality,
      artifacts: null
    };
  }

  if (shouldEscalateForTables) {
    const visionResult = await runVisionPipeline({
      file,
      tenantId,
      quickExtract,
      reason: 'table_structure_loss'
    });

    const tableEscalatedMetadata = {
      requiresVision: true,
      textQuality: quality,
      extractionMethod: 'triage_table_escalated',
      notes: 'Quick extraction appears to lose table structure. Escalating to vision.',
      preview: quickExtract?.preview || null,
      visionArtifacts: visionResult?.artifacts || null,
      visionDataAvailable: Boolean(visionResult?.data)
    };

    return {
      fileType: 'pdf',
      data: buildVisionDataPayload(quickExtract, visionResult),
      metadata: tableEscalatedMetadata,
      triageRoute: TRIAGE_ROUTES.PATH_C,
      triageReason: 'Quick extraction appears to lose table structure. Escalate to vision (Path C).',
      textQuality: quality,
      recommendedTool: process.env.VISION_PDF_TOOL || 'process_pdf_with_vlm',
      artifacts: visionResult?.artifacts || null
    };
  }

  if (tableLikelyLost && !textLooksBad && visionEnabled) {
    console.log(`📎 Table patterns found in ${file.originalname}, but text quality acceptable (staying on Path B).`);
  }

  if (tableLikelyLost && !visionEnabled) {
    console.log(`📎 Table structure degraded in ${file.originalname}, but VISION_PDF_ENABLED=false`);
  }

  const visionResult = await runVisionPipeline({
    file,
    tenantId,
    quickExtract,
    reason: textLooksBad ? 'low_quality_text' : 'escalated_for_tables'
  });

  const escalatedMetadata = {
    requiresVision: true,
    textQuality: quality,
    extractionMethod: 'triage_escalated',
    notes: 'Quick text extraction failed or produced low-quality text. Escalate to vision-capable tool.',
    preview: quickExtract?.preview || null,
    visionArtifacts: visionResult?.artifacts || null,
    visionDataAvailable: Boolean(visionResult?.data)
  };

  return {
    fileType: 'pdf',
    data: buildVisionDataPayload(quickExtract, visionResult),
    metadata: escalatedMetadata,
    triageRoute: TRIAGE_ROUTES.PATH_C,
    triageReason: 'PDF appears scanned or low quality. Escalate to vision tool (Path C).',
    textQuality: quality,
    recommendedTool: process.env.VISION_PDF_TOOL || 'process_pdf_with_vlm',
    artifacts: visionResult?.artifacts || null
  };
}

async function quickPdfExtract(file) {
  const dataBuffer = fs.readFileSync(file.path);
  const pdfData = await pdfParse(dataBuffer);

  const text = pdfData.text || '';
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const textQuality = summarizeTextQuality(text, pdfData.numpages || 1);

  return {
    data: {
      fullText: text,
      paragraphs,
      pages: pdfData.numpages,
      tables: [],
      hasStructuredTables: false
    },
    metadata: {
      pages: pdfData.numpages,
      textLength: text.length
    },
    textQuality,
    preview: text.substring(0, 500)
  };
}

function summarizeTextQuality(rawText, pageCount = 1) {
  const text = (rawText || '').trim();

  if (text.length === 0) {
    return {
      score: 0,
      isUsable: false,
      reason: 'No text extracted',
      metrics: {
        length: 0,
        wordCount: 0,
        avgWordLength: 0,
        nonPrintableRatio: 0,
        letterRatio: 0,
        pageCount
      }
    };
  }

  const cleaned = text.replace(/\s+/g, ' ').trim();
  const length = cleaned.length;
  const words = cleaned.split(' ').filter(Boolean);
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? length / wordCount : length;

  const nonPrintableMatches = cleaned.match(/[^\x09\x0A\x0D\x20-\x7E]/g) || [];
  const nonPrintableRatio = length > 0 ? nonPrintableMatches.length / length : 0;

  const letterMatches = cleaned.match(/[A-Za-z]/g) || [];
  const letterRatio = length > 0 ? letterMatches.length / length : 0;

  const expectedMinLength = Math.max(150, pageCount * 120);
  const tooShort = length < expectedMinLength;
  const highAvgWord = avgWordLength > 16;
  const lowLetterRatio = letterRatio < 0.25;
  const highNonPrintable = nonPrintableRatio > 0.35;

  const tableConfidence = evaluateTableConfidence(rawText, pageCount);

  const issues = [];
  if (tooShort) issues.push('very little text for document size');
  if (highAvgWord) issues.push('average word length unusually high');
  if (lowLetterRatio) issues.push('letter ratio low');
  if (highNonPrintable) issues.push('many non-printable characters');

  const hasIssues = issues.length > 0;
  const score = Math.max(0, Math.min(1, 1 - issues.length * 0.25));

  return {
    score,
    isUsable: !hasIssues,
    reason: hasIssues
      ? `Text extraction appears degraded (${issues.join(', ')}).`
      : 'Clean text extraction (Path B).',
    metrics: {
      length,
      wordCount,
      avgWordLength,
      nonPrintableRatio,
      letterRatio,
      pageCount,
      tableConfidenceScore: tableConfidence.score
    },
    tableConfidence
  };
}

function evaluateTableConfidence(rawText, pageCount = 1) {
  const lines = (rawText || '').split(/\r?\n/);

  let richLineCount = 0;
  let pipeCount = 0;
  let tabCount = 0;
  let multiSpaceLines = 0;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const pipeMatches = trimmed.match(/\|/g) || [];
    const tabMatches = trimmed.match(/\t/g) || [];
    const doubleSpaceMatches = trimmed.match(/\s{2,}/g) || [];

    if (pipeMatches.length >= 2 || tabMatches.length >= 2 || doubleSpaceMatches.length >= 2) {
      richLineCount++;
    }

    if (pipeMatches.length >= 2) pipeCount++;
    if (tabMatches.length >= 2) tabCount++;
    if (doubleSpaceMatches.length >= 3) multiSpaceLines++;
  });

  const totalLines = Math.max(lines.length, 1);
  const richRatio = richLineCount / totalLines;
  const pipeRatio = pipeCount / totalLines;
  const tabRatio = tabCount / totalLines;
  const multiSpaceRatio = multiSpaceLines / totalLines;

  const score = Math.min(1, (richRatio * 0.6) + (pipeRatio * 1.5) + (tabRatio * 1.5) + (multiSpaceRatio * 0.5));
  const threshold = pageCount >= 2 ? 0.25 : 0.18;
  const isLikely = score >= threshold;

  const reason = isLikely
    ? 'Detected alignment patterns consistent with table structure.'
    : 'Table-like alignment not detected in quick extraction.';

  return {
    isLikely,
    score,
    threshold,
    reason,
    metrics: {
      totalLines,
      richLineCount,
      pipeCount,
      tabCount,
      multiSpaceLines,
      richRatio,
      pipeRatio,
      tabRatio,
      multiSpaceRatio
    }
  };
}

/**
 * Process Excel files (.xlsx, .xls, .csv)
 * Extracts calculated VLOOKUP values
 */
async function processExcelFile(file) {
  const workbook = XLSX.readFile(file.path, {
    cellFormula: false,  // Get calculated values, not formulas
    cellDates: true,
    cellNF: false,
    cellStyles: false
  });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,          // Format values (VLOOKUP results!)
    defval: '',
    dateNF: 'yyyy-mm-dd'
  });

  if (jsonData.length === 0) {
    throw new Error('Excel file has no data');
  }

  const columns = Object.keys(jsonData[0] || {});

  // Clean data (remove Excel errors)
  const cleanedData = jsonData.map(row => {
    const cleanRow = {};
    Object.keys(row).forEach(key => {
      let value = row[key];
      if (typeof value === 'string') {
        // Replace Excel errors
        if (value.match(/^#(N\/A|REF!|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!)/)) {
          cleanRow[key] = '';
        } else {
          cleanRow[key] = value.trim();
        }
      } else {
        cleanRow[key] = value;
      }
    });
    return cleanRow;
  });

  return {
    fileType: 'excel',
    data: cleanedData,
    metadata: {
      sheetName: firstSheetName,
      columns: columns,
      rowCount: cleanedData.length,
      isStructured: true
    }
  };
}

/**
 * Process PDF files with advanced table detection
 * Extracts text content and preserves table structure
 */
async function processPDFFile(file) {
  // Use advanced PDF processing with table detection
  return await processPDFAdvanced(file);
}

/**
 * Process DOCX files
 * Extracts text content with basic formatting
 */
async function processDOCXFile(file) {
  const result = await mammoth.extractRawText({ path: file.path });

  if (!result.value || result.value.trim().length === 0) {
    throw new Error('DOCX file appears to be empty');
  }

  // Split into paragraphs
  const paragraphs = result.value
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Check for warnings (images, complex formatting, etc.)
  const warnings = result.messages.map(m => m.message);

  return {
    fileType: 'docx',
    data: {
      fullText: result.value,
      paragraphs: paragraphs
    },
    metadata: {
      isStructured: false,
      textLength: result.value.length,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  };
}

/**
 * Process plain text files
 */
async function processTXTFile(file) {
  const text = fs.readFileSync(file.path, 'utf-8');

  if (!text || text.trim().length === 0) {
    throw new Error('Text file is empty');
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  return {
    fileType: 'txt',
    data: {
      fullText: text,
      lines: lines
    },
    metadata: {
      isStructured: false,
      lineCount: lines.length,
      textLength: text.length
    }
  };
}

/**
 * File type detection helpers
 */
function isExcelFile(file) {
  const excelMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ];
  return excelMimeTypes.includes(file.mimetype) || 
         file.originalname.match(/\.(xlsx|xls|csv)$/i);
}

function isPDFFile(file) {
  return file.mimetype === 'application/pdf' || 
         file.originalname.match(/\.pdf$/i);
}

function isDOCXFile(file) {
  return file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         file.originalname.match(/\.docx$/i);
}

function isTXTFile(file) {
  return file.mimetype === 'text/plain' || 
         file.originalname.match(/\.txt$/i);
}

/**
 * Categorize files by purpose (tracking vs knowledge)
 * Tracking files: Excel with PO/Order numbers
 * Knowledge files: PDFs, DOCX, other documents
 */
export function categorizeFiles(processedFiles) {
  const categories = {
    tracking: [],
    knowledge: [],
    other: []
  };

  processedFiles.forEach(file => {
    if (file.fileType === 'excel') {
      // Check if it's a tracking file
      const hasTrackingColumns = file.metadata.columns?.some(col => 
        /po|purchase\s*order|order|tracking|shipment|invoice|reference/i.test(col)
      );
      
      if (hasTrackingColumns) {
        categories.tracking.push(file);
      } else {
        categories.other.push(file);
      }
    } else if (file.fileType === 'pdf' || file.fileType === 'docx') {
      categories.knowledge.push(file);
    } else {
      categories.other.push(file);
    }
  });

  return categories;
}

/**
 * Save processed files to filesystem for MCP access
 */
export async function saveProcessedFiles(processedFiles, processedDir, options = {}) {
  const storage = getStorage();
  const savedFiles = [];
  const timestamp = Date.now();
  const { tenantId = '' } = options;
  const tenantSegment = sanitizeTenantId(tenantId);

  for (const [index, file] of processedFiles.entries()) {
    const baseName = createSafeBaseName(file.originalName, index);
    const storageKeyBase = [tenantSegment, baseName].filter(Boolean).join('/') || 'file';
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const artifactBaseKey = `${storageKeyBase}/${timestamp}_${index}_${randomSuffix}`;

    if (file.fileType === 'excel') {
      const jsonKey = `${artifactBaseKey}.json`;
      const txtKey = `${artifactBaseKey}.txt`;

      await saveJsonArtifact(jsonKey, file.data, { prettyPrint: true });

      const textContent = file.data.map((row, i) => {
        const rowText = file.metadata.columns
          .map(col => `${col}: ${row[col] || 'N/A'}`)
          .join(', ');
        return `Row ${i + 1}: ${rowText}`;
      }).join('\n');

      await saveTextArtifact(txtKey, textContent, 'text/plain');

      savedFiles.push({
        type: 'excel',
        name: file.originalName,
        storageKey: artifactBaseKey,
        jsonKey,
        txtKey
      });

    } else if (['pdf', 'docx', 'txt'].includes(file.fileType)) {
      const txtKey = `${artifactBaseKey}.txt`;
      const metaKey = `${artifactBaseKey}_meta.json`;

      if (file.data?.fullText) {
        await saveTextArtifact(txtKey, file.data.fullText, 'text/plain');
      } else {
        const triageNote = [
          '### Vision Processing ###',
          `Original file: ${file.originalName}`,
          file.triage?.reason ? `Reason: ${file.triage.reason}` : 'Reason: Escalated to Path C',
          file.triage?.recommendedTool ? `Recommended tool: ${file.triage.recommendedTool}` : 'Recommended tool: process_pdf_with_vlm',
          file.metadata?.preview ? `Preview snippet: ${file.metadata.preview}` : '',
          file.artifacts?.parsedJsonPath ? `Parsed JSON: ${file.artifacts.parsedJsonPath}` : '',
          file.artifacts?.parsedStorageKey ? `Parsed Storage Key: ${file.artifacts.parsedStorageKey}` : ''
        ].filter(Boolean).join('\n');
        await saveTextArtifact(txtKey, triageNote, 'text/plain');
      }

      const metaPayload = {
        originalName: file.originalName,
        fileType: file.fileType,
        metadata: file.metadata,
        triage: file.triage || null,
        artifacts: file.artifacts || null
      };
      await saveJsonArtifact(metaKey, metaPayload, { prettyPrint: true });

      savedFiles.push({
        type: file.fileType,
        name: file.originalName,
        storageKey: artifactBaseKey,
        txtKey,
        metaKey,
        artifacts: file.artifacts || null
      });
    }
  }

  return savedFiles;
}

function createSafeBaseName(originalName, index) {
  const justName = path.basename(originalName || '').replace(/\.[^/.]+$/, '');

  const sanitized = justName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  if (!sanitized) {
    return `file-${index}`;
  }

  return sanitized;
}

export function sanitizeTenantId(rawTenant) {
  if (!rawTenant) return '';
  return rawTenant
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Validate file before processing
 */
export function validateFile(file) {
  const errors = [];
  const warnings = [];

  if (file.size === 0) {
    errors.push('File is empty');
  }

  if (file.size > 20 * 1024 * 1024) { // 20MB
    warnings.push('Large file (>20MB), processing may be slow');
  }

  // Check file extension
  const validExtensions = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.txt'];
  const hasValidExtension = validExtensions.some(ext => 
    file.originalname.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    errors.push('Invalid file type. Supported: Excel, PDF, DOCX, TXT, CSV');
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

