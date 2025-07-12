/**
 * WebSocket Relay #2 - Secondary Server  
 * Focused on high-throughput and batch operations
 */

// Enhanced storage with batch processing capabilities
const documents = new Map();
const batchQueue = new Map(); // document_name -> array of pending operations
// Token-based client connections: token -> WebSocket
const clientConnections = new Map();
// Document subscribers: docName -> Set of tokens
const documentSubscribers = new Map();
const processingStats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesProcessed: 0,
  batchesProcessed: 0,
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
        server: 'relay-2-secondary',
        uptime: Date.now() - processingStats.startTime,
        stats: processingStats,
        queuedBatches: batchQueue.size,
        documents: Array.from(documents.keys()),
        activeTokens: processingStats.tokensActive
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/batch-status') {
      return new Response(JSON.stringify({
        server: 'WebSocket Relay #2 (Secondary)',
        batchQueue: Object.fromEntries(
          Array.from(batchQueue.entries()).map(([name, ops]) => [name, ops.length])
        ),
        ...processingStats
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(`🟡 WebSocket Relay #2 (Secondary Server)
    
📊 Status: Active (High-Throughput)
🔗 Connections: ${processingStats.activeConnections}
📨 Messages: ${processingStats.messagesProcessed}
📦 Batches: ${processingStats.batchesProcessed}
⏳ Queued: ${batchQueue.size}
📄 Documents: ${documents.size}

Features: Batch processing, high-throughput operations
Health check: ${url.origin}/health
Batch status: ${url.origin}/batch-status`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

async function handleWebSocket(request) {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();
  
  processingStats.totalConnections++;
  processingStats.activeConnections++;
  
  console.log(`🟡 [Relay-2] Client connected (${processingStats.activeConnections} active)`);

  server.addEventListener('message', event => {
    try {
      processingStats.messagesProcessed++;
      
      const data = JSON.parse(event.data);
      console.log(`🟡 [Relay-2] Received: ${data.type} for "${data.name}" with token: ${data.token || 'none'}`);
      
      // Handle batch operations differently
      if (data.type === 'batch') {
        handleBatch(server, data);
      } else {
        handleMessage(server, data);
      }
    } catch (err) {
      console.error('❌ [Relay-2] Invalid JSON received:', event.data);
      server.send(JSON.stringify({
        type: 'error',
        server: 'relay-2',
        message: 'Invalid JSON format'
      }));
    }
  });

  server.addEventListener('close', () => {
    processingStats.activeConnections--;
    // Clean up token associations
    cleanupClientConnection(server);
    console.log(`🟡 [Relay-2] Client disconnected (${processingStats.activeConnections} active)`);
  });

  server.addEventListener('error', error => {
    processingStats.activeConnections--;
    cleanupClientConnection(server);
    console.error('❌ [Relay-2] WebSocket error:', error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function handleBatch(ws, data) {
  const { name, operations } = data;
  
  if (!name || !Array.isArray(operations)) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-2',
      message: 'Batch requires document name and operations array'
    }));
    return;
  }

  // Add to batch queue
  if (!batchQueue.has(name)) {
    batchQueue.set(name, []);
  }
  batchQueue.get(name).push(...operations);
  
  // Process batch immediately if queue is large enough or on demand
  if (batchQueue.get(name).length >= 5) {
    processBatch(ws, name);
  }
  
  ws.send(JSON.stringify({
    type: 'batch_queued',
    name: name,
    server: 'relay-2',
    queued: batchQueue.get(name).length,
    timestamp: new Date().toISOString()
  }));
}

function processBatch(ws, name) {
  const operations = batchQueue.get(name) || [];
  if (operations.length === 0) return;
  
  let doc = documents.get(name) || {};
  const version = doc._meta?.version || 0;
  
  console.log(`🟡 [Relay-2] Processing batch for "${name}" with ${operations.length} operations`);
  
  // Process all operations in batch
  operations.forEach(op => {
    if (op.type === 'patch' && Array.isArray(op.patches)) {
      op.patches.forEach(patch => {
        const { op: operation, path, value } = patch;
        const pathParts = path.slice(1).split('/');
        
        if (operation === 'replace' || operation === 'add') {
          setNestedValue(doc, pathParts, value);
        } else if (operation === 'remove') {
          removeNestedValue(doc, pathParts);
        }
      });
    } else if (op.type === 'set') {
      setNestedValue(doc, op.path.split('/').filter(p => p), op.value);
    }
  });
  
  // Update metadata
  doc._meta = {
    ...(doc._meta || {}),
    lastModified: new Date().toISOString(),
    server: 'relay-2',
    operation: 'batch',
    version: version + 1,
    batchSize: operations.length
  };
  
  documents.set(name, doc);
  batchQueue.delete(name);
  processingStats.batchesProcessed++;
  
  ws.send(JSON.stringify({
    type: 'batch_processed',
    name: name,
    server: 'relay-2',
    processed: operations.length,
    version: version + 1,
    timestamp: new Date().toISOString()
  }));
}

function handleMessage(ws, data) {
  const { type, name, token, data: payload } = data;

  if (!name) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-2',
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
    case 'process_batch':
      processBatch(ws, name);
      break;
    default:
      console.log(`⚠️ [Relay-2] Unknown message type: ${type}`);
      ws.send(JSON.stringify({
        type: 'error',
        server: 'relay-2',
        message: `Unknown message type: ${type}`
      }));
  }
}

function handlePull(ws, name, token) {
  const doc = documents.get(name) || { 
    _meta: { 
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      server: 'relay-2',
      version: 1
    }
  };
  
  console.log(`🟡 [Relay-2] Sending document "${name}" to token: ${token || 'anonymous'}`);
  
  ws.send(JSON.stringify({
    type: 'pull_response',
    name: name,
    token: token,
    data: doc,
    server: 'relay-2',
    queuedOperations: batchQueue.get(name)?.length || 0
  }));
}

function handlePush(ws, name, token, newData) {
  if (!newData) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-2',
      message: 'Push requires data payload'
    }));
    return;
  }

  const existingDoc = documents.get(name);
  const version = existingDoc?._meta?.version || 0;

  // Clear any pending batch operations for this document
  batchQueue.delete(name);

  documents.set(name, {
    ...newData,
    _meta: {
      created: existingDoc?._meta?.created || new Date().toISOString(),
      lastModified: new Date().toISOString(),
      server: 'relay-2',
      operation: 'push',
      version: version + 1
    }
  });
  
  console.log(`🟡 [Relay-2] Document "${name}" replaced via push (v${version + 1}) by token: ${token || 'anonymous'}`);
  
  // Broadcast to other subscribers
  broadcastToSubscribers(name, {
    type: 'push',
    name: name,
    token: token,
    data: newData,
    server: 'relay-2'
  }, token);
  
  ws.send(JSON.stringify({
    type: 'push_ack',
    name: name,
    token: token,
    server: 'relay-2',
    version: version + 1,
    timestamp: new Date().toISOString()
  }));
}

