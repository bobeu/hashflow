#!/bin/bash

# HashFlow One-Click Initialization Script
# Powering the institutional PayFi economy on HashKey.

echo "🌊 Initializing HashFlow Protocol..."

# 1. Contracts Setup
echo "🏗️ Setting up Foundry Contracts..."
cd contracts
if [ -x "$(command -v forge)" ]; then
    forge install
    forge build
else
    echo "⚠️ Foundry (forge) not detected. Skipping contract build."
fi
cd ..

# 2. Frontend Setup
echo "🎨 Setting up CFO Command Center (Frontend)..."
cd frontend
npm install --legacy-peer-deps
echo "✅ Setup Complete."

echo "🚀 To start the dashboard, run:"
echo "   cd frontend && npm run dev"
