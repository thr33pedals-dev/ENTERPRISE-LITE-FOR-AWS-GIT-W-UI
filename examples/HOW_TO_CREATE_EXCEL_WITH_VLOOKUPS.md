# How to Create Excel Files with VLOOKUPs for Testing

This guide shows you how to convert the provided CSV files into Excel files with VLOOKUP formulas to test the system's ability to extract calculated values.

---

## 📋 Quick Start

### Option 1: Use CSV Files Directly (Easiest)

The CSV files provided can be uploaded as-is! The system handles CSV just like Excel.

**Just upload:**
- `1_Daily_Tracking.csv`
- `2_Carrier_Lookup.csv`
- `3_Pricing_Rates.csv`

**No VLOOKUPs needed for basic testing!**

---

### Option 2: Create Excel with VLOOKUPs (Advanced Testing)

This tests the system's ability to extract VLOOKUP calculated values.

---

## 🔧 Step-by-Step: Creating Excel with VLOOKUPs

### Step 1: Open CSV Files in Excel

1. Open **Microsoft Excel**
2. Open each CSV file:
   - `1_Daily_Tracking.csv`
   - `2_Carrier_Lookup.csv`
   - `3_Pricing_Rates.csv`

3. **Save each as `.xlsx`:**
   - File → Save As → Excel Workbook (.xlsx)
   - Save to same folder

---

### Step 2: Create a Master Workbook

**Create a new Excel file: `Tracking_Master.xlsx`**

**Add 3 sheets:**
1. `Tracking` (main data)
2. `Carriers` (lookup table)
3. `Pricing` (pricing table)

---

### Step 3: Copy Data to Sheets

**Sheet 1: "Tracking"**
- Copy data from `1_Daily_Tracking.csv`
- Paste into `Tracking` sheet

**Sheet 2: "Carriers"**
- Copy data from `2_Carrier_Lookup.csv`
- Paste into `Carriers` sheet

**Sheet 3: "Pricing"**
- Copy data from `3_Pricing_Rates.csv`
- Paste into `Pricing` sheet

---

### Step 4: Add VLOOKUP Formulas

**In the `Tracking` sheet:**

#### Example: Add Carrier Phone Lookup

1. **Add new column:** `Carrier_Phone` (column J)

2. **In cell J2, enter formula:**
   ```excel
   =VLOOKUP(B2, Carriers!A:D, 4, FALSE)
   ```
   - `B2` = Customer name (lookup value)
   - `Carriers!A:D` = Range in Carriers sheet
   - `4` = Return 4th column (Phone)
   - `FALSE` = Exact match

3. **Copy formula down** to all rows (drag fill handle)

#### Example: Add Shipping Price Lookup

1. **Add new column:** `Shipping_Cost` (column K)

2. **In cell K2, enter formula:**
   ```excel
   =IFERROR(VLOOKUP(C2&"-"&H2, Pricing!A:D, 4, FALSE), "Price TBD")
   ```
   - `C2&"-"&H2` = Combine Destination + Service Level
   - `Pricing!A:D` = Range in Pricing sheet
   - `4` = Return 4th column (Price)
   - `IFERROR` = Handle missing matches gracefully

3. **Note:** This will show "Price TBD" if no match found

**Better approach:** Create a helper column in Pricing sheet:
- Column A: `Route-Service` (e.g., "Malaysia-Priority")
- Then VLOOKUP becomes simpler

---

### Step 5: Save and Calculate

1. **Press F9** to force recalculation of all formulas

2. **Verify formulas calculated:**
   - Check that phone numbers appear
   - Check that prices appear
   - Look for `#N/A` or `#REF!` errors

3. **Save the file:**
   - File → Save
   - Make sure formulas have calculated values

---

### Step 6: Test Upload

1. **Upload `Tracking_Master.xlsx` to the Support AI**

2. **The system should:**
   - ✅ Extract calculated VLOOKUP values
   - ✅ Detect main tracking sheet
   - ✅ Generate quality report
   - ✅ Allow AI to answer questions

3. **Test question:**
   - "What's the carrier phone for ABC Manufacturing?"
   - Should return: "+65-6123-4567"

---

## 🧪 Testing Different Scenarios

### Scenario 1: Normal VLOOKUPs (All Working)

**Setup:**
- All formulas calculate successfully
- No errors

**Expected Result:**
- Quality Score: 90-100%
- No critical issues
- AI can answer all questions

