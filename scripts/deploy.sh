#!/bin/bash

# Deployment script for Ownly Workspace to Cloudflare
set -e

echo "🚀 Deploying Ownly Workspace to Cloudflare..."

# Check if required commands exist
command -v wrangler >/dev/null 2>&1 || { echo "❌ wrangler CLI is required but not installed. Run: npm install -g wrangler" >&2; exit 1; }
command -v go >/dev/null 2>&1 || { echo "❌ Go is required but not installed." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed." >&2; exit 1; }

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build WASM files
echo "🔧 Building WebAssembly files..."
npm run go:wasm
npm run go:js

# Build the application
echo "🏗️  Building application..."
npm run build

# Deploy WebSocket worker first
echo "📡 Deploying WebSocket worker..."
cd worker
wrangler deploy
echo "✅ WebSocket worker deployed!"

# Get the worker URL for the main app
WORKER_URL=$(wrangler whoami --json | jq -r '.accounts[0].id' | xargs -I {} echo "wss://ownly-websocket.{}.workers.dev")
echo "🔗 WebSocket worker URL: $WORKER_URL"

cd ..

# Deploy to Cloudflare Pages
echo "🌐 Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=ownly-workspace --compatibility-date=2024-07-01

echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env.production with your worker URL: $WORKER_URL"
echo "2. Configure custom domains in Cloudflare dashboard if needed"
echo "3. Set up environment variables in Cloudflare Pages settings"
echo ""
echo "🔗 Your app should be available at: https://ownly-workspace.pages.dev"