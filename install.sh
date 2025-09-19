#!/bin/bash

# GradeBrowser Installation Script
# This script helps set up GradeBrowser for easy sharing and deployment

set -e  # Exit on any error

echo "🚀 GradeBrowser Installation Script"
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (version 14 or higher) first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version 14 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating environment configuration..."
    cp env.example .env
    echo "✅ Environment file created (.env)"
    echo "   You can edit .env to customize settings like PORT and AUTOLAB_ROOT"
else
    echo "ℹ️  Environment file already exists (.env)"
fi

# Make scripts executable
chmod +x install.sh

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Edit .env file if needed (optional)"
echo "   2. Run: npm start"
echo "   3. Open: http://localhost:3000"
echo ""
echo "🔧 Available commands:"
echo "   npm start          - Start the server"
echo "   npm run reset      - Clean and reinstall dependencies"
echo ""
echo "📚 For more information, see README.md"
