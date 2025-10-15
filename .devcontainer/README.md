# 🚀 GitHub Codespaces Quick Start

This project is configured to run in GitHub Codespaces with minimal setup.

## **Prerequisites**
- GitHub account
- Anthropic Claude API key

## **Launch Instructions**

### **Step 1: Create Codespace**
1. Go to your GitHub repository
2. Click the **Code** button (green button)
3. Select the **Codespaces** tab
4. Click **Create codespace on main**

GitHub will automatically:
- ✅ Set up Node.js 20 environment
- ✅ Run `npm install`
- ✅ Forward port 3000

### **Step 2: Configure API Key**
Once Codespace opens:

```bash
# Copy the example env file
cp env.example.txt .env

# Edit the .env file and add your Claude API key
# In VS Code, open .env and replace YOUR_API_KEY_HERE with your actual key
```

Or use this one-liner:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env
```

### **Step 3: Start the Server**
```bash
npm start
```

### **Step 4: Access the Application**
- VS Code will show a notification: **"Your application running on port 3000 is available"**
- Click **Open in Browser**
- Or go to the **PORTS** tab and click the **🌐** icon next to port 3000

## **🔒 Security Notes**

⚠️ **IMPORTANT:** 
- Never commit your `.env` file (it's in `.gitignore`)
- Your Claude API key will only be stored in your Codespace
- Codespaces are private by default
- If you want to share the running app, you can make the port public (right-click port → Port Visibility → Public)

## **💡 Tips**

### **Stopping the Server**
Press `Ctrl+C` in the terminal

### **Restarting**
```bash
npm start
```

### **Viewing Logs**
All API calls and file processing logs appear in the terminal where you ran `npm start`

### **Clearing Uploaded Files**
```bash
# Clear all processed files
rm -rf uploads/processed/*
```

### **Testing with Sample Data**
Sample files are included in the `examples/` folder:
- Upload them through the web UI
- Test tracking queries, product catalog, etc.

## **🌐 Sharing Your Codespace**

If you want others to test:

1. **Make Port Public:**
   - Go to PORTS tab
   - Right-click port 3000
   - Select **Port Visibility** → **Public**
   - Share the URL

2. **Note:** They'll use YOUR Claude API (your costs/quota)

## **📊 Monitoring Usage**

Check your Claude API usage at:
https://console.anthropic.com/settings/usage

## **🛑 Stopping Your Codespace**

To save GitHub minutes:
- Click your Codespace name (bottom left)
- Select **Stop Current Codespace**

Codespaces auto-stop after 30 minutes of inactivity.

## **Troubleshooting**

### **Port Not Forwarding**
If you don't see the notification:
1. Go to **PORTS** tab (bottom panel)
2. Port 3000 should be listed
3. Click the **🌐** icon to open

### **API Key Not Working**
```bash
# Verify .env file exists and has correct format
cat .env

# Should show:
# ANTHROPIC_API_KEY=sk-ant-...
```

### **Dependencies Not Installed**
```bash
npm install
```

### **Need Fresh Start**
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

## **💰 Cost Considerations**

- **GitHub Codespaces:** Free tier includes 120 core-hours/month (60 hours on 2-core machine)
- **Claude API:** Pay-per-use based on your Anthropic plan
- Your Codespace auto-stops after inactivity to save credits

## **Next Steps**

Once running:
1. Upload sample files from `examples/` folder
2. Test with questions about tracking, products, policies
3. Try different document types (Excel, PDF, TXT, DOCX)
4. Review quality reports
5. Test with your own company documents

## **📚 Documentation**

- [Full Documentation](../README.md)
- [Deployment Guide](../QUICKSTART.md)
- [Multi-File Guide](../MULTI_FILE_GUIDE.md)

