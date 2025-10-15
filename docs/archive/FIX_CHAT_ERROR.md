# 🔧 Fix Chat Error: "Failed to fetch"

## 🚨 **The Problem:**
Your chat shows "Failed to get response: Failed to fetch" because the server is missing the Anthropic API key.

## ✅ **The Solution:**

### **Step 1: Create .env file**

Create a file called `.env` in your project root with this content:

```env
# Anthropic API Key (required)
# Get yours at: https://console.anthropic.com/
ANTHROPIC_API_KEY=your_actual_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# File Upload Settings
MAX_FILE_SIZE=10485760
MAX_FILES=10

# MCP Settings
UPLOADS_DIR=./uploads
PROCESSED_DIR=./uploads/processed

# Claude Model Configuration
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=4096
CLAUDE_TEMPERATURE=0.3
```

### **Step 2: Get Your API Key**

1. Go to: https://console.anthropic.com/
2. Sign up/Login
3. Go to "API Keys" section
4. Create a new API key
5. Copy the key (starts with `sk-ant-...`)

### **Step 3: Update .env file**

Replace `your_actual_api_key_here` with your real API key:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### **Step 4: Restart Server**

```bash
# Stop current server (Ctrl+C)
# Then restart:
npm start
```

### **Step 5: Test Chat**

1. Open: http://localhost:3000
2. Upload some files first
3. Try asking a question in chat
4. Should work now! ✅

---

## 🔍 **Why This Happened:**

1. ✅ Server is running (port 3000)
2. ✅ API endpoints exist
3. ❌ Missing API key → Claude can't respond
4. ❌ "Failed to fetch" = API call fails

---

## 🧪 **Test Steps:**

### **1. Check Server Logs:**
```bash
npm start
# Should show:
# ✅ Server running on port 3000
# ✅ Claude Model: claude-3-5-sonnet-20241022
# ✅ API endpoints listed
```

### **2. Test API Directly:**
```bash
# Test if server responds
curl http://localhost:3000/api/status
# Should return: {"status":"ok","files":0}
```

### **3. Test Chat:**
1. Upload files first
2. Ask: "What files do I have?"
3. Should get AI response ✅

---

## 🚨 **Common Issues:**

### **Issue 1: "Invalid API Key"**
- Check API key is correct
- Make sure no extra spaces
- Key should start with `sk-ant-`

### **Issue 2: "Rate Limited"**
- You've hit API limits
- Wait a few minutes
- Check your Anthropic account usage

### **Issue 3: "No files uploaded"**
- Upload files first before chatting
- Chat needs data to work with

---

## 💡 **Quick Fix:**

```bash
# 1. Create .env file
cp env.example.txt .env

# 2. Edit .env file
# Replace "your_api_key_here" with real key

# 3. Restart server
npm start

# 4. Test in browser
# http://localhost:3000
```

---

## 🎯 **Expected Result:**

After fixing:
- ✅ Chat works
- ✅ AI responds to questions
- ✅ No more "Failed to fetch"
- ✅ All features working

---

## 📞 **Still Having Issues?**

### **Check Server Console:**
Look for error messages like:
- "Missing API key"
- "Invalid API key" 
- "Rate limited"

### **Check Browser Console:**
Press F12 → Console tab
Look for network errors

### **Test API Key:**
```bash
# Test if API key works
node -e "
import { createClaudeClient } from './src/claude-client.js';
const client = createClaudeClient();
console.log('API key test:', client ? 'OK' : 'FAILED');
"
```

---

## 🎉 **Once Fixed:**

Your system will have:
- ✅ Working chat
- ✅ AI responses
- ✅ File processing
- ✅ Quality reports
- ✅ All features working

**Ready for production!** 🚀

---

**Need help? Check the server console for specific error messages!**
