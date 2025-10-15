# 🚀 Support AI with MCP (Model Context Protocol)

A complete, production-ready Support AI system that handles multi-file Excel uploads with VLOOKUPs and provides instant AI-powered tracking support using Claude and MCP.

**Perfect for SMEs handling shipment tracking, order management, and customer support!**

---

## ✨ Features

### 📁 **Smart Excel Processing**
- Upload **3-5 Excel files at once** (or more!)
- Automatically extracts **VLOOKUP calculated values**
- Detects main tracking file vs. lookup tables
- Handles `.xlsx`, `.xls`, and `.csv` formats

### 🔍 **Automatic Data Quality Analysis**
- Detects missing data and formula errors (`#N/A`, `#REF!`)
- Identifies duplicate PO numbers
- Checks date format consistency
- Generates quality score and actionable recommendations

### 🤖 **Claude AI with MCP**
- AI reads your Excel data directly (via simulated MCP)
- Answers customer questions about shipments, PO status, ETA
- Natural language understanding
- Context-aware responses

### 💬 **Chat Interface**
- Beautiful, modern web UI
- Real-time chat with AI
- Conversation history
- Mobile-responsive

### 🎯 **Production-Ready**
- Error handling and validation
- File size limits and security
- RESTful API architecture
- Easy deployment

---

## 🏗️ Architecture

```
Customer Question
      ↓
Frontend (Web UI)
      ↓
Express Server
      ↓
Excel Processor (xlsx library)
  - Reads Excel files
  - Extracts VLOOKUP values ✅
  - Saves as JSON
      ↓
MCP Simulation
  - Gives Claude access to JSON files
  - Claude reads and searches data
      ↓
Claude API (Anthropic)
  - Understands question
  - Searches tracking data
  - Generates answer
      ↓
Response to Customer ✅
```

---

## 📦 Installation

