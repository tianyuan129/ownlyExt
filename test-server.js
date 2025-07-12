#!/usr/bin/env node

/**
 * Test WebSocket Server for Pull/Push E2E Testing
 * This server simulates the external JSON document sync functionality
 */

import { WebSocketServer } from 'ws';

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

// Mock document storage
const documents = new Map();

console.log(`🚀 Test WebSocket server running on ws://localhost:${PORT}`);
console.log('📋 Supported message types: pull, push, patch');

wss.on('connection', (ws) => {
  console.log('📱 Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`📨 Received: ${data.type} for "${data.name}"`);

      handleMessage(ws, data);
    } catch (err) {
      console.error('❌ Invalid JSON received:', message.toString());
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('📱 Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

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

  console.log(`📤 Sending document "${name}":`, JSON.stringify(doc, null, 2));

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

  // Echo back a confirmation (optional)
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

  // Simple patch application (for testing purposes)
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test server...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('📝 Ready to handle pull/push/patch operations');
console.log('🔄 Press Ctrl+C to stop the server');
