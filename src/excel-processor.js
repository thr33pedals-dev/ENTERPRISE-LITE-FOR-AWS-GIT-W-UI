import XLSX from 'xlsx';
import fs from 'fs';

/**
 * Process multiple Excel files and extract data
 * Handles VLOOKUP formulas by extracting calculated values
 * 
 * @param {Array} files - Array of uploaded file objects from multer
 * @returns {Array} Array of processed file data
 */
export async function processExcelFiles(files) {
  const processedFiles = [];

  for (const file of files) {
    try {
      console.log(`📄 Processing: ${file.originalname}`);

      // Read Excel file
      const workbook = XLSX.readFile(file.path, {
        cellFormula: false,  // Get calculated values, not formulas
        cellDates: true,     // Convert Excel dates to JS dates
        cellNF: false,       // Don't include number formats
        cellStyles: false    // Don't include styles
      });

      // Get first sheet (or you can iterate through all sheets)
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert to JSON with proper handling
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,          // Format values (important for VLOOKUPs!)
        defval: '',          // Default value for empty cells
        dateNF: 'yyyy-mm-dd' // Date format
      });

      if (jsonData.length === 0) {
        console.warn(`⚠️ File ${file.originalname} has no data`);
        continue;
      }

      // Get column names
      const columns = Object.keys(jsonData[0] || {});

      // Detect and handle formula errors
      const cleanedData = jsonData.map(row => {
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          let value = row[key];
          
          // Check for Excel error values
          if (typeof value === 'string') {
            // Replace Excel errors with empty string
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

      processedFiles.push({
        originalName: file.originalname,
        sheetName: firstSheetName,
        data: cleanedData,
        columns: columns,
        rowCount: cleanedData.length,
        fileSize: file.size
      });

      console.log(`✅ Processed ${cleanedData.length} rows from ${file.originalname}`);

    } catch (error) {
      console.error(`❌ Error processing ${file.originalname}:`, error.message);
      throw new Error(`Failed to process ${file.originalname}: ${error.message}`);
    }
  }

  return processedFiles;
}

/**
 * Detect main tracking file from multiple files
 * Looks for PO numbers, tracking numbers, or order-related columns
 * 
 * @param {Array} processedFiles - Array of processed file objects
 * @returns {Object} Main tracking file
 */
export function detectMainFile(processedFiles) {
  const trackingKeywords = [
    'po', 'purchase order', 'order', 'tracking', 'shipment',
    'invoice', 'reference', 'order number', 'po number'
  ];

  for (const file of processedFiles) {
    const hasTrackingColumn = file.columns.some(col => 
      trackingKeywords.some(keyword => 
        col.toLowerCase().includes(keyword)
      )
    );

    if (hasTrackingColumn) {
      return file;
    }
  }

  // If no tracking columns found, return the file with most rows
  return processedFiles.reduce((prev, current) => 
    (current.rowCount > prev.rowCount) ? current : prev
  );
}

/**
 * Merge related files based on common columns
 * Useful if customer wants all data in one JSON
 * 
 * @param {Object} mainFile - Main tracking file
 * @param {Array} lookupFiles - Array of lookup files
 * @returns {Array} Merged data
 */
export function mergeFiles(mainFile, lookupFiles) {
  let mergedData = [...mainFile.data];

  for (const lookupFile of lookupFiles) {
    // Find common columns between main and lookup
    const commonColumns = mainFile.columns.filter(col => 
      lookupFile.columns.includes(col)
    );

    if (commonColumns.length === 0) {
      console.warn(`⚠️ No common columns between ${mainFile.originalName} and ${lookupFile.originalName}`);
      continue;
    }

    // Use first common column as join key
    const joinKey = commonColumns[0];
    console.log(`🔗 Joining on column: ${joinKey}`);

    // Merge data
    mergedData = mergedData.map(mainRow => {
      const lookupRow = lookupFile.data.find(row => 
        row[joinKey] === mainRow[joinKey]
      );

      if (lookupRow) {
        // Merge, but don't overwrite existing columns
        const merged = { ...mainRow };
        Object.keys(lookupRow).forEach(key => {
          if (!merged[key] || merged[key] === '') {
            merged[key + '_lookup'] = lookupRow[key];
          }
        });
        return merged;
      }

      return mainRow;
    });
  }

  return mergedData;
}

/**
 * Validate Excel file before processing
 * Checks for common issues
 * 
 * @param {Object} file - File object from multer
 * @returns {Object} Validation result
 */
export function validateExcelFile(file) {
  const errors = [];
  const warnings = [];

  // Check file size
  if (file.size === 0) {
    errors.push('File is empty');
  }

  if (file.size > 10 * 1024 * 1024) { // 10MB
    warnings.push('File is large (>10MB), processing may be slow');
  }

  // Check file extension
  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const hasValidExtension = validExtensions.some(ext => 
    file.originalname.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    errors.push('Invalid file type. Please upload .xlsx, .xls, or .csv files');
  }

  // Check filename for suspicious characters
  if (file.originalname.match(/[<>:"\/\\|?*]/)) {
    warnings.push('Filename contains special characters');
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}