---

### Scenario 2: Formula Errors (#N/A)

**Setup:**
1. In Tracking sheet, change a customer name to "Unknown Company"
2. VLOOKUP will return `#N/A` (not found in Carriers sheet)
3. Save file

**Expected Result:**
- Quality Analyzer detects formula errors
- Critical issue flagged: "Formula error detected: #N/A"
- Recommendation: "Check VLOOKUP or formula in Excel"
- Quality Score: Lower

---

### Scenario 3: Missing Data

**Setup:**
1. Leave some cells empty (e.g., ETA column)
2. Save file

**Expected Result:**
- Quality Analyzer detects missing values
- Warning: "Missing value in Row X, Column ETA"
- Recommendation: "X rows have missing data"
- Quality Score: 70-80%

---

### Scenario 4: Uncalculated Formulas

**Setup:**
1. Create formulas
2. Set Excel to Manual calculation mode
3. **Don't press F9**
4. Save file immediately

**Expected Result:**
- Empty cells where formulas should show values
- Quality Analyzer detects missing data
- System may not get VLOOKUP results

**Fix:** Open file, press F9, save, re-upload

---

## 📊 Example VLOOKUP Formulas Reference

### Basic VLOOKUP
```excel
=VLOOKUP(A2, Sheet2!A:C, 2, FALSE)
```

### VLOOKUP with Error Handling
```excel
=IFERROR(VLOOKUP(A2, Sheet2!A:C, 2, FALSE), "Not Found")
```

### VLOOKUP with Multiple Criteria (Concatenate)
```excel
=VLOOKUP(A2&B2, Sheet2!A:D, 3, FALSE)
```
*Note: Requires helper column in lookup table*

### INDEX-MATCH (Alternative to VLOOKUP)
```excel
=INDEX(Sheet2!C:C, MATCH(A2, Sheet2!A:A, 0))
```
*Also works! System extracts calculated values*

---

## ✅ Verification Checklist

Before uploading:

- [ ] All formulas show **values**, not formulas
- [ ] No `#N/A`, `#REF!`, or `#VALUE!` errors
- [ ] File saved as `.xlsx` (Excel Workbook)
- [ ] Pressed F9 to recalculate
- [ ] File size < 10MB
- [ ] Contains PO numbers or order tracking data

---

## 🎯 Quick Test File

**Want to test immediately?**

1. **Use the CSV files** (no Excel needed!)
   - Just upload all 3 CSVs
   - System processes them

2. **Ask test questions:**
   - "What's the status of PO SG2410-001?"
   - "Which shipments are going to Malaysia?"
   - "Show me all DHL Express shipments"
   - "What's delayed?"

3. **Verify quality report:**
   - Should detect missing ETA on SG2410-046
   - Should detect missing Status on SG2410-047
   - Should detect missing Carrier on SG2410-048

---

## 🚀 Advanced: Multi-File with VLOOKUPs

**Scenario:** Customer uses separate files for tracking, carriers, and pricing

**Setup:**

**File 1: `Tracking.xlsx`**
```
PO_Number | Customer          | Status      | Carrier (VLOOKUP)
SG-001    | ABC Manufacturing | In Transit  | =VLOOKUP(B2, [Carriers.xlsx]Sheet1!A:B, 2, FALSE)
```

**File 2: `Carriers.xlsx`**
```
Customer          | Carrier
ABC Manufacturing | DHL Express
```

**How to Test:**

1. Save both files separately
2. Open `Tracking.xlsx`
3. Press F9 to calculate VLOOKUPs
4. Save both files
5. Upload **both files** to Support AI
6. System extracts calculated values from Tracking.xlsx
7. Also has raw data from Carriers.xlsx

**This tests:**
- ✅ Multi-file upload
- ✅ VLOOKUP extraction
- ✅ File relationship detection

---

## 📝 Notes

**The xlsx library extracts values by:**
```javascript
XLSX.utils.sheet_to_json(sheet, { raw: false })
```

**This returns:**
- ✅ Calculated formula results
- ✅ Formatted values
- ✅ Not the formula text itself

**Requirements:**
- Excel must calculate formulas before saving
- Save as `.xlsx` (not `.xls` legacy format for best results)
- Formulas must not have errors

---

**Happy testing! 🎉**

*If you encounter issues, check the main README.md troubleshooting section.*


