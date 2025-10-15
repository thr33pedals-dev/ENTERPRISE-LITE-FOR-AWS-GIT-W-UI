# 📚 Multi-File Upload Guide

**Complete guide for uploading and using Excel, PDF, DOCX, and TXT files with MCP**

---

## 🎯 What's New

Your Support AI system now supports **multiple file types**:

| File Type | Extension | Use Case |
|-----------|-----------|----------|
| **Excel** | `.xlsx`, `.xls` | Tracking data, structured information |
| **CSV** | `.csv` | Tabular data, exports |
| **PDF** | `.pdf` | Product catalogs, invoices, manuals |
| **Word** | `.docx` | Procedures, policies, quotes |
| **Text** | `.txt` | Notes, FAQs, simple documents |

---

## 🚀 Quick Start

### **Step 1: Prepare Your Files**

**Tracking Files (Excel/CSV):**
- Daily shipment tracking
- Order management
- Customer databases
- Pricing tables

**Knowledge Files (PDF/DOCX/TXT):**
- Product catalogs
- Company procedures
- Past quotes
- Email archives (exported as .txt)
- FAQ documents

### **Step 2: Upload**

1. Open http://localhost:3000
2. Drag & drop all files (or click to browse)
3. Mix and match file types!
4. Click "Upload & Process Files"

**Example Upload:**
```
✅ Daily_Tracking.xlsx    (tracking data)
✅ Carrier_Lookup.csv     (reference data)
✅ Product_Catalog.pdf    (knowledge base)
✅ Procedures.docx        (internal docs)
✅ FAQ.txt               (simple text)
```

### **Step 3: Ask Questions**

**About Tracking:**
```
"What's the status of PO SG2410-001?"
"Which shipments are delayed?"
"Show me all Malaysia shipments"
```

**About Knowledge:**
```
"What's the price for German calculators?"
"Do we have suppliers for office equipment?"
"What are the payment terms for bulk orders?"
"What's our shipping policy to Thailand?"
```

**Cross-Reference:**
```
"Find me the carrier contact for PO SG2410-001"
"What's the total cost including shipping to Malaysia?"
"Which products are available for next-week delivery?"
```

---

## 📊 How It Works

### **File Processing Flow:**

```
Upload Files
     ↓
═══════════════════════════════════
FILE PROCESSOR (Automatic)
═══════════════════════════════════
     ↓
Excel/CSV → Parse with xlsx library
           → Extract VLOOKUP values ✅
           → Save as JSON + TXT
     ↓
PDF → Extract text with pdf-parse
    → Split into paragraphs
    → Save as TXT
     ↓
DOCX → Extract text with mammoth
     → Preserve basic formatting
     → Save as TXT
     ↓
TXT → Read directly
    → Save as-is
     ↓
═══════════════════════════════════
CATEGORIZATION (Automatic)
═══════════════════════════════════
     ↓
Tracking Files (Excel with PO numbers)
Knowledge Files (PDF, DOCX, TXT)
Other Files (miscellaneous)
     ↓
═══════════════════════════════════
MCP ACCESS (Claude reads all)
═══════════════════════════════════
     ↓
Claude has access to ALL your files
Searches across all types
Combines information
Answers questions
```

---

## 📁 File Categories

### **Tracking Files (Structured Data)**

**What They Are:**
- Excel/CSV with PO numbers, orders, shipments
- Structured tabular data

**How They're Processed:**
```javascript
// Excel with VLOOKUPs:
Input:  Cell H2 = =VLOOKUP(B2, Carriers!A:D, 4, FALSE)
Output: Extracted value = "+65-6123-4567" ✅

// Saved as:
tracking_main.json  → For structured queries
tracking_main.txt   → For text search
```

**Quality Analysis:**
- ✅ Automatic data quality check
- ✅ Missing data detection
- ✅ Formula error detection
- ✅ Quality score (0-100%)

---

### **Knowledge Files (Unstructured Text)**

**What They Are:**
- PDF product catalogs
- DOCX procedures
- TXT notes, FAQs

