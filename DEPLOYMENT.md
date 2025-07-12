# Cloudflare Deployment Guide

This guide explains how to deploy the Ownly Workspace application to Cloudflare Pages with WebSocket support.

## Architecture

The deployment consists of two components:

1. **Static Web App** → Cloudflare Pages
2. **WebSocket Server** → Cloudflare Workers

## Prerequisites

1. **Cloudflare Account** with Pages and Workers enabled
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **Go** installed (for WebAssembly build)
4. **Node.js** 18+ and npm

## Quick Deployment

### Option 1: Automated Script

```bash
# Run the deployment script
./scripts/deploy.sh
```

### Option 2: Manual Steps

#### 1. Install Dependencies
```bash
npm ci
```

#### 2. Build WASM Files
```bash
npm run go:wasm
npm run go:js
```

#### 3. Build Application
```bash
npm run build
```

#### 4. Deploy WebSocket Worker
```bash
cd worker
wrangler login
wrangler deploy
cd ..
```

#### 5. Deploy Web Application
```bash
npx wrangler pages deploy dist --project-name=ownly-workspace
```

## Configuration

### Environment Variables

Create `.env.production` with your WebSocket worker URL:

```env
# Replace with your actual worker URL
VITE_WEBSOCKET_URL=wss://ownly-websocket.your-account.workers.dev
VITE_DEBUG=false
```

### Cloudflare Settings

#### Pages Configuration
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`
- **Node.js version**: `20`

#### Worker Configuration
- **Main module**: `websocket-handler.js`
- **Compatibility date**: `2024-07-01`

## Custom Domains

### 1. Pages Domain
```bash
# Add custom domain in Cloudflare Dashboard
# Pages > ownly-workspace > Custom domains
# Example: app.yourdomain.com
```

### 2. Worker Domain
```bash
# Add route in Cloudflare Dashboard  
# Workers > ownly-websocket > Routes
# Example: ws.yourdomain.com/*
```

Update your environment variables accordingly:
```env
VITE_WEBSOCKET_URL=wss://ws.yourdomain.com
```

## CI/CD with GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys on push to main.

### Required Secrets

Add these secrets to your GitHub repository:

```
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
```

### Get API Token
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create token with permissions:
   - `Cloudflare Pages:Edit`
   - `Workers Scripts:Edit`
   - `Zone:Read`

## Monitoring & Debugging

### Worker Logs
```bash
wrangler tail ownly-websocket
```

### Pages Logs
Check the Functions tab in Cloudflare Pages dashboard.

### Health Check
Visit your worker URL directly:
```
https://ownly-websocket.your-account.workers.dev/health
```

## Scaling Considerations

### Worker Limits
- **CPU Time**: 10ms per request (paid plans: 50ms)
- **Memory**: 128MB
- **Duration**: 30 seconds for WebSocket connections

### Storage Options
The current implementation uses in-memory storage. For production:

1. **Durable Objects** for persistent WebSocket state
2. **KV Storage** for document persistence
3. **R2** for large document storage

### Example Durable Objects Integration
```javascript
// Add to worker/wrangler.toml
[[durable_objects.bindings]]
name = "DOCUMENTS"
class_name = "DocumentStore"

// Create document-store.js
export class DocumentStore {
  constructor(state, env) {
    this.state = state;
  }
  
  async fetch(request) {
    // Handle document operations
  }
}
```

## Security

### CORS Configuration
The worker automatically handles CORS for WebSocket connections.

### Rate Limiting
Consider adding rate limiting for production:

```javascript
// In worker
const RATE_LIMIT = 100; // requests per minute
// Implement rate limiting logic
```

### Authentication
For production, add authentication:

```javascript
// In worker message handler
if (!isAuthenticated(token)) {
  ws.send(JSON.stringify({
    type: 'error',
    message: 'Authentication required'
  }));
  return;
}
```

## Troubleshooting

### Common Issues

1. **WASM files not loading**
   ```bash
   # Ensure WASM files are built
   npm run go:wasm
   npm run go:js
   ```

2. **WebSocket connection fails**
   ```bash
   # Check worker deployment
   wrangler tail ownly-websocket
   ```

3. **Build fails**
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

### Debug Mode

Enable debug mode in development:
```env
VITE_DEBUG=true
```

This enables console logging for WebSocket messages and NDN operations.

## Performance Optimization

### Bundle Analysis
```bash
npm run build -- --mode=analyze
```

### CDN Optimization
Cloudflare automatically optimizes:
- Image compression
- Minification
- Brotli compression
- Global CDN caching

### Service Worker
The app includes a PWA service worker for offline functionality.

## Support

For deployment issues:
1. Check [Cloudflare Status](https://www.cloudflarestatus.com/)
2. Review worker logs with `wrangler tail`
3. Test locally with `npm run dev`

## Cost Estimation

### Cloudflare Pages (Free Tier)
- **Builds**: 500/month
- **Bandwidth**: Unlimited
- **Custom domains**: 1 per project

### Cloudflare Workers (Free Tier)
- **Requests**: 100,000/day
- **CPU time**: 10ms per request
- **Duration**: 30 seconds

For higher usage, consider paid plans starting at $5/month.