function handlePatch(ws, name, token, patches) {
  if (!Array.isArray(patches)) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-2',
      message: 'Patch requires array of operations'
    }));
    return;
  }

  // Add to batch queue for processing
  if (!batchQueue.has(name)) {
    batchQueue.set(name, []);
  }
  batchQueue.get(name).push({ type: 'patch', patches: patches, token: token });
  
  // Process immediately for single patch, or queue for batch
  if (batchQueue.get(name).length === 1) {
    setTimeout(() => processBatchWithToken(ws, name, token), 100); // Small delay for potential batching
  }
  
  ws.send(JSON.stringify({
    type: 'patch_queued',
    name: name,
    token: token,
    server: 'relay-2',
    queued: patches.length,
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
  
  processingStats.tokensActive = clientConnections.size;
  console.log(`🟡 [Relay-2] Registered token ${token} for document ${docName}`);
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
      
      processingStats.tokensActive = clientConnections.size;
      console.log(`🟡 [Relay-2] Cleaned up token ${token}`);
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
  
  console.log(`🟡 [Relay-2] Broadcasted ${message.type} for "${docName}" to ${broadcastCount} subscribers`);
}

function processBatchWithToken(ws, name, token) {
  const operations = batchQueue.get(name) || [];
  if (operations.length === 0) return;
  
  let doc = documents.get(name) || {};
  const version = doc._meta?.version || 0;
  
  console.log(`🟡 [Relay-2] Processing batch for "${name}" with ${operations.length} operations by token: ${token || 'anonymous'}`);
  
  // Process all operations in batch
  operations.forEach(op => {
    if (op.type === 'patch' && Array.isArray(op.patches)) {
      op.patches.forEach(patch => {
        const { op: operation, path, value } = patch;
        const pathParts = path.slice(1).split('/');
        
        if (operation === 'replace' || operation === 'add') {
          setNestedValue(doc, pathParts, value);
        } else if (operation === 'remove') {
          removeNestedValue(doc, pathParts);
        }
      });
    } else if (op.type === 'set') {
      setNestedValue(doc, op.path.split('/').filter(p => p), op.value);
    }
  });
  
  // Update metadata
  doc._meta = {
    ...(doc._meta || {}),
    lastModified: new Date().toISOString(),
    server: 'relay-2',
    operation: 'batch',
    version: version + 1,
    batchSize: operations.length
  };
  
  documents.set(name, doc);
  batchQueue.delete(name);
  processingStats.batchesProcessed++;
  
  // Broadcast to other subscribers
  broadcastToSubscribers(name, {
    type: 'batch_processed',
    name: name,
    token: token,
    processed: operations.length,
    server: 'relay-2'
  }, token);
  
  ws.send(JSON.stringify({
    type: 'batch_processed',
    name: name,
    token: token,
    server: 'relay-2',
    processed: operations.length,
    version: version + 1,
    timestamp: new Date().toISOString()
  }));
}