**How They're Processed:**
```javascript
// PDF:
Input:  product_catalog.pdf
Output: Extracted text (all pages) → product_catalog.txt

// DOCX:
Input:  procedures.docx
Output: Extracted text (no images) → procedures.txt

// TXT:
Input:  faq.txt
Output: Read as-is → faq.txt
```

**Search:**
- ✅ Full-text search
- ✅ Semantic understanding
- ✅ Cross-document synthesis

---

## 💡 Use Cases

### **Use Case 1: Support AI**

**Files:**
```
✅ Daily_Tracking.xlsx    (shipment data)
✅ Carrier_Contacts.csv   (carrier info)
✅ Shipping_Policy.pdf    (policies)
```

**Questions:**
```
Customer: "Where's my shipment PO-001?"
AI: Searches tracking file → "In transit to Malaysia, ETA Oct 15"

Customer: "What's your refund policy?"
AI: Searches policy PDF → "30-day quality guarantee, details..."

Customer: "Who's my carrier and their phone?"
AI: Combines tracking + carrier CSV → "DHL Express, +65-6123-4567"
```

---

### **Use Case 2: Sales AI**

**Files:**
```
✅ Product_Catalog.pdf     (products & pricing)
✅ Customer_History.xlsx   (past orders)
✅ FAQ.txt                 (common questions)
```

**Questions:**
```
Lead: "Do you have German calculators?"
AI: Searches catalog → "Yes! CALC-GER-2024, €45/unit, MOQ 50"

Lead: "What's the lead time?"
AI: Catalog → "4-6 weeks from Germany, CE certified"

Lead: "Have we worked together before?"
AI: Searches customer history → "Yes, 3 orders in 2023-2024"
```

---

### **Use Case 3: Internal Knowledge**

**Files:**
```
✅ Email_Archive.txt       (exported emails)
✅ Past_Quotes.docx        (quote history)
✅ Supplier_Database.xlsx  (supplier info)
✅ Procedures.pdf          (internal SOPs)
```

**Questions:**
```
Staff: "German calculator supplier contact?"
AI: Searches email archive → "TechCalc GmbH, Hans Mueller, export@techcalc.de"

Staff: "What was our quote for ABC Corp last year?"
AI: Searches past quotes → "$45,000 for 1000 units in March 2023"

Staff: "How do we handle customs delays?"
AI: Searches procedures → [Step-by-step SOP from PDF]
```

---

## 🎯 Best Practices

### **1. File Organization**

**Good:**
```
Daily_Tracking_2024-10-09.xlsx  ← Clear date
Product_Catalog_2024.pdf        ← Clear version
Carrier_Contacts.csv            ← Descriptive name
```

**Bad:**
```
data.xlsx          ← Too generic
file123.pdf        ← No description
download (1).csv   ← Browser default
```

### **2. File Quality**

