/**
 * WebSocket Relay #3 - Backup Server
 * Focus on reliability, failover, and data persistence
 */

// Enhanced storage with backup and recovery features
const documents = new Map();
const backupLog = []; // Keep history for recovery
// Token-based client connections: token -> WebSocket
const clientConnections = new Map();
// Document subscribers: docName -> Set of tokens
const documentSubscribers = new Map();
const reliabilityStats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesProcessed: 0,
  backupsCreated: 0,
  recoveryOperations: 0,
  tokensActive: 0,
  startTime: Date.now(),
  lastBackup: null
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
        server: 'relay-3-backup',
        uptime: Date.now() - reliabilityStats.startTime,
        stats: reliabilityStats,
        backupHistory: backupLog.length,
        documents: Array.from(documents.keys()),
        lastBackup: reliabilityStats.lastBackup,
        activeTokens: reliabilityStats.tokensActive
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/backup') {
      return new Response(JSON.stringify({
        server: 'WebSocket Relay #3 (Backup)',
        documents: Object.fromEntries(documents),
        backupLog: backupLog.slice(-10), // Last 10 backup operations
        ...reliabilityStats
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/restore') {
      // Simple restore endpoint (in production, this would be secured)
      return new Response(JSON.stringify({
        message: 'Restore endpoint available',
        availableBackups: backupLog.length,
        instruction: 'Send POST request with backup data'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(`🔴 WebSocket Relay #3 (Backup Server)
    
📊 Status: Standby/Active
🔗 Connections: ${reliabilityStats.activeConnections}
📨 Messages: ${reliabilityStats.messagesProcessed}
💾 Backups: ${reliabilityStats.backupsCreated}
🔄 Recovery: ${reliabilityStats.recoveryOperations}
📄 Documents: ${documents.size}
⏰ Last Backup: ${reliabilityStats.lastBackup || 'Never'}

Features: Data persistence, failover recovery, backup/restore
Health check: ${url.origin}/health
Backup status: ${url.origin}/backup
Restore: ${url.origin}/restore`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

async function handleWebSocket(request) {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();
  
  reliabilityStats.totalConnections++;
  reliabilityStats.activeConnections++;
  
  console.log(`🔴 [Relay-3] Client connected (${reliabilityStats.activeConnections} active)`);

  server.addEventListener('message', event => {
    try {
      reliabilityStats.messagesProcessed++;
      
      const data = JSON.parse(event.data);
      console.log(`🔴 [Relay-3] Received: ${data.type} for "${data.name}" with token: ${data.token || 'none'}`);
      
      // Handle backup/restore operations
      if (data.type === 'backup') {
        handleBackup(server, data);
      } else if (data.type === 'restore') {
        handleRestore(server, data);
      } else {
        handleMessage(server, data);
      }
      
      // Auto-backup on write operations
      if (['push', 'patch'].includes(data.type)) {
        createBackup(data.name);
      }
    } catch (err) {
      console.error('❌ [Relay-3] Invalid JSON received:', event.data);
      server.send(JSON.stringify({
        type: 'error',
        server: 'relay-3',
        message: 'Invalid JSON format'
      }));
    }
  });

  server.addEventListener('close', () => {
    reliabilityStats.activeConnections--;
    // Clean up token associations
    cleanupClientConnection(server);
    console.log(`🔴 [Relay-3] Client disconnected (${reliabilityStats.activeConnections} active)`);
  });

  server.addEventListener('error', error => {
    reliabilityStats.activeConnections--;
    cleanupClientConnection(server);
    console.error('❌ [Relay-3] WebSocket error:', error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function createBackup(documentName) {
  const doc = documents.get(documentName);
  if (!doc) return;
  
  const backup = {
    timestamp: new Date().toISOString(),
    documentName: documentName,
    data: JSON.parse(JSON.stringify(doc)), // Deep copy
    operation: 'auto-backup',
    id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
  
  backupLog.push(backup);
  reliabilityStats.backupsCreated++;
  reliabilityStats.lastBackup = backup.timestamp;
  
  // Keep only last 100 backups
  if (backupLog.length > 100) {
    backupLog.shift();
  }
  
  console.log(`🔴 [Relay-3] Created backup for "${documentName}" (${backup.id})`);
}

function handleBackup(ws, data) {
  const { name } = data;
  
  if (name) {
    createBackup(name);
    ws.send(JSON.stringify({
      type: 'backup_created',
      name: name,
      server: 'relay-3',
      backupId: backupLog[backupLog.length - 1]?.id,
      timestamp: new Date().toISOString()
    }));
  } else {
    // Backup all documents
    let backupCount = 0;
    for (const [docName] of documents) {
      createBackup(docName);
      backupCount++;
    }
    
    ws.send(JSON.stringify({
      type: 'backup_all_created',
      server: 'relay-3',
      documentsBackedUp: backupCount,
      timestamp: new Date().toISOString()
    }));
  }
}

function handleRestore(ws, data) {
  const { name, backupId, restoreData } = data;
  
  if (restoreData) {
    // Direct restore from provided data
    documents.set(name, {
      ...restoreData,
      _meta: {
        ...restoreData._meta,
        restored: new Date().toISOString(),
        server: 'relay-3',
        operation: 'restore'
      }
    });
    
    reliabilityStats.recoveryOperations++;
    console.log(`🔴 [Relay-3] Document "${name}" restored from provided data`);
    
    ws.send(JSON.stringify({
      type: 'restore_complete',
      name: name,
      server: 'relay-3',
      method: 'direct',
      timestamp: new Date().toISOString()
    }));
  } else if (backupId) {
    // Restore from backup log
    const backup = backupLog.find(b => b.id === backupId);
    if (backup) {
      documents.set(backup.documentName, {
        ...backup.data,
        _meta: {
          ...backup.data._meta,
          restored: new Date().toISOString(),
          server: 'relay-3',
          operation: 'restore',
          fromBackup: backupId
        }
      });
      
      reliabilityStats.recoveryOperations++;
      console.log(`🔴 [Relay-3] Document "${backup.documentName}" restored from backup ${backupId}`);
      
      ws.send(JSON.stringify({
        type: 'restore_complete',
        name: backup.documentName,
        server: 'relay-3',
        method: 'backup',
        backupId: backupId,
        timestamp: new Date().toISOString()
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        server: 'relay-3',
        message: `Backup ${backupId} not found`
      }));
    }
  }
}

function handleMessage(ws, data) {
  const { type, name, token, data: payload } = data;

  if (!name) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-3',
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
      console.log(`⚠️ [Relay-3] Unknown message type: ${type}`);
      ws.send(JSON.stringify({
        type: 'error',
        server: 'relay-3',
        message: `Unknown message type: ${type}`
      }));
  }
}

function handlePull(ws, name, token) {
  const doc = documents.get(name) || { 
    _meta: { 
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      server: 'relay-3',
      version: 1
    }
  };
  
  console.log(`🔴 [Relay-3] Sending document "${name}" to token: ${token || 'anonymous'}`);
  
  ws.send(JSON.stringify({
    type: 'pull_response',
    name: name,
    token: token,
    data: doc,
    server: 'relay-3',
    hasBackup: backupLog.some(b => b.documentName === name)
  }));
}

function handlePush(ws, name, token, newData) {
  if (!newData) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-3',
      message: 'Push requires data payload'
    }));
    return;
  }

  const existingDoc = documents.get(name);
  const version = existingDoc?._meta?.version || 0;

  documents.set(name, {
    ...newData,
    _meta: {
      created: existingDoc?._meta?.created || new Date().toISOString(),
      lastModified: new Date().toISOString(),
      server: 'relay-3',
      operation: 'push',
      version: version + 1,
      reliability: 'high'
    }
  });
  
  console.log(`🔴 [Relay-3] Document "${name}" replaced via push (v${version + 1}) by token: ${token || 'anonymous'}`);
  
  // Broadcast to other subscribers
  broadcastToSubscribers(name, {
    type: 'push',
    name: name,
    token: token,
    data: newData,
    server: 'relay-3'
  }, token);
  
  ws.send(JSON.stringify({
    type: 'push_ack',
    name: name,
    token: token,
    server: 'relay-3',
    version: version + 1,
    backupCreated: true,
    timestamp: new Date().toISOString()
  }));
}

function handlePatch(ws, name, token, patches) {
  if (!Array.isArray(patches)) {
    ws.send(JSON.stringify({
      type: 'error',
      server: 'relay-3',
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
    server: 'relay-3',
    operation: 'patch',
    version: version + 1,
    patchCount: patches.length,
    reliability: 'high'
  };

  documents.set(name, doc);
  console.log(`🔴 [Relay-3] Document "${name}" patched with ${patches.length} operations (v${version + 1}) by token: ${token || 'anonymous'}`);
  
  // Broadcast to other subscribers
  broadcastToSubscribers(name, {
    type: 'patch',
    name: name,
    token: token,
    data: patches,
    server: 'relay-3'
  }, token);
  
  ws.send(JSON.stringify({
    type: 'patch_ack',
    name: name,
    token: token,
    server: 'relay-3',
    applied: patches.length,
    version: version + 1,
    backupCreated: true,
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
  
  reliabilityStats.tokensActive = clientConnections.size;
  console.log(`🔴 [Relay-3] Registered token ${token} for document ${docName}`);
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
      
      reliabilityStats.tokensActive = clientConnections.size;
      console.log(`🔴 [Relay-3] Cleaned up token ${token}`);
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
  
  console.log(`🔴 [Relay-3] Broadcasted ${message.type} for "${docName}" to ${broadcastCount} subscribers`);
}