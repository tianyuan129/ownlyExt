# WebSocket Relays

Consolidated WebSocket relay servers for Ownly JSON documents. This directory contains shared source code with separate deployment configurations for three relay servers.

## Structure

```
websocket-relays/
├── src/                          # Shared source code
│   ├── websocket-handler.js      # Main worker entry point
│   └── relay-durable-object.js   # Durable Object implementation
├── deployments/                  # Deployment configurations
│   ├── wrangler-relay-1.toml     # Relay 1 config
│   ├── wrangler-relay-2.toml     # Relay 2 config
│   └── wrangler-relay-3.toml     # Relay 3 config
├── package.json                  # Scripts and metadata
└── README.md                     # This file
```

## Deployment

### Deploy All Relays
```bash
npm run deploy:all
```

### Deploy Individual Relays
```bash
npm run deploy:relay1    # Deploy relay 1
npm run deploy:relay2    # Deploy relay 2
npm run deploy:relay3    # Deploy relay 3
```

## Local Development

### Run Individual Relays Locally
```bash
npm run dev:relay1       # Run relay 1 locally
npm run dev:relay2       # Run relay 2 locally
npm run dev:relay3       # Run relay 3 locally
```

## Monitoring

### Check Stats
```bash
npm run stats:relay1     # Get relay 1 stats
npm run stats:relay2     # Get relay 2 stats
npm run stats:relay3     # Get relay 3 stats
npm run health:all       # Check all relays
```

## Deployed URLs

- **Relay 1 (Primary)**: `wss://ownly-websocket-relay-1.tianyuan-3da.workers.dev`
- **Relay 2 (Secondary)**: `wss://ownly-websocket-relay-2.tianyuan-3da.workers.dev`
- **Relay 3 (Backup)**: `wss://ownly-websocket-relay-3.tianyuan-3da.workers.dev`

## Features

- **Token-based Authentication**: Each connection requires a valid profile token
- **Connection Limits**: Maximum 2 connections per token
- **Message Relaying**: Pure relay system with no document storage
- **LRU Token Management**: Automatic cleanup with 1000 token limit
- **Durable Objects**: Stateful WebSocket handling with Cloudflare Workers
- **Health Monitoring**: `/stats` and `/health` endpoints

## Configuration

Each relay has its own `wrangler.toml` file in the `deployments/` directory:

- **relay-1**: Primary server for production use
- **relay-2**: Secondary server for load balancing
- **relay-3**: Backup server for reliability

All relays share the same source code but have different:
- Worker names
- Environment configurations
- Deployment targets

## Making Changes

1. **Edit source code** in `src/` directory
2. **Test locally** with `npm run dev:relay1`
3. **Deploy changes** with `npm run deploy:all`

All three relays will use the updated code automatically since they share the same source files.