/**
 * WebSocket Relay #1 - Primary Server
 * Enhanced with analytics and logging
 */

// In-memory document storage with enhanced metadata
const documents = new Map();
// Token-based client connections: token -> WebSocket
const clientConnections = new Map();
// Document subscribers: docName -> Set of tokens
const documentSubscribers = new Map();
const connectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesProcessed: 0,
  tokensActive: 0,
  startTime: Date.now()
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request);
    }

    // API endpoints
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        server: 'relay-1-primary',
        uptime: Date.now() - connectionStats.startTime,
        stats: connectionStats,
        documents: Array.from(documents.keys()),
        activeTokens: connectionStats.tokensActive
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/stats') {
      return new Response(JSON.stringify({
        server: 'WebSocket Relay #1 (Primary)',
        ...connectionStats,
        documentsCount: documents.size,
        averageMessageSize: connectionStats.messagesProcessed > 0 ?
          Math.round(connectionStats.totalBytes / connectionStats.messagesProcessed) : 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(`🟢 WebSocket Relay #1 (Primary Server)

📊 Status: Active
🔗 Connections: ${connectionStats.activeConnections}
📨 Messages: ${connectionStats.messagesProcessed}
📄 Documents: ${documents.size}

Connect via WebSocket to sync documents.
Health check: ${url.origin}/health
Statistics: ${url.origin}/stats`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

async function handleWebSocket(request) {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  connectionStats.totalConnections++;
  connectionStats.activeConnections++;

  console.log(`🟢 [Relay-1] Client connected (${connectionStats.activeConnections} active)`);

  server.addEventListener('message', event => {
    try {
      connectionStats.messagesProcessed++;
      connectionStats.totalBytes = (connectionStats.totalBytes || 0) + event.data.length;

      const data = JSON.parse(event.data);
      console.log(`🟢 [Relay-1] Received: ${data.type} for "${data.name}" with token: ${data.token || 'none'}`);

      handleMessage(server, data);
    } catch (err) {
      console.error('❌ [Relay-1] Invalid JSON received:', event.data);
      server.send(JSON.stringify({
        type: 'error',
        server: 'relay-1',
        message: 'Invalid JSON format'
      }));
    }
  });

  server.addEventListener('close', () => {
    connectionStats.activeConnections--;
    // Clean up token associations
    cleanupClientConnection(server);
    console.log(`🟢 [Relay-1] Client disconnected (${connectionStats.activeConnections} active)`);
  });

  server.addEventListener('error', error => {
    connectionStats.activeConnections--;
    cleanupClientConnection(server);
    console.error('❌ [Relay-1] WebSocket error:', error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function handleMessage(ws, data) {
  const { type, name, token, data: payload } = data;

  if (!name) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-1',
      message: 'Document name is required'
    }));
    return;
  }

  // Register token if provided
  if (token && type !== 'error') {
    registerClient(token, ws, name);
  }

  switch (type) {
    case 'pull':
      handlePull(ws, name, token);
      break;
    case 'push':
      handlePush(ws, name, token, payload);
      break;
    case 'patch':
      handlePatch(ws, name, token, payload);
      break;
    default:
      console.log(`⚠️ [Relay-1] Unknown message type: ${type}`);
      ws.send(JSON.stringify({
        type: 'error',
        server: 'relay-1',
        message: `Unknown message type: ${type}`
      }));
  }
}

function handlePull(ws, name, token) {
  const doc = documents.get(name) || {
    _meta: {
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      server: 'relay-1',
      version: 1
    }
  };

  console.log(`🟢 [Relay-1] Sending document "${name}" to token: ${token || 'anonymous'}`);

  ws.send(JSON.stringify({
    type: 'pull_response',
    name: name,
    token: token,
    data: doc,
    server: 'relay-1'
  }));
}

function handlePush(ws, name, token, newData) {
  if (!newData) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-1',
      message: 'Push requires data payload'
    }));
    return;
  }

  const existingDoc = documents.get(name);
  const version = existingDoc?._meta?.version || 0;

  // Store the new document
  documents.set(name, {
    ...newData,
    _meta: {
      created: existingDoc?._meta?.created || new Date().toISOString(),
      lastModified: new Date().toISOString(),
      server: 'relay-1',
      operation: 'push',
      version: version + 1
    }
  });

  console.log(`🟢 [Relay-1] Document "${name}" replaced via push (v${version + 1}) by token: ${token || 'anonymous'}`);

  // Broadcast to other subscribers
  broadcastToSubscribers(name, {
    type: 'push',
    name: name,
    token: token,
    data: newData,
    server: 'relay-1'
  }, token);

  ws.send(JSON.stringify({
    type: 'push_ack',
    name: name,
    token: token,
    server: 'relay-1',
    version: version + 1,
    timestamp: new Date().toISOString()
  }));
}

