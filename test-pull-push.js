#!/usr/bin/env node

/**
 * Test script for new pull/push functionality
 * This script demonstrates the new message types:
 * - pull: requests the full JSON document
 * - push: unconditionally replaces the document with new JSON
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3001'; // Adjust to your WebSocket server
const DOC_NAME = 'test-doc';

function connectAndTest() {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('Connected to WebSocket server');

    // Test sequence
    setTimeout(() => testPull(ws), 1000);
    setTimeout(() => testPush(ws), 3000);
    setTimeout(() => testPull(ws), 5000);
    setTimeout(() => ws.close(), 7000);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', JSON.stringify(message, null, 2));
    } catch (err) {
      console.log('Received non-JSON:', data.toString());
    }
  });

  ws.on('close', () => {
    console.log('Connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

function testPull(ws) {
  console.log('\n--- Testing PULL command ---');
  const pullMessage = {
    type: 'pull',
    name: DOC_NAME
  };
  ws.send(JSON.stringify(pullMessage));
  console.log('Sent pull request');
}

function testPush(ws) {
  console.log('\n--- Testing PUSH command ---');
  const newData = {
    message: 'Hello from external system!',
    timestamp: new Date().toISOString(),
    nested: {
      array: [1, 2, 3, 'four'],
      object: {
        key: 'value',
        number: 42
      }
    }
  };

  const pushMessage = {
    type: 'push',
    name: DOC_NAME,
    data: newData
  };
  ws.send(JSON.stringify(pushMessage));
  console.log('Sent push with data:', JSON.stringify(newData, null, 2));
}

console.log('Testing pull/push functionality...');
console.log('Make sure your WebSocket server is running and a document named "' + DOC_NAME + '" exists');
connectAndTest();
