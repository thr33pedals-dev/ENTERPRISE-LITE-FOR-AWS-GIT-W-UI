import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

const rootDir = path.resolve('examples');
const pdfDir = path.join(rootDir, 'pdf');
const docDir = path.join(rootDir, 'doc');

fs.mkdirSync(pdfDir, { recursive: true });
fs.mkdirSync(docDir, { recursive: true });

function generateCarrierWorkbook() {
  const workbook = XLSX.utils.book_new();

  const carrierData = [
    ['Carrier', 'Service_Level', 'Primary_Contact', 'Phone', 'SLA_Days'],
    ['DHL Express', 'Express Worldwide', 'Lim Wei', '+65 6123 4567', 3],
    ['FedEx International', 'Priority', 'Nur Aisyah', '+65 6987 3210', 5],
    ['UPS Worldwide', 'Saver', 'Agus Santoso', '+65 6777 8899', 4],
    ['DB Schenker', 'Rail Freight', 'Maria Lopez', '+65 6000 1122', 12]
  ];
  const carrierSheet = XLSX.utils.aoa_to_sheet(carrierData);

  const surchargeData = [
    ['Region', 'Fuel_Surcharge', 'Peak_Surcharge', 'Handled_By'],
    ['SEA', 0.12, 0.03, 'DHL Express'],
    ['EU', 0.15, 0.05, 'FedEx International'],
    ['US', 0.18, 0.04, 'UPS Worldwide'],
    ['CN', 0.10, 0.02, 'DB Schenker']
  ];
  const surchargeSheet = XLSX.utils.aoa_to_sheet(surchargeData);

  const slaCalcData = [
    ['PO_Number', 'Base_Days', 'Extra_Buffer', 'Calculated_SLA'],
    ['SG2410-001', 5, 2, '=B2+C2'],
    ['SG2410-007', 8, 3, '=B3+C3'],
    ['SG2410-015', 10, 4, '=B4+C4'],
    ['SG2410-021', 4, 1, '=B5+C5']
  ];
  const slaSheet = XLSX.utils.aoa_to_sheet(slaCalcData);

  XLSX.utils.book_append_sheet(workbook, carrierSheet, 'Carriers');
  XLSX.utils.book_append_sheet(workbook, surchargeSheet, 'Surcharges');
  XLSX.utils.book_append_sheet(workbook, slaSheet, 'SLA_Calcs');

  const workbookPath = path.join(rootDir, '2_Carrier_Lookup.xlsx');
  XLSX.writeFile(workbook, workbookPath);
  console.log(`Generated ${workbookPath}`);
}

function generatePricingWorkbook() {
  const workbook = XLSX.utils.book_new();

  const rateData = [
    ['Route', 'Service_Type', 'Carrier', 'Base_Price', 'Fuel', 'Total'],
    ['SIN-BKK', 'Air', 'DHL Express', 480, 0.12, '=D2*(1+E2)'],
    ['SIN-CGK', 'Sea', 'Maersk', 750, 0.10, '=D3*(1+E3)'],
    ['SIN-MNL', 'Air', 'FedEx International', 520, 0.14, '=D4*(1+E4)'],
    ['SIN-KUL', 'Road', 'UPS Worldwide', 260, 0.08, '=D5*(1+E5)']
  ];
  const rateSheet = XLSX.utils.aoa_to_sheet(rateData);
  XLSX.utils.book_append_sheet(workbook, rateSheet, 'Rates');

  const workbookPath = path.join(rootDir, '3_Pricing_Rates.xlsx');
  XLSX.writeFile(workbook, workbookPath);
  console.log(`Generated ${workbookPath}`);
}

function generatePdfWithTables() {
  const doc = new PDFDocument({ margin: 40 });
  const pdfPath = path.join(pdfDir, 'Leave_Policy_Table.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(20).text('Employee Leave Policy Overview', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text('This document summarises annual leave, sick leave and special leave entitlements.');
  doc.moveDown();

  const tableData = [
    ['Leave Type', 'Eligibility', 'Annual Entitlement', 'Carry Forward'],
    ['Annual Leave', 'All full-time staff', '18 days', 'Up to 5 days'],
    ['Sick Leave', 'After probation', '14 days', 'No'],
    ['Hospitalisation', 'All staff', '60 days', 'No'],
    ['Childcare', 'Parents with children <12', '6 days', 'No']
  ];

  const startX = 40;
  let startY = doc.y;

  tableData.forEach(row => {
    const rowHeight = 20;
    row.forEach((cell, idx) => {
      const cellWidth = idx === 0 ? 140 : 120;
      doc.rect(startX + idx * cellWidth, startY, cellWidth, rowHeight).stroke();
      doc.text(cell, startX + idx * cellWidth + 5, startY + 5, {
        width: cellWidth - 10,
        height: rowHeight - 10
      });
    });
    startY += rowHeight;
  });

  doc.moveDown(2);
  doc.fontSize(12).text('Employees should submit leave requests via the HR portal at least two weeks in advance where possible.');
  doc.end();
  console.log(`Generated ${pdfPath}`);
}

function generatePdfMultiColumn() {
  const doc = new PDFDocument({ margin: 50 });
  const pdfPath = path.join(pdfDir, 'Employee_Brochure_MultiColumn.pdf');
  doc.pipe(fs.createWriteStream(pdfPath));

  doc.fontSize(22).text('Staff Benefits & Wellness', { align: 'center' });
  doc.moveDown();

  const columnWidth = 240;
  const gutter = 20;
  const textBlock = `At Summit Retail Group, employee wellbeing is paramount. We provide flexible benefits including:\n• Comprehensive medical coverage with panel clinics across ASEAN.\n• Wellness credits redeemable for gym memberships, fitness classes or ergonomic equipment.\n• Learning wallets for professional certifications.\n\nMental health support is available 24/7 via our partner counsellors. Employees may book confidential sessions anytime. Annual wellbeing fairs host nutritionists and physiotherapists for personalised consultations.\n\nRemember to check your benefits dashboard each quarter for newly added partner deals.`;

  doc.fontSize(11);
  doc.text(textBlock, 50, doc.y, { width: columnWidth });

  const secondColumnY = doc.y - doc.heightOfString(textBlock, { width: columnWidth }) + 15;
  const columnTwoText = `Travel policies\n--------------\n• Daily meal allowance: SGD 35\n• Hotel cap: SGD 220\n• Airport transfer: Pre-approved rides only\n\nClaim submission must be completed within 7 days of trip completion using the Concur portal.`;

  doc.text(columnTwoText, 50 + columnWidth + gutter, secondColumnY, { width: columnWidth });

  doc.end();
  console.log(`Generated ${pdfPath}`);
}

function generateDocHandbookTxt() {
  const filePath = path.join(docDir, 'Retail_Employee_Handbook.txt');
  const content = `Retail Support Handbook\n\nSection 4.2 - Sick Leave\n-----------------------\nAssociates who feel unwell should notify their Store Team Leader before the start of shift. Provide a medical certificate for absences beyond 2 consecutive days. Paid sick leave entitlement is 14 days per year.\n\nSection 4.3 - Emergency Leave\n-----------------------------\nEmergency leave of up to 3 days may be granted for urgent family matters. Contact the Workforce Planner by phone and log the request in the Workforce app.`;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Generated ${filePath}`);
}

function run() {
  generateCarrierWorkbook();
  generatePricingWorkbook();
  generatePdfWithTables();
  generatePdfMultiColumn();
  generateDocHandbookTxt();
  console.log('Sample data generation completed.');
}

run(); 
