# 🧪 Complete Testing Guide

---

## 🚀 **Quick Test (5 minutes):**

### **Step 1: Open Browser**
```
1. Go to: http://localhost:3000
2. Should see: "AI Document Assistant" title
3. Should see: White background with red theme
```

### **Step 2: Test File Upload**
```
1. Drag & drop a file OR click "browse"
2. Select any file (Excel, PDF, DOCX, TXT)
3. Click "Upload & Process Files"
4. Should see: Success message + file list
```

### **Step 3: Test Chat**
```
1. In chat box, type: "What files do I have?"
2. Press Enter or click Send
3. Should get AI response (not "Failed to fetch")
```

---

## 🔧 **If You See Errors:**

### **Error 1: "Failed to fetch" in chat**
**Solution:** The server needs to be restarted with the fix
```bash
# Stop server (Ctrl+C in terminal)
# Then restart:
npm start
```

### **Error 2: "No files uploaded"**
**Solution:** Upload files first before chatting
```
1. Upload some files
2. Wait for "Successfully processed" message
3. Then try chat
```

### **Error 3: Server not responding**
**Solution:** Check if server is running
```bash
# Check if port 3000 is in use:
netstat -an | findstr :3000
# Should show: TCP 0.0.0.0:3000 LISTENING
```

---

## 🧪 **Complete Test Checklist:**

### **✅ UI Testing:**
- [ ] Title shows "AI Document Assistant" (not MCP)
- [ ] White background with red theme
- [ ] File upload area works
- [ ] File list shows uploaded files
- [ ] "Clear All" button works

### **✅ File Upload Testing:**
- [ ] Drag & drop works
- [ ] Browse button works
- [ ] Multiple file selection works
- [ ] File removal works
- [ ] Upload button works
- [ ] Success message appears

### **✅ Chat Testing:**
- [ ] Chat input works
- [ ] Send button works
- [ ] Enter key works
- [ ] AI responds (not "Failed to fetch")
- [ ] Markdown formatting works
- [ ] Loading indicator works

### **✅ File Management Testing:**
- [ ] Uploaded files display correctly
- [ ] File icons show (📊📄📝)
- [ ] File details show (type, rows)
- [ ] "Clear All" removes everything
- [ ] Chat resets after clear

---

## 🎯 **Test Scenarios:**

### **Scenario 1: First Time User**
```
1. Open browser → Should see welcome screen
2. Upload Excel file → Should process successfully
3. Ask "What files do I have?" → Should list files
4. Ask "Tell me about the data" → Should describe content
```

### **Scenario 2: Multiple Files**
```
1. Upload 3-4 different files (Excel, PDF, DOCX)
2. Check file list → Should show all files
3. Ask "Compare the files" → Should get comparison
4. Click "Clear All" → Should reset everything
```

### **Scenario 3: Error Handling**
```
1. Try uploading invalid file type → Should show error
2. Try chatting without files → Should prompt to upload
3. Try asking off-topic question → Should redirect to business topics
```

---

## 🔍 **Debugging Steps:**

### **If Chat Doesn't Work:**
```bash
# 1. Check server console for errors
# Look for: "Chat error:" messages

# 2. Test API directly
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'

# 3. Check browser console (F12)
# Look for network errors
```

### **If Files Don't Upload:**
```bash
# 1. Check uploads directory
ls uploads/processed/
# Should show: manifest.json + processed files

# 2. Check file permissions
# Make sure uploads/ directory is writable
```

### **If UI Looks Wrong:**
```bash
# 1. Hard refresh browser (Ctrl+F5)
# 2. Check if all CSS loaded
# 3. Check browser console for errors
```

---

## 📊 **Expected Results:**

### **✅ Successful Test:**
```
✅ Server: Running on port 3000
✅ UI: White + Red theme, professional look
✅ Upload: Files process successfully
✅ Chat: AI responds with helpful answers
✅ Files: Display correctly with icons
✅ Management: Clear All works
✅ Quality: Reports show accurate data
```

### **❌ Failed Test:**
```
❌ Server: Not running or errors
❌ UI: Wrong colors or broken layout
❌ Upload: Files fail to process
❌ Chat: "Failed to fetch" error
❌ Files: Not displayed or wrong info
❌ Management: Buttons don't work
```

---

## 🚀 **Quick Start Testing:**

### **1. Basic Functionality (2 minutes):**
```bash
# Start server
npm start

# Open browser
http://localhost:3000

# Test upload
Upload any file → Should work

# Test chat
Ask: "What files do I have?" → Should respond
```

### **2. Advanced Testing (5 minutes):**
```bash
# Test guardrails
node test-guardrails.js
# Should show: ✅ 10/10 tests passed

# Test multiple files
Upload 3-4 files → Should all process

# Test file management
Click "Clear All" → Should reset everything
```

### **3. Production Testing (10 minutes):**
```bash
# Test with real business data
Upload Excel with tracking data
Ask: "What's the status of PO-123?"
Should get detailed response

# Test PDF processing
Upload PDF document
Ask: "What's in this document?"
Should extract and describe content
```

---

## 🎯 **Success Criteria:**

### **✅ System is Working If:**
- Server starts without errors
- UI loads with correct theme
- Files upload and process
- Chat responds (not "Failed to fetch")
- File management works
- Quality reports show data

### **❌ System Needs Fix If:**
- Server shows errors
- UI is broken or wrong colors
- Upload fails
- Chat shows "Failed to fetch"
- Files don't display
- Buttons don't work

---

## 📞 **Need Help?**

### **If Tests Fail:**
1. **Check server console** for specific errors
2. **Check browser console** (F12) for client errors
3. **Try restarting server** (Ctrl+C, then npm start)
4. **Check file permissions** on uploads directory

### **If Everything Works:**
🎉 **Congratulations! Your system is production-ready!**

---

## 🎉 **Ready to Test!**

**Your system should now:**
- ✅ Start without errors
- ✅ Show professional UI
- ✅ Process files correctly
- ✅ Chat with AI responses
- ✅ Manage files properly

**Go test it now!** 🚀