function handlePatch(ws, name, token, patches) {
  if (!Array.isArray(patches)) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-1',
      message: 'Patch requires array of operations'
    }));
    return;
  }

  let doc = documents.get(name) || {};
  const version = doc._meta?.version || 0;

  // Apply patches
  patches.forEach(patch => {
    const { op, path, value } = patch;
    const pathParts = path.slice(1).split('/');

    if (op === 'replace' || op === 'add') {
      setNestedValue(doc, pathParts, value);
    } else if (op === 'remove') {
      removeNestedValue(doc, pathParts);
    }
  });

  // Update metadata
  doc._meta = {
    ...(doc._meta || {}),
    lastModified: new Date().toISOString(),
    server: 'relay-1',
    operation: 'patch',
    version: version + 1,
    patchCount: patches.length
  };

  documents.set(name, doc);
  console.log(`🟢 [Relay-1] Document "${name}" patched with ${patches.length} operations (v${version + 1}) by token: ${token || 'anonymous'}`);

  // Broadcast to other subscribers
  broadcastToSubscribers(name, {
    type: 'patch',
    name: name,
    token: token,
    data: patches,
    server: 'relay-1'
  }, token);

  ws.send(JSON.stringify({
    type: 'patch_ack',
    name: name,
    token: token,
    server: 'relay-1',
    applied: patches.length,
    version: version + 1,
    timestamp: new Date().toISOString()
  }));
}

function setNestedValue(obj, pathParts, value) {
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }
  current[pathParts[pathParts.length - 1]] = value;
}

function removeNestedValue(obj, pathParts) {
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!(part in current)) {
      return;
    }
    current = current[part];
  }
  delete current[pathParts[pathParts.length - 1]];
}

// Token management functions
function registerClient(token, ws, docName) {
  if (!token) return;
  
  // Register the client connection
  clientConnections.set(token, ws);
  
  // Add to document subscribers
  if (!documentSubscribers.has(docName)) {
    documentSubscribers.set(docName, new Set());
  }
  documentSubscribers.get(docName).add(token);
  
  connectionStats.tokensActive = clientConnections.size;
  console.log(`🟢 [Relay-1] Registered token ${token} for document ${docName}`);
}

function cleanupClientConnection(ws) {
  // Find and remove token associated with this WebSocket
  for (const [token, socket] of clientConnections.entries()) {
    if (socket === ws) {
      clientConnections.delete(token);
      
      // Remove from document subscribers
      for (const [docName, tokens] of documentSubscribers.entries()) {
        tokens.delete(token);
        if (tokens.size === 0) {
          documentSubscribers.delete(docName);
        }
      }
      
      connectionStats.tokensActive = clientConnections.size;
      console.log(`🟢 [Relay-1] Cleaned up token ${token}`);
      break;
    }
  }
}

function broadcastToSubscribers(docName, message, excludeToken) {
  const subscribers = documentSubscribers.get(docName);
  if (!subscribers) return;
  
  let broadcastCount = 0;
  for (const token of subscribers) {
    if (token === excludeToken) continue; // Don't echo back to sender
    
    const ws = clientConnections.get(token);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        relayedTo: token
      }));
      broadcastCount++;
    }
  }
  
  console.log(`🟢 [Relay-1] Broadcasted ${message.type} for "${docName}" to ${broadcastCount} subscribers`);
}
