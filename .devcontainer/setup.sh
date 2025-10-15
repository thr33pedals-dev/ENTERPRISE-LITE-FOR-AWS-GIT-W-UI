#!/bin/bash

echo "🚀 Setting up Support AI Document Assistant in Codespaces..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp env.example.txt .env
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your Anthropic API key"
    echo "   Run: code .env"
    echo ""
else
    echo "✅ .env file already exists"
    echo ""
fi

# Check if API key is configured
if grep -q "YOUR_API_KEY_HERE" .env 2>/dev/null || grep -q "sk-ant-api" .env 2>/dev/null; then
    echo "⚠️  WARNING: Please update your API key in .env file"
    echo "   Your current key looks like a placeholder"
    echo ""
fi

echo "📦 Installing dependencies..."
npm install
echo ""

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Edit .env and add your Claude API key:"
echo "      code .env"
echo ""
echo "   2. Start the server:"
echo "      npm start"
echo ""
echo "   3. Open http://localhost:3000 in your browser"
echo "      (VS Code will show a notification with a link)"
echo ""
echo "📚 For detailed instructions, see .devcontainer/README.md"