**For Excel:**
- ✅ Save before uploading (formulas calculated)
- ✅ No password protection
- ✅ Clean data (no #N/A, #REF! errors)
- ✅ Consistent date formats

**For PDF:**
- ✅ Text-based (not scanned images)
- ✅ Clear, readable text
- ✅ Under 20 pages is ideal
- ⚠️ Scanned PDFs won't extract text

**For DOCX:**
- ✅ Simple formatting
- ✅ Mostly text (images won't extract)
- ✅ No complex tables
- ✅ Clear headings

**For TXT:**
- ✅ UTF-8 encoding
- ✅ Clear structure
- ✅ Proper line breaks

### **3. Upload Strategy**

**Recommended:**
```
Upload Type 1: Tracking + References
- Tracking.xlsx
- Carriers.csv
- Pricing.csv

Upload Type 2: Knowledge Base
- Catalog.pdf
- Procedures.docx
- FAQ.txt

Upload Type 3: Mixed (for comprehensive support)
- All of the above together!
```

**Limitations:**
- Max 10 files per upload
- Max 10MB per file
- Can re-upload anytime (replaces previous)

---

## 🔧 Technical Details

### **Supported MIME Types:**

```javascript
Excel:
- application/vnd.ms-excel
- application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

PDF:
- application/pdf

Word:
- application/vnd.openxmlformats-officedocument.wordprocessingml.document

CSV:
- text/csv

Text:
- text/plain
```

### **Processing Libraries:**

```javascript
xlsx         → Excel/CSV parsing (extracts VLOOKUP values!)
pdf-parse    → PDF text extraction
mammoth      → DOCX text extraction
fs (native)  → TXT file reading
```

### **Storage Structure:**

```
uploads/
├── temp/                    (temporary upload storage)
└── processed/               (MCP-accessible files)
    ├── tracking_0.json     (Excel as JSON)
    ├── tracking_0.txt      (Excel as text)
    ├── catalog_1.txt       (PDF as text)
    ├── catalog_1_meta.json (PDF metadata)
    ├── procedures_2.txt    (DOCX as text)
    └── manifest.json       (file index)
```

---

## 🧪 Testing Examples

### **Test 1: Excel Tracking**

**Upload:**
```
1_Daily_Tracking.csv
2_Carrier_Lookup.csv
3_Pricing_Rates.csv
```

**Ask:**
```
"What's the status of PO SG2410-001?"
"Which carrier handles ABC Manufacturing?"
"What's the price to ship to Malaysia?"
```

**Expected:** ✅ Accurate answers from Excel data

---

### **Test 2: PDF Knowledge**

**Upload:**
```
4_Product_Catalog.txt (simulates PDF content)
```

**Ask:**
```
"Do you have German calculators?"
"What's the MOQ for industrial calculators?"
"Who's the contact for TechCalc GmbH?"
"What are the payment terms?"
```

**Expected:** ✅ Detailed info from catalog

---

### **Test 3: Mixed Files**

**Upload:**
```
1_Daily_Tracking.csv
4_Product_Catalog.txt
```

**Ask:**
```
"What's in PO SG2410-001 and how much does it cost to ship?"
"Do we have German calculators in stock, and when can we ship to Malaysia?"
```

**Expected:** ✅ Combined info from both files

---

## ⚠️ Troubleshooting

### **"PDF appears to be empty"**

**Cause:** PDF is scanned images, not text
**Solution:** 
- Use OCR software first (Adobe Acrobat, online tools)
- Or export as text before uploading

### **"DOCX warnings about images"**

**Cause:** Document contains images
**Solution:** Text is extracted, images ignored (normal behavior)

### **"Excel formula errors detected"**

**Cause:** #N/A or #REF! in cells
**Solution:** 
- Open Excel
- Press F9 to recalculate
- Fix errors
- Save and re-upload

### **"File type not supported"**

**Cause:** Wrong file extension
**Solution:** 
- Check file is actually .xlsx/.pdf/.docx/.txt
- Not .xls (old Excel) - save as .xlsx
- Not .doc (old Word) - save as .docx

---

## 📈 Performance

### **Processing Speed:**

| File Type | Size | Time |
|-----------|------|------|
| Excel (.xlsx) | 1MB, 500 rows | 1-2 seconds |
| CSV | 1MB | < 1 second |
| PDF | 2MB, 20 pages | 2-3 seconds |
| DOCX | 500KB | 1 second |
| TXT | 100KB | < 1 second |

### **AI Response Speed:**

| Query Type | Files | Time |
|------------|-------|------|
| Simple (1 file) | Excel, 100 rows | 2-3 seconds |
| Complex (3 files) | Mixed types | 4-6 seconds |
| Knowledge search | PDF, 20 pages | 3-5 seconds |

---

## 🎉 Summary

**What You Can Do Now:**

✅ Upload Excel, PDF, DOCX, TXT files
✅ Mix and match file types
✅ Ask questions about ANY file
✅ Cross-reference information
✅ Get instant AI answers
✅ No manual file merging needed

**What Happens Automatically:**

✅ File type detection
✅ Text extraction (PDF, DOCX)
✅ VLOOKUP value extraction (Excel)
✅ Data quality analysis
✅ File categorization
✅ MCP access for Claude

**Key Benefits:**

- ⚡ Fast: 1-5 seconds per file
- 💰 Cheap: No vector DB needed
- 🧠 Smart: Understands multiple formats
- 🔄 Flexible: Upload anytime
- 📊 Quality: Auto quality checks

---

**Ready to test? Upload your files and start asking questions!** 🚀

*For more details, see README.md and QUICKSTART.md*


