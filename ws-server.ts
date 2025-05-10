import { WebSocketServer } from 'ws';
import * as readline from 'readline';

const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server listening on ws://localhost:8080');

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    console.log('Received from client:', message.toString());
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Set up stdin input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

rl.prompt();

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (trimmed) {
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(trimmed);
      }
    });
  }
  rl.prompt();
});
