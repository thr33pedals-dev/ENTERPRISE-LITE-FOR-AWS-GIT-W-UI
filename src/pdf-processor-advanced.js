/**
 * Advanced PDF Processor with Table Extraction
 * Handles PDFs with complex layouts, tables, and multi-column text
 */

import pkg from 'pdf.js-extract';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const { PDFExtract } = pkg;

/**
 * Process PDF with advanced table detection and layout preservation
 */
export async function processPDFAdvanced(file) {
  try {
    console.log('📄 Using advanced PDF processing...');
    
    // Try PDFExtract first (layout-aware)
    const pdfExtract = new PDFExtract();
    const options = {
      firstPage: 1,
      lastPage: undefined,
      password: '',
      verbosity: 0,
      normalizeWhitespace: false,
      disableCombineTextItems: false
    };

    const pdfBuffer = await ensurePdfBuffer(file);
    const data = await pdfExtract.extractBuffer(pdfBuffer, options);
    
    if (!data || !data.pages || data.pages.length === 0) {
      console.log('⚠️ PDFExtract failed, falling back to basic extraction');
      return await processPDFBasic(file, pdfBuffer);
    }

    // Process each page with structure preservation
    const processedPages = data.pages.map((page, pageIndex) => {
      return processPageWithTables(page, pageIndex + 1);
    });

    // Combine all pages
    const fullText = processedPages.map(p => p.text).join('\n\n--- Page Break ---\n\n');
    const allTables = processedPages.flatMap(p => p.tables);
    const allParagraphs = processedPages.flatMap(p => p.paragraphs);

    console.log(`✅ Advanced extraction: ${data.pages.length} pages, ${allTables.length} tables detected`);

    return {
      fileType: 'pdf',
      data: {
        fullText: fullText,
        tables: allTables,
        paragraphs: allParagraphs,
        pages: data.pages.length,
        hasStructuredTables: allTables.length > 0
      },
      metadata: {
        pages: data.pages.length,
        isStructured: allTables.length > 0,
        textLength: fullText.length,
        tableCount: allTables.length,
        extractionMethod: 'advanced'
      }
    };

  } catch (error) {
    console.error('Advanced PDF processing failed:', error.message);
    console.log('Falling back to basic PDF extraction...');
    return await processPDFBasic(file);
  }
}

/**
 * Process a single page with table detection
 */
function processPageWithTables(page, pageNum) {
  const items = page.content || [];
  
  if (items.length === 0) {
    return { text: '', tables: [], paragraphs: [] };
  }

  // Sort items by vertical position (y), then horizontal (x)
  const sortedItems = [...items].sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < 5) { // Same line (within 5 pixels)
      return a.x - b.x; // Sort by x position
    }
    return a.y - b.y; // Sort by y position
  });

  // Detect tables by analyzing alignment patterns
  const tables = detectTablesInPage(sortedItems, pageNum);
  
  // Extract regular text (not in tables)
  const textItems = sortedItems.filter(item => !isInTable(item, tables));
  const paragraphs = groupIntoParagraphs(textItems);
  
  // Build page text with tables as markdown
  let pageText = '';
  
  // Add paragraphs
  paragraphs.forEach(para => {
    pageText += para.text + '\n\n';
  });

  // Add tables in markdown format
  tables.forEach((table, idx) => {
    pageText += `\n### Table ${idx + 1} (Page ${pageNum})\n\n`;
    pageText += formatTableAsMarkdown(table);
    pageText += '\n\n';
  });

  return {
    text: pageText.trim(),
    tables: tables,
    paragraphs: paragraphs
  };
}

/**
 * Detect tables by analyzing item positions
 */
function detectTablesInPage(items, pageNum) {
  const tables = [];
  
  // Group items by Y position (rows)
  const rowGroups = groupByRows(items);
  
  // Find patterns that look like tables
  for (let i = 0; i < rowGroups.length; i++) {
    const currentRow = rowGroups[i];
    
    // Check if this row looks like a table header
    if (isLikelyTableHeader(currentRow)) {
      const tableRows = [currentRow];
      let j = i + 1;
      
      // Collect following rows that align with header
      while (j < rowGroups.length && alignsWithHeader(rowGroups[j], currentRow)) {
        tableRows.push(rowGroups[j]);
        j++;
        
        // Limit table size
        if (tableRows.length > 100) break;
      }
      
      // If we found multiple aligned rows, it's likely a table
      if (tableRows.length >= 2) {
        tables.push({
          page: pageNum,
          rows: tableRows,
          startY: currentRow.y,
          endY: tableRows[tableRows.length - 1].y
        });
        
        i = j - 1; // Skip processed rows
      }
    }
  }
  
  return tables;
}

/**
 * Group items by Y position (rows)
 */
