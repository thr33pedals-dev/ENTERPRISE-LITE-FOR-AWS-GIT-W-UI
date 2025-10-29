/**
 * Test script to evaluate PDF extraction quality
 * Tests current system capabilities with PDFs, especially tables and images
 * 
 * Usage: node test-pdf-quality.js <path-to-pdf>
 */

import { processFiles } from './src/file-processor.js';
import fs from 'fs';
import path from 'path';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.log('');
  console.log('📊 PDF Quality Test Script');
  console.log('=========================');
  console.log('');
  console.log('Usage: node test-pdf-quality.js <path-to-pdf>');
  console.log('');
  console.log('Example:');
  console.log('  node test-pdf-quality.js ./test-docs/insurance_brochure.pdf');
  console.log('');
  process.exit(1);
}

// Check if file exists
if (!fs.existsSync(pdfPath)) {
  console.error(`❌ File not found: ${pdfPath}`);
  process.exit(1);
}

async function testPDFQuality() {
  console.log('');
  console.log('🔬 Testing PDF Extraction Quality');
  console.log('=================================');
  console.log(`📄 File: ${path.basename(pdfPath)}`);
  console.log(`📁 Path: ${pdfPath}`);
  console.log('');

  try {
    // Create mock multer file object
    const stats = fs.statSync(pdfPath);
    const fileBuffer = await fs.promises.readFile(pdfPath);
    const mockFile = {
      originalname: path.basename(pdfPath),
      mimetype: 'application/pdf',
      path: pdfPath,
      size: stats.size,
      buffer: fileBuffer
    };

    console.log('⏳ Extracting text from PDF...');
    console.log('');

    const startTime = Date.now();
    const processed = await processFiles([mockFile], { tenantId: 'test' });
    const extractionTime = Date.now() - startTime;

    if (processed.length === 0) {
      console.error('❌ Failed to process PDF');
      return;
    }

    const result = processed[0];

    console.log('✅ Extraction Complete!');
    console.log('');
    console.log('📊 EXTRACTION RESULTS');
    console.log('====================');
    console.log(`⏱️  Processing Time: ${extractionTime}ms`);
    console.log(`📏 File Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`📄 Pages: ${result.data.pages || 'Unknown'}`);
    console.log(`📝 Text Length: ${result.data.fullText?.length || 0} characters`);
    console.log(`📋 Paragraphs: ${result.data.paragraphs?.length || 0}`);
    console.log('');

    // Quality Analysis
    console.log('🔍 QUALITY ANALYSIS');
    console.log('==================');

    const text = result.data.fullText || '';
    const textLength = text.length;

    // Check 1: Text extraction success
    if (textLength === 0) {
      console.log('❌ No text extracted - PDF likely contains only images');
      console.log('   Recommendation: Use OCR or Claude Vision API');
    } else if (textLength < 500) {
      console.log('⚠️  Very little text extracted (< 500 chars)');
      console.log('   Possible issues:');
      console.log('   - PDF is mostly images');
      console.log('   - Scanned document without OCR layer');
      console.log('   Recommendation: Consider OCR processing');
    } else if (textLength < 2000) {
      console.log('⚠️  Limited text extracted (< 2000 chars)');
      console.log('   Quality may be compromised');
    } else {
      console.log('✅ Good amount of text extracted');
    }
    console.log('');

    // Check 2: Table detection (heuristic)
    const hasTabularData = detectTabularPatterns(text);
    if (hasTabularData.detected) {
      console.log('⚠️  Tabular data detected but structure may be lost!');
      console.log(`   - Found ${hasTabularData.indicators.length} table indicators`);
      console.log('   - Current extraction method loses table structure');
      console.log('   Recommendation: Implement Tabula or pdf.js-extract for tables');
    } else {
      console.log('✅ No obvious tables detected (or tables preserved as text)');
    }
    console.log('');

    // Check 3: Special characters / encoding issues
    const hasSpecialChars = /[^\x00-\x7F]/.test(text);
    const garbledRatio = countGarbledText(text);
    if (garbledRatio > 0.1) {
      console.log('⚠️  High ratio of special/garbled characters detected');
      console.log(`   - Garbled ratio: ${(garbledRatio * 100).toFixed(1)}%`);
      console.log('   Possible encoding issues or non-English content');
    } else {
      console.log('✅ Text encoding looks clean');
    }
    console.log('');

    // Check 4: Insurance-specific patterns
    const insurancePatterns = detectInsuranceContent(text);
    if (insurancePatterns.isInsuranceDoc) {
      console.log('📋 INSURANCE DOCUMENT DETECTED');
      console.log('   Found patterns:');
      insurancePatterns.patterns.forEach(p => {
        console.log(`   - ${p}`);
      });
      console.log('');
      console.log('   Insurance-specific recommendations:');
      console.log('   - Tables with pricing/coverage are critical');
      console.log('   - Consider upgrading to Vision API for 90%+ accuracy');
      console.log('   - Test: Can you find specific plan prices in extracted text?');
    }
    console.log('');

    // Sample output
    console.log('📝 EXTRACTED TEXT SAMPLE (First 1000 chars)');
    console.log('===========================================');
    console.log(text.substring(0, 1000));
    if (text.length > 1000) {
      console.log('...\n[' + (text.length - 1000) + ' more characters]');
    }
    console.log('');

    // Overall recommendation
    console.log('');
    console.log('🎯 OVERALL RECOMMENDATION');
    console.log('========================');
    
    const score = calculateQualityScore({
      textLength,
      hasTabularData: hasTabularData.detected,
      garbledRatio,
      isInsurance: insurancePatterns.isInsuranceDoc
    });

    console.log(`Quality Score: ${score.score}/10`);
    console.log('');
    console.log('Recommended Actions:');
    score.recommendations.forEach(rec => {
      console.log(`  ${rec.priority} ${rec.action}`);
    });
    console.log('');

    // Save results
    const outputPath = pdfPath.replace('.pdf', '_extraction_test.txt');
    fs.writeFileSync(outputPath, text);
    console.log(`💾 Full extracted text saved to: ${outputPath}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error processing PDF:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
  }
}

// Helper functions
function detectTabularPatterns(text) {
  const indicators = [];
  
  // Look for multiple spaces (column alignment)
  if (/\s{3,}/g.test(text)) {
    indicators.push('Multiple consecutive spaces (column alignment)');
  }
  
  // Look for dollar amounts in patterns
  const dollarMatches = text.match(/\$[\d,]+/g);
  if (dollarMatches && dollarMatches.length > 5) {
    indicators.push(`${dollarMatches.length} dollar amounts (pricing table?)`);
  }
  
  // Look for percentage values
  const percentMatches = text.match(/\d+%/g);
  if (percentMatches && percentMatches.length > 3) {
    indicators.push(`${percentMatches.length} percentage values`);
  }
  
  // Look for repeated patterns (table rows)
  const lines = text.split('\n');
  const shortLines = lines.filter(l => l.trim().length > 0 && l.trim().length < 100);
  if (shortLines.length > 10) {
    indicators.push(`${shortLines.length} short lines (possible table rows)`);
  }

  return {
    detected: indicators.length > 0,
    indicators: indicators
  };
}

function countGarbledText(text) {
  let garbledChars = 0;
  for (let char of text) {
    const code = char.charCodeAt(0);
    // Check for common garbled ranges
    if (code > 127 && code < 160) {
      garbledChars++;
    }
  }
  return garbledChars / text.length;
}

function detectInsuranceContent(text) {
  const textLower = text.toLowerCase();
  const patterns = [];
  
  const keywords = [
    { term: 'premium', desc: 'Premium/pricing' },
    { term: 'deductible', desc: 'Deductible amounts' },
    { term: 'coverage', desc: 'Coverage terms' },
    { term: 'policy', desc: 'Policy mentions' },
    { term: 'claim', desc: 'Claims information' },
    { term: 'beneficiary', desc: 'Beneficiary info' },
    { term: 'copay', desc: 'Copay/coinsurance' },
    { term: 'out-of-pocket', desc: 'Out-of-pocket costs' }
  ];

  keywords.forEach(kw => {
    if (textLower.includes(kw.term)) {
      patterns.push(kw.desc);
    }
  });

  return {
    isInsuranceDoc: patterns.length >= 3,
    patterns: patterns
  };
}

function calculateQualityScore(metrics) {
  let score = 10;
  const recommendations = [];

  // Deduct points for issues
  if (metrics.textLength === 0) {
    score = 0;
    recommendations.push({
      priority: '🔴',
      action: 'CRITICAL: No text extracted. Implement OCR or Vision API immediately.'
    });
  } else if (metrics.textLength < 500) {
    score -= 5;
    recommendations.push({
      priority: '🟠',
      action: 'HIGH: Very little text extracted. Add OCR support.'
    });
  } else if (metrics.textLength < 2000) {
    score -= 2;
    recommendations.push({
      priority: '🟡',
      action: 'MEDIUM: Limited text extracted. Verify PDF quality.'
    });
  }

  if (metrics.hasTabularData) {
    score -= 2;
    recommendations.push({
      priority: '🟠',
      action: 'HIGH: Tables detected but structure lost. Implement Tabula or pdf.js-extract.'
    });
  }

  if (metrics.garbledRatio > 0.1) {
    score -= 1;
    recommendations.push({
      priority: '🟡',
      action: 'MEDIUM: Encoding issues detected. Check character set handling.'
    });
  }

  if (metrics.isInsurance && score < 8) {
    recommendations.push({
      priority: '🔴',
      action: 'CRITICAL FOR INSURANCE: Current quality insufficient. Upgrade to Vision API.'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: '✅',
      action: 'GOOD: Current PDF extraction is adequate for this document type.'
    });
  }

  // Add temperature recommendation
  recommendations.push({
    priority: '✅',
    action: 'Add temperature=0.3 to Claude config for consistent support responses (DONE in latest code).'
  });

  return {
    score: Math.max(0, score),
    recommendations: recommendations
  };
}

// Run the test
testPDFQuality();

