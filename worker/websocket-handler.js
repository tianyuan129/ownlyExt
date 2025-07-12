/**
 * Cloudflare Worker for WebSocket External JSON Document Sync
 * 
 * This worker handles the WebSocket server functionality for external JSON document sync.
 * It supports pull, push, and patch operations for real-time document synchronization.
 */

// In-memory document storage (for demo - use Durable Objects or external DB for production)
const documents = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request);
    }
    
    // Handle HTTP requests (health check, etc.)
    if (url.pathname === '/health') {
      return new Response('WebSocket server is running', { status: 200 });
    }
    
    return new Response('WebSocket External JSON Sync Server\n\nConnect via WebSocket to sync documents.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

async function handleWebSocket(request) {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();
  
  console.log('📱 Client connected');

  server.addEventListener('message', event => {
    try {
      const data = JSON.parse(event.data);
      console.log(`📨 Received: ${data.type} for "${data.name}"`);
      
      handleMessage(server, data);
    } catch (err) {
      console.error('❌ Invalid JSON received:', event.data);
      server.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON format'
      }));
    }
  });

  server.addEventListener('close', () => {
    console.log('📱 Client disconnected');
  });

  server.addEventListener('error', error => {
    console.error('❌ WebSocket error:', error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function handleMessage(ws, data) {
  const { type, name, data: payload } = data;

  if (!name) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Document name is required'
    }));
    return;
  }

  switch (type) {
    case 'pull':
      handlePull(ws, name);
      break;
    case 'push':
      handlePush(ws, name, payload);
      break;
    case 'patch':
      handlePatch(ws, name, payload);
      break;
    default:
      console.log(`⚠️  Unknown message type: ${type}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${type}`
      }));
  }
}

function handlePull(ws, name) {
  const doc = documents.get(name) || { 
    _meta: { 
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }
  };
  
  console.log(`📤 Sending document "${name}"`);
  
  ws.send(JSON.stringify({
    type: 'pull_response',
    name: name,
    data: doc
  }));
}

function handlePush(ws, name, newData) {
  if (!newData) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Push requires data payload'
    }));
    return;
  }

  // Store the new document
  documents.set(name, {
    ...newData,
    _meta: {
      lastModified: new Date().toISOString(),
      operation: 'push'
    }
  });
  
  console.log(`💾 Document "${name}" replaced via push`);
  
  // Echo back a confirmation
  ws.send(JSON.stringify({
    type: 'push_ack',
    name: name,
    timestamp: new Date().toISOString()
  }));
}

function handlePatch(ws, name, patches) {
  if (!Array.isArray(patches)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Patch requires array of operations'
    }));
    return;
  }

  let doc = documents.get(name) || {};
  
  // Simple patch application
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
    operation: 'patch'
  };

  documents.set(name, doc);
  console.log(`🔧 Document "${name}" patched with ${patches.length} operations`);
  
  // Echo back a confirmation
  ws.send(JSON.stringify({
    type: 'patch_ack',
    name: name,
    applied: patches.length,
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
      return; // Path doesn't exist
    }
    current = current[part];
  }
  delete current[pathParts[pathParts.length - 1]];
}