# ⚡ Quick Start Guide

**Get your Support AI running in 5 minutes!**

---

## 🚀 Steps

### 1. Install Dependencies (1 minute)

```bash
npm install
```

---

### 2. Set Up API Key (1 minute)

**Create a `.env` file:**

```bash
# Copy the example file
cp env.example.txt .env

# OR on Windows
copy env.example.txt .env
```

**Edit `.env` and add your Anthropic API key:**

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-api-key-here
```

**Get your API key from:** https://console.anthropic.com/

---

### 3. Start the Server (30 seconds)

```bash
npm start
```

You should see:

```
🚀 Support AI Server with MCP
================================
📡 Server running on http://localhost:3000
🤖 Claude Model: claude-sonnet-4-20250514
...
```

---

### 4. Open in Browser (30 seconds)

Navigate to: **http://localhost:3000**

---

### 5. Test with Example Files (2 minutes)

1. **Drag & drop** the example files from `examples/` folder:
   - `1_Daily_Tracking.csv`
   - `2_Carrier_Lookup.csv`
   - `3_Pricing_Rates.csv`

2. **Click "Upload & Process Files"**

3. **View the Quality Report** - should show:
   - Quality Score: ~70-80%
   - 10 total records
   - 3 critical issues (missing data in test files)

4. **Ask a question:**
   ```
   "What's the status of PO SG2410-001?"
   ```

5. **Get instant answer:**
   ```
   "PO SG2410-001 for ABC Manufacturing is currently in 
   transit to Malaysia with DHL Express. The shipment is 
   on schedule with an estimated delivery on October 15, 
   2024. Last update was on October 8, 2024, and the 
   current location is Singapore Port."
   ```

---

## ✅ You're Done!

**That's it! Your Support AI is running!**

---

## 🎯 Next Steps

### Use Your Own Data

1. Export your Excel tracking files
2. Upload them (supports `.xlsx`, `.xls`, `.csv`)
3. Ask questions about your actual shipments!

### Customize

- **Change AI tone:** Edit `src/claude-client.js` → `buildSystemPrompt()`
- **Add quality checks:** Edit `src/quality-analyzer.js`
- **Adjust upload limits:** Edit `.env` → `MAX_FILE_SIZE` and `MAX_FILES`

### Deploy to Production

See **README.md** → "Deployment" section for:
- Heroku
- Railway.app
- DigitalOcean
- AWS/GCP/Azure

---

## 🐛 Troubleshooting

### "ANTHROPIC_API_KEY is required"

→ Create `.env` file with your API key

### "Port 3000 already in use"

→ Change port in `.env`: `PORT=3001`

### "No data uploaded yet"

→ Upload Excel files first before chatting

### More issues?

→ See **README.md** → "Troubleshooting" section

---

## 📚 Learn More

- **Full Documentation:** README.md
- **API Reference:** README.md → "API Documentation"
- **Excel with VLOOKUPs:** examples/HOW_TO_CREATE_EXCEL_WITH_VLOOKUPS.md

---

## 💡 Example Questions to Ask

After uploading tracking files:

```
"What's the status of PO SG2410-001?"
"Which shipments are delayed?"
"Show me all Malaysia shipments"
"What's the ETA for order SG2410-004?"
"Which carrier is handling the most shipments?"
"Are there any issues with my tracking data?"
"What shipments are in transit right now?"
```

---

## 🎉 Success!

**You now have:**
- ✅ AI-powered tracking support
- ✅ Multi-file Excel upload
- ✅ Automatic data quality checking
- ✅ Instant answers to customer questions
- ✅ No vector database or embeddings needed!

**Time to market:** 5 minutes  
**Complexity:** Low  
**Cost:** ~$0.10-0.50 per conversation  
**Value:** Priceless! 🚀

---

**Questions? Check README.md or open an issue!**

*Built for SMEs who want AI without complexity* ❤️


