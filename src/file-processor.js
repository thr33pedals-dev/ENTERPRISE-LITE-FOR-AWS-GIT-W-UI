import XLSX from 'xlsx';
import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { processPDFAdvanced } from './pdf-processor-advanced.js';

/**
 * Universal file processor - handles Excel, PDF, DOCX, CSV, TXT
 * Extracts text/data and converts to searchable format
 */

/**
 * Process multiple files of different types
 * @param {Array} files - Array of uploaded file objects from multer
 * @returns {Array} Array of processed file data
 */
export async function processFiles(files) {
  const processedFiles = [];

  for (const file of files) {
    try {
      console.log(`📄 Processing: ${file.originalname} (${file.mimetype})`);

      let processedData = null;

      // Determine file type and process accordingly
      if (isExcelFile(file)) {
        processedData = await processExcelFile(file);
      } else if (isPDFFile(file)) {
        processedData = await processPDFFile(file);
      } else if (isDOCXFile(file)) {
        processedData = await processDOCXFile(file);
      } else if (isTXTFile(file)) {
        processedData = await processTXTFile(file);
      } else {
        console.warn(`⚠️ Unsupported file type: ${file.mimetype}`);
        continue;
      }

      if (processedData) {
        processedFiles.push({
          originalName: file.originalname,
          fileType: processedData.fileType,
          data: processedData.data,
          metadata: processedData.metadata,
          fileSize: file.size
        });

        console.log(`✅ Processed ${file.originalname} (${processedData.fileType})`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${file.originalname}:`, error.message);
      throw new Error(`Failed to process ${file.originalname}: ${error.message}`);
    }
  }

  return processedFiles;
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
export function saveProcessedFiles(processedFiles, processedDir) {
  const savedFiles = [];

  processedFiles.forEach((file, index) => {
    const baseName = file.originalName.replace(/\.[^/.]+$/, ''); // Remove extension
    
    if (file.fileType === 'excel') {
      // Save structured data as JSON
      const jsonPath = `${processedDir}/${baseName}_${index}.json`;
      fs.writeFileSync(jsonPath, JSON.stringify(file.data, null, 2));
      
      // Also save as searchable text
      const textContent = file.data.map((row, i) => {
        const rowText = file.metadata.columns
          .map(col => `${col}: ${row[col] || 'N/A'}`)
          .join(', ');
        return `Row ${i + 1}: ${rowText}`;
      }).join('\n');
      
      const txtPath = `${processedDir}/${baseName}_${index}.txt`;
      fs.writeFileSync(txtPath, textContent);
      
      savedFiles.push({
        type: 'excel',
        name: file.originalName,
        jsonPath: jsonPath,
        txtPath: txtPath
      });
      
    } else if (file.fileType === 'pdf' || file.fileType === 'docx' || file.fileType === 'txt') {
      // Save text content
      const txtPath = `${processedDir}/${baseName}_${index}.txt`;
      fs.writeFileSync(txtPath, file.data.fullText);
      
      // Also save metadata
      const metaPath = `${processedDir}/${baseName}_${index}_meta.json`;
      fs.writeFileSync(metaPath, JSON.stringify({
        originalName: file.originalName,
        fileType: file.fileType,
        metadata: file.metadata
      }, null, 2));
      
      savedFiles.push({
        type: file.fileType,
        name: file.originalName,
        txtPath: txtPath,
        metaPath: metaPath
      });
    }
  });

  return savedFiles;
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