function groupByRows(items, threshold = 5) {
  const rows = [];
  
  items.forEach(item => {
    // Find existing row with similar Y position
    let existingRow = rows.find(row => Math.abs(row.y - item.y) < threshold);
    
    if (existingRow) {
      existingRow.items.push(item);
    } else {
      rows.push({
        y: item.y,
        items: [item]
      });
    }
  });
  
  // Sort items within each row by X position
  rows.forEach(row => {
    row.items.sort((a, b) => a.x - b.x);
  });
  
  return rows.sort((a, b) => a.y - b.y);
}

/**
 * Check if a row looks like a table header
 */
function isLikelyTableHeader(row) {
  // Headers typically have:
  // - Multiple columns (3+)
  // - Short text
  // - Consistent spacing
  
  if (row.items.length < 3) return false;
  
  // Check for consistent spacing between columns
  const gaps = [];
  for (let i = 1; i < row.items.length; i++) {
    gaps.push(row.items[i].x - (row.items[i-1].x + row.items[i-1].width));
  }
  
  // If gaps are relatively consistent, likely a table
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const consistentGaps = gaps.every(gap => Math.abs(gap - avgGap) < avgGap * 0.5);
  
  return consistentGaps && row.items.every(item => item.str.length < 50);
}

/**
 * Check if a row aligns with header columns
 */
function alignsWithHeader(row, header, tolerance = 15) {
  if (row.items.length < 2) return false;
  if (row.items.length > header.items.length + 2) return false;
  
  // Check if items align with header positions
  let alignedCount = 0;
  
  row.items.forEach(item => {
    const hasAlignment = header.items.some(headerItem => 
      Math.abs(item.x - headerItem.x) < tolerance
    );
    if (hasAlignment) alignedCount++;
  });
  
  return alignedCount >= Math.min(2, row.items.length);
}

/**
 * Check if an item is within any detected table
 */
function isInTable(item, tables) {
  return tables.some(table => 
    item.y >= table.startY - 5 && item.y <= table.endY + 5
  );
}

/**
 * Group text items into paragraphs
 */
function groupIntoParagraphs(items) {
  const paragraphs = [];
  let currentParagraph = { text: '', y: 0, items: [] };
  
  items.forEach((item, idx) => {
    const text = item.str.trim();
    
    if (text.length === 0) return;
    
    // Check for paragraph break
    const isNewParagraph = idx > 0 && (
      Math.abs(item.y - currentParagraph.y) > 20 || // Vertical gap
      item.x < 50 // Back to left margin
    );
    
    if (isNewParagraph && currentParagraph.text.length > 0) {
      paragraphs.push(currentParagraph);
      currentParagraph = { text: '', y: item.y, items: [] };
    }
    
    currentParagraph.text += (currentParagraph.text ? ' ' : '') + text;
    currentParagraph.y = item.y;
    currentParagraph.items.push(item);
  });
  
  if (currentParagraph.text.length > 0) {
    paragraphs.push(currentParagraph);
  }
  
  return paragraphs;
}

/**
 * Format detected table as markdown
 */
function formatTableAsMarkdown(table) {
  if (!table.rows || table.rows.length === 0) return '';
  
  const rows = table.rows;
  const header = rows[0];
  const dataRows = rows.slice(1);
  
  // Create header row
  let markdown = '| ' + header.items.map(item => item.str.trim()).join(' | ') + ' |\n';
  
  // Create separator
  markdown += '| ' + header.items.map(() => '---').join(' | ') + ' |\n';
  
  // Create data rows
  dataRows.forEach(row => {
    // Align cells with header columns
    const cells = [];
    header.items.forEach(headerItem => {
      const matchingItem = row.items.find(item => 
        Math.abs(item.x - headerItem.x) < 30
      );
      cells.push(matchingItem ? matchingItem.str.trim() : '');
    });
    
    markdown += '| ' + cells.join(' | ') + ' |\n';
  });
  
  return markdown;
}

/**
 * Fallback to basic PDF processing
 */
async function processPDFBasic(file, bufferOverride = null) {
  const dataBuffer = bufferOverride || await ensurePdfBuffer(file);
  const pdfData = await pdfParse(dataBuffer);
  
  if (!pdfData.text || pdfData.text.trim().length === 0) {
    throw new Error('PDF file appears to be empty or contains only images');
  }
  
  const paragraphs = pdfData.text
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  return {
    fileType: 'pdf',
    data: {
      fullText: pdfData.text,
      paragraphs: paragraphs,
      pages: pdfData.numpages,
      tables: [],
      hasStructuredTables: false
    },
    metadata: {
      pages: pdfData.numpages,
      isStructured: false,
      textLength: pdfData.text.length,
      tableCount: 0,
      extractionMethod: 'basic'
    }
  };
}

async function ensurePdfBuffer(file) {
  if (file?.buffer && file.buffer.length) {
    return Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
  }

  if (file?.rawBuffer && file.rawBuffer.length) {
    return Buffer.isBuffer(file.rawBuffer) ? file.rawBuffer : Buffer.from(file.rawBuffer);
  }

  throw new Error(`PDF buffer unavailable for ${file?.originalname || 'uploaded file'}`);
}

