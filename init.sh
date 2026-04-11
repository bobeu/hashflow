#!/bin/bash

# HashFlow One-Click Initialization Script
# Powering the institutional PayFi economy on HashKey.

echo "🌊 Initializing HashFlow Protocol..."

# 0. Pre-flight checks
echo "🔍 Performing pre-flight checks..."

if ! command -v forge &> /dev/null
then
    echo "❌ ERROR: Foundry (forge) is not installed. Please install it from https://book.getfoundry.sh/getting-started/installation"
    exit 1
fi

if ! command -v npm &> /dev/null
then
    echo "❌ ERROR: npm is not installed. Please install Node.js and npm from https://nodejs.org/"
    exit 1
fi

echo "✅ Pre-flight checks passed."

# 1. Contracts Setup
echo "🏗️ Setting up Foundry Contracts..."
cd contracts
forge install
forge build
cd ..

# 2. Frontend Setup
echo "🎨 Setting up CFO Command Center (Frontend)..."
cd frontend
npm install --legacy-peer-deps
echo "✅ Setup Complete."

echo "🚀 To start the dashboard, run:"
echo "   cd frontend && npm run dev"
