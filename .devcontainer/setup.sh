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

echo "💿 Installing AWS CLI..."
if ! command -v aws >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y awscli
else
    echo "✅ AWS CLI already installed"
fi
echo ""

AWS_CONFIG_DIR="/home/node/.aws"
mkdir -p "$AWS_CONFIG_DIR"

if [ ! -f "$AWS_CONFIG_DIR/config" ]; then
    cat <<'EOF' > "$AWS_CONFIG_DIR/config"
[default]
region = ap-southeast-1
output = json

[profile sunway-dev]
region = ap-southeast-1
output = json
EOF
    echo "🆕 Created AWS CLI config with default and sunway-dev profiles"
else
    echo "✅ AWS CLI config file already exists"
fi

if [ ! -f "$AWS_CONFIG_DIR/credentials" ]; then
    cat <<'EOF' > "$AWS_CONFIG_DIR/credentials"
[sunway-dev]
aws_access_key_id = $SUNWAY_DEV_ACCESS_KEY
aws_secret_access_key = $SUNWAY_DEV_SECRET_KEY
EOF
    echo "📝 Placeholder AWS credentials written for sunway-dev profile"
    echo "⚠️  Update /home/node/.aws/credentials with real values or use aws configure"
else
    echo "✅ AWS credentials file already exists"
fi

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Edit .env and add your Claude API key:"
echo "      code .env"
echo ""
echo "   2. Update AWS credentials:"
echo "      aws configure --profile sunway-dev"
echo ""
echo "   3. Start the server:"
echo "      npm start"
echo ""
echo "   4. Open http://localhost:3000 in your browser"
echo "      (VS Code will show a notification with a link)"
echo ""
echo "📚 For detailed instructions, see .devcontainer/README.md"