> **💡 Quick Start:** Want to skip local setup? Use [GitHub Codespaces](#-deployment) - no installation needed!

### Prerequisites
- **Node.js 18+** (download from nodejs.org)
- **Anthropic API Key** (get from console.anthropic.com)
- Basic terminal/command line knowledge

### Step 1: Clone or Download

```bash
# If you have git
git clone [your-repo-url]
cd Support-AI-MCP

# Or just download and extract the ZIP file
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web server
- `multer` - File uploads
- `xlsx` - Excel processing (handles VLOOKUPs!)
- `@anthropic-ai/sdk` - Claude AI
- `@modelcontextprotocol/sdk` - MCP framework
- Other utilities

### Step 3: Configure Environment

1. **Rename `env.example.txt` to `.env`**

2. **Add your Anthropic API key:**

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
```

Get your API key from: https://console.anthropic.com/

3. **(Optional) Customize settings:**

```env
PORT=3000
CLAUDE_MODEL=claude-3-5-sonnet-20241022
MAX_FILE_SIZE=10485760
MAX_FILES=10
```

### Step 4: Start the Server

```bash
npm start
```

You should see:

```
🚀 Support AI Server with MCP
================================
📡 Server running on http://localhost:3000
🤖 Claude Model: claude-3-5-sonnet-20241022
📁 Uploads directory: ./uploads/processed

📋 API Endpoints:
   POST   http://localhost:3000/api/upload
   POST   http://localhost:3000/api/chat
   ...

💡 Open http://localhost:3000 in your browser
```

### Step 5: Open in Browser

Navigate to: **http://localhost:3000**

---

## 🎯 Usage

### Upload Your Excel Files

1. **Drag & drop** or **click to browse** your Excel tracking files

2. **Select 1-5 files:**
   - Main tracking file (with PO numbers, status, ETA)
   - Carrier lookup file (customer → carrier mapping)
   - Pricing file (route → price mapping)
   - Any other related files

3. **Click "Upload & Process Files"**

4. **View Quality Report:**
   - Quality score (%)
   - Critical issues detected
   - Recommendations

### Chat with AI

Once files are uploaded:

1. **Type a question:**
   - "What's the status of PO SG-001?"
   - "When will order #12345 arrive?"
   - "Which shipments are delayed?"
   - "Show me all Malaysia shipments"

2. **Get instant answers!**

The AI will:
- Search through your uploaded data
- Find relevant information
- Provide complete, accurate answers
- Include status, ETA, carrier, location, etc.

---

## 📊 Example Excel Files

### Main Tracking File (`Daily_Tracking.xlsx`)

| PO Number | Customer    | Destination | Status      | ETA        | Carrier      |
|-----------|-------------|-------------|-------------|------------|--------------|
| SG-001    | ABC Corp    | Malaysia    | In Transit  | 2024-10-15 | =VLOOKUP(B2, Carriers!A:B, 2) |
| SG-002    | XYZ Ltd     | Thailand    | Customs     | 2024-10-18 | =VLOOKUP(B3, Carriers!A:B, 2) |
| SG-003    | Global Inc  | Indonesia   | Delivered   | 2024-10-10 | =VLOOKUP(B4, Carriers!A:B, 2) |

### Carrier Lookup (`Carriers.xlsx`)

| Customer    | Carrier       | Phone         |
|-------------|---------------|---------------|
| ABC Corp    | DHL Express   | +65-1234-5678 |
| XYZ Ltd     | FedEx        | +65-2345-6789 |
| Global Inc  | UPS          | +65-3456-7890 |

### When Uploaded:

The system:
1. ✅ Reads Excel files
2. ✅ Extracts **CALCULATED VLOOKUP values** (DHL Express, FedEx, UPS)
3. ✅ Saves as searchable JSON
4. ✅ Claude can now answer: *"Who's the carrier for PO SG-001?"* → **"DHL Express (+65-1234-5678)"**

---

## 🔧 How VLOOKUPs Are Handled

### The Challenge:
Excel formulas like `=VLOOKUP(B2, Carriers!A:B, 2)` display values but aren't directly readable.

### Our Solution:

```javascript
// Using xlsx library
const workbook = XLSX.readFile('tracking.xlsx');
const data = XLSX.utils.sheet_to_json(sheet, {
  raw: false  // ← This extracts CALCULATED values! ✅
});

// Result:
console.log(data[0].Carrier);
// Output: "DHL Express" (not "=VLOOKUP(...)")
```

**As long as:**
- ✅ Customer saved Excel before uploading
- ✅ Formulas calculated successfully
- ✅ No `#N/A` or `#REF!` errors

**You get all the values automatically!**

### Error Detection:

If formulas haven't calculated or have errors:

```javascript
// System detects:
- Missing values (empty cells)
- Formula errors (#N/A, #REF!, #VALUE!)
- Generates quality report
- Recommends: "Press F9 in Excel, save, re-upload"
```

---

## 🌐 API Documentation

### `POST /api/upload`

Upload and process Excel files.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `files[]` (array of files)

**Response:**
```json
{
  "success": true,
  "filesProcessed": 3,
  "mainFile": {
    "name": "Daily_Tracking.xlsx",
    "rows": 150,
    "columns": ["PO_Number", "Customer", "Status", "ETA"]
  },
  "qualityReport": {
    "totalRows": 150,
    "qualityScore": 92,
    "criticalIssues": [],
    "recommendations": []
  }
}
```

### `POST /api/chat`

Chat with AI about tracking data.

**Request:**
```json
{
  "message": "What's the status of PO SG-001?",
  "conversationHistory": []
}
```

**Response:**
```json
{
  "success": true,
  "response": "PO SG-001 is currently in transit to Malaysia with DHL Express. The estimated delivery is October 15, 2024. Last update shows the shipment cleared Singapore customs on October 12.",
  "sources": "Daily_Tracking.xlsx"
}
```

### `GET /api/status`

Get system status.

**Response:**
```json
{
  "success": true,
  "status": {
    "serverRunning": true,
    "dataUploaded": true,
    "uploadTime": "2024-10-09T15:30:00Z",
    "totalRecords": 150,
    "qualityScore": 92,
    "claudeModel": "claude-3-5-sonnet-20241022"
  }
}
```

### `GET /api/quality-report`

Get current data quality report.

### `DELETE /api/clear`

Clear all uploaded data (for testing).

---

## 🛠️ Configuration

### Environment Variables (`.env`)

```env
# Required
ANTHROPIC_API_KEY=your_api_key_here

# Server
PORT=3000
NODE_ENV=development

# File Upload Limits
MAX_FILE_SIZE=10485760    # 10MB
MAX_FILES=10

# Claude Configuration
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=4096
```

### Customization Points:

**1. Change Upload Limits:**
```javascript
// server.js
const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024,  // 20MB instead of 10MB
    files: 20                     // 20 files instead of 10
  }
});
```

**2. Customize System Prompt:**
```javascript
// src/claude-client.js - buildSystemPrompt()
let prompt = `You are a [YOUR CUSTOM ROLE].
Your tone: [FRIENDLY/PROFESSIONAL/TECHNICAL]
Your rules: [YOUR BUSINESS RULES]
...`;
```

**3. Add Custom Quality Checks:**
```javascript
// src/quality-analyzer.js - analyzeDataQuality()
// Add your own validation logic
if (row.ETA < today) {
  issues.push({ issue: 'Overdue shipment!' });
}
```

---

## 🚀 Deployment

### Quick Start (Testing & Development):

**🌐 GitHub Codespaces (Recommended for Testing):**

The easiest way to deploy and test without any local setup:

1. **Fork/Clone this repository to GitHub**
2. **Open in Codespaces:**
   - Click the **Code** button (green)
   - Select **Codespaces** tab
   - Click **Create codespace on main**
3. **Configure API Key:**
   ```bash
   cp env.example.txt .env
   # Edit .env and add your Claude API key
   ```
4. **Start the server:**
   ```bash
   npm start
   ```
5. **Access the app:**
   - VS Code will show a notification
   - Click to open in browser
   - Or use the PORTS tab

📚 **See [.devcontainer/README.md](.devcontainer/README.md) for detailed Codespaces setup**

**Benefits:**
- ✅ No local setup required
- ✅ Node.js pre-installed
- ✅ Free tier: 120 core-hours/month
- ✅ Auto-forwards port 3000
- ✅ Can make public for user testing
- ✅ Auto-stops after inactivity

---

### Deploy to Production:

**1. Heroku:**
```bash
# Install Heroku CLI
heroku create support-ai-app
heroku config:set ANTHROPIC_API_KEY=sk-ant-xxxxx
git push heroku main
```

**2. Railway.app:**
```bash
# Connect GitHub repo
# Set environment variables in dashboard
# Auto-deploys on push
```

**3. DigitalOcean App Platform:**
```bash
# Create app from GitHub
# Set environment variables
# Auto-scales
```

**4. AWS/GCP/Azure:**
- Deploy as Docker container
- Use managed services (EC2, Cloud Run, App Service)

### Security Checklist:
- ✅ Set `NODE_ENV=production`
- ✅ Use HTTPS (SSL certificate)
- ✅ Set proper CORS origins
- ✅ Add rate limiting
- ✅ Implement authentication (if multi-tenant)
- ✅ Regular security updates

---

## 🧪 Testing

### Manual Testing:

1. **Upload test files** (in `examples/` folder)
2. **Check quality report** - should detect issues
3. **Ask test questions:**
   - "Show me all PO numbers"
   - "What's the status of PO SG-001?"
   - "Which shipments are delayed?"

### Automated Testing:

```bash
npm test
```

Run `test-upload.js` to simulate file uploads and chat.

---

## 📁 Project Structure

```
Support-AI-MCP/
├── server.js                 # Main Express server
├── package.json              # Dependencies
├── .env                      # Environment variables (create from env.example.txt)
├── src/
│   ├── excel-processor.js    # Excel file parsing (handles VLOOKUPs)
│   ├── claude-client.js      # Claude API + MCP simulation
│   └── quality-analyzer.js   # Data quality checks
├── public/
│   └── index.html            # Web UI (drag & drop, chat)
├── uploads/
│   ├── temp/                 # Temporary upload storage
│   └── processed/            # Processed JSON files (MCP reads these)
├── examples/                 # Example Excel files
└── README.md                 # This file
```

---

## 🎓 How It Works (Deep Dive)

### 1. File Upload Flow

```
User drops Excel files
      ↓
Multer saves to temp/
      ↓
Excel Processor:
  - XLSX.readFile() with { raw: false }
  - Extracts calculated VLOOKUP values ✅
  - Converts to JSON
  - Saves to uploads/processed/tracking_main.json
      ↓
Quality Analyzer:
  - Scans for missing data
  - Detects formula errors
  - Calculates quality score
      ↓
Response sent to frontend
```

### 2. Chat Flow

```
User asks: "Status of PO SG-001?"
      ↓
Frontend sends to /api/chat
      ↓
Claude Client:
  - Reads manifest.json (file metadata)
  - Loads tracking_main.json
  - Includes data in system prompt
      ↓
Claude API:
  - Understands question
  - Searches JSON data in context
  - Finds PO SG-001
  - Generates natural language answer
      ↓
Response: "PO SG-001 is in transit..."
```

### 3. MCP Simulation

**True MCP** (Future):
```javascript
// Claude calls filesystem tool
const data = mcp.readFile('/uploads/processed/tracking_main.json');
// Claude searches data
```

**Current Implementation** (Works Now):
```javascript
// We load file and include in prompt
const data = fs.readFileSync('tracking_main.json');
const systemPrompt = `Here's the tracking data:\n${JSON.stringify(data)}`;
// Claude has data in context, can search it
```

**Same result, different method!**

When official MCP SDK is ready, we can switch to true tool calling with minimal code changes.

---

## ❓ FAQ

### **Q: Do I need vector database or embeddings?**
**A:** No! For < 1,000 records per customer, Claude can search JSON directly. Vector DB only needed for 10,000+ records.

### **Q: What if customer uploads Excel with formulas that haven't calculated?**
**A:** The quality analyzer detects empty cells and `#N/A` errors, then recommends: "Open Excel, press F9, save, re-upload."

### **Q: Can it handle multiple files with different structures?**
**A:** Yes! The system detects the main tracking file (has PO numbers) and treats others as lookup tables. You can also implement custom merging logic.

### **Q: What if I have 5 Excel files to merge?**
**A:** Upload all 5. The system saves them separately. Claude reads all files and combines information when answering questions. Or use `mergeFiles()` function to merge into one JSON.

### **Q: Is this production-ready?**
**A:** Yes! Includes error handling, validation, quality checks, and proper architecture. Add authentication for multi-tenant use.

### **Q: How much does it cost?**
**A:** 
- Development: $0 (free Anthropic credits for new accounts)
- Production: ~$0.10-0.50 per conversation (Claude API)
- Hosting: $5-20/month (Railway, Heroku, DigitalOcean)

### **Q: Can I customize the AI's behavior?**
**A:** Yes! Edit `buildSystemPrompt()` in `src/claude-client.js` to change tone, add business rules, customize responses.

---

## 🐛 Troubleshooting

### "ANTHROPIC_API_KEY is required"
- Create `.env` file from `env.example.txt`
- Add your API key: `ANTHROPIC_API_KEY=sk-ant-xxxxx`

### "File too large"
- Default limit: 10MB per file
- Increase in `.env`: `MAX_FILE_SIZE=20971520` (20MB)

### "No data uploaded yet"
- Upload Excel files first before chatting
- Check browser console for upload errors
- Check server logs for processing errors

### "Claude gives wrong information"
- Check if Excel formulas calculated (no #N/A errors)
- Review quality report for missing data
- Verify file uploaded successfully (check `/api/status`)

### "Server won't start"
- Check Node.js version: `node --version` (need 18+)
- Delete `node_modules` and run `npm install` again
- Check if port 3000 is available: `lsof -i :3000` (Mac/Linux)

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## 📄 License

MIT License - feel free to use in your projects!

---

## 🙏 Acknowledgments

- **Anthropic** - Claude AI API
- **SheetJS** - XLSX library for Excel processing
- **Express** - Web server framework
- **Model Context Protocol** - Filesystem access standard

---

## 📞 Support

- **Issues:** Open a GitHub issue
- **Questions:** Check FAQ above
- **Documentation:** This README!

---

## 🎯 Next Steps

**You're ready to go!**

1. ✅ Install dependencies: `npm install`
2. ✅ Set up `.env` with API key
3. ✅ Start server: `npm start`
4. ✅ Open http://localhost:3000
5. ✅ Upload your Excel files
6. ✅ Chat with AI!

**For your SME customers:**
- Demo takes 5 minutes
- Show them uploading their actual Excel files
- Let them ask real questions
- Watch them be amazed! 🚀

**Questions? Issues? Ideas?**
Open an issue or reach out!

---

**Built with ❤️ for SMEs who want AI without complexity**

*Transform your Excel tracking files into an intelligent AI assistant in minutes, not months!*


