/**
 * Analyze data quality of uploaded Excel files
 * Detects missing data, formula errors, inconsistencies
 */

/**
 * Main quality analysis function
 * @param {Array} data - Parsed Excel data
 * @param {Array} columns - Column names
 * @returns {Object} Quality report
 */
export function analyzeDataQuality(data, columns) {
  const issues = [];
  const warnings = [];
  const recommendations = [];

  // Critical fields that should not be empty
  const criticalFields = detectCriticalFields(columns);

  let completeRows = 0;
  let incompleteRows = 0;

  // Analyze each row
  data.forEach((row, index) => {
    const rowNumber = index + 2; // Excel row (1-indexed + header)
    const rowIssues = [];

    // Check for missing critical data
    criticalFields.forEach(field => {
      const value = row[field];
      
      if (value === null || value === undefined || value === '') {
        rowIssues.push({
          row: rowNumber,
          column: field,
          issue: 'Missing value',
          severity: 'critical',
          value: 'Empty'
        });
      }
    });

    // Check for Excel formula errors
    Object.keys(row).forEach(key => {
      const value = row[key];
      
      if (typeof value === 'string') {
        // Check for Excel error values
        if (value.match(/^#(N\/A|REF!|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!)/)) {
          rowIssues.push({
            row: rowNumber,
            column: key,
            issue: 'Formula error detected',
            severity: 'critical',
            value: value,
            suggestion: 'Check VLOOKUP or formula in Excel'
          });
        }

        // Check for suspicious values
        if (value.toLowerCase() === 'tbd' || value.toLowerCase() === 'pending' || value === '???') {
          rowIssues.push({
            row: rowNumber,
            column: key,
            issue: 'Placeholder value detected',
            severity: 'warning',
            value: value
          });
        }
      }
    });

    if (rowIssues.length === 0) {
      completeRows++;
    } else {
      incompleteRows++;
      issues.push(...rowIssues);
    }
  });

  // Detect duplicate PO numbers
  const duplicates = detectDuplicates(data, columns);
  if (duplicates.length > 0) {
    duplicates.forEach(dup => {
      warnings.push({
        type: 'duplicate',
        message: `Duplicate PO number found: ${dup.value} (rows: ${dup.rows.join(', ')})`,
        severity: 'warning'
      });
    });
  }

  // Check for inconsistent date formats
  const dateIssues = checkDateConsistency(data, columns);
  if (dateIssues.length > 0) {
    warnings.push(...dateIssues);
  }

  // Generate recommendations
  if (incompleteRows > 0) {
    recommendations.push({
      type: 'data_quality',
      message: `${incompleteRows} rows have missing or incomplete data. Please review and update these records.`,
      priority: 'high'
    });
  }

  if (issues.some(i => i.issue.includes('Formula error'))) {
    recommendations.push({
      type: 'formula_errors',
      message: 'Excel formula errors detected. Please open the file, press F9 to recalculate, and fix any #N/A or #REF! errors.',
      priority: 'critical'
    });
  }

  // Calculate quality score
  const totalCells = data.length * criticalFields.length;
  const emptyCells = issues.filter(i => i.issue === 'Missing value').length;
  const errorCells = issues.filter(i => i.issue.includes('Formula error')).length;
  
  const qualityScore = Math.round(
    ((totalCells - emptyCells - errorCells * 2) / totalCells) * 100
  );

  return {
    totalRows: data.length,
    completeRows: completeRows,
    incompleteRows: incompleteRows,
    qualityScore: Math.max(0, qualityScore),
    criticalIssues: issues.filter(i => i.severity === 'critical'),
    warnings: [...warnings, ...issues.filter(i => i.severity === 'warning')],
    recommendations: recommendations,
    summary: {
      totalIssues: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      duplicateCount: duplicates.length
    },
    details: {
      criticalFields: criticalFields,
      analyzedColumns: columns
    }
  };
}

/**
 * Detect which fields are critical based on column names
 */
function detectCriticalFields(columns) {
  const critical = [];

  const criticalKeywords = [
    'po', 'order', 'status', 'customer', 'eta', 'tracking',
    'invoice', 'reference', 'shipment'
  ];

  columns.forEach(col => {
    const colLower = col.toLowerCase();
    if (criticalKeywords.some(keyword => colLower.includes(keyword))) {
      critical.push(col);
    }
  });

  // If no critical fields detected, assume all columns are important
  if (critical.length === 0) {
    return columns.slice(0, 5); // First 5 columns
  }

  return critical;
}

/**
 * Detect duplicate values in potential ID columns
 */
function detectDuplicates(data, columns) {
  const duplicates = [];

  // Find columns that might be IDs (PO, Order Number, etc.)
  const idColumns = columns.filter(col => {
    const colLower = col.toLowerCase();
    return colLower.includes('po') || 
           colLower.includes('order') || 
           colLower.includes('id') ||
           colLower.includes('number');
  });

  idColumns.forEach(col => {
    const valueMap = {};
    
    data.forEach((row, index) => {
      const value = row[col];
      if (value && value !== '') {
        if (!valueMap[value]) {
          valueMap[value] = [];
        }
        valueMap[value].push(index + 2); // Excel row number
      }
    });

    // Find duplicates
    Object.entries(valueMap).forEach(([value, rows]) => {
      if (rows.length > 1) {
        duplicates.push({
          column: col,
          value: value,
          rows: rows,
          count: rows.length
        });
      }
    });
  });

  return duplicates;
}

/**
 * Check for inconsistent date formats
 */
function checkDateConsistency(data, columns) {
  const issues = [];

  // Find date columns
  const dateColumns = columns.filter(col => {
    const colLower = col.toLowerCase();
    return colLower.includes('date') || 
           colLower.includes('eta') || 
           colLower.includes('time');
  });

  dateColumns.forEach(col => {
    const formats = new Set();
    
    data.forEach((row, index) => {
      const value = row[col];
      if (value && typeof value === 'string') {
        // Detect format pattern
        if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          formats.add('YYYY-MM-DD');
        } else if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          formats.add('MM/DD/YYYY');
        } else if (value.match(/^\d{2}-\d{2}-\d{4}$/)) {
          formats.add('DD-MM-YYYY');
        } else {
          formats.add('unknown');
        }
      }
    });

    if (formats.size > 1) {
      issues.push({
        type: 'date_format',
        column: col,
        message: `Inconsistent date formats in column "${col}". Found formats: ${Array.from(formats).join(', ')}`,
        severity: 'warning'
      });
    }
  });

  return issues;
}

/**
 * Get specific issues for a row (for highlighting in UI)
 */
export function getRowIssues(data, rowIndex, columns) {
  const row = data[rowIndex];
  const issues = [];

  if (!row) return issues;

  const criticalFields = detectCriticalFields(columns);

  criticalFields.forEach(field => {
    const value = row[field];
    
    if (value === null || value === undefined || value === '') {
      issues.push({
        column: field,
        issue: 'Missing value',
        severity: 'critical'
      });
    }

    if (typeof value === 'string' && value.match(/^#(N\/A|REF!|VALUE!)/)) {
      issues.push({
        column: field,
        issue: 'Formula error',
        severity: 'critical',
        value: value
      });
    }
  });

  return issues;
}


