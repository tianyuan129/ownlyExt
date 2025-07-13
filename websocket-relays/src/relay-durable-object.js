/**
 * Durable Object for WebSocket Relay
 * Handles persistent state and cross-connection communication
 */
export class RelayDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // token -> Set of WebSocket connections
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesRelayed: 0,
      tokensEvicted: 0
    };
    this.TOKEN_LIMIT = 1000;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Handle stats request
    if (url.pathname === '/stats') {
      return new Response(JSON.stringify({
        server: 'WebSocket Relay #1 (Durable Objects)',
        ...this.stats,
        tokenLimit: this.TOKEN_LIMIT,
        activeTokens: this.sessions.size,
        tokensWithConnections: Array.from(this.sessions.keys()).map(token => ({
          token: token,
          connectionCount: this.sessions.get(token).size
        }))
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle WebSocket connections
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  handleSession(webSocket) {
    webSocket.accept();

    this.stats.totalConnections++;
    this.stats.activeConnections++;

    let clientToken = null;

    webSocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, token } = data;

        if (!token) {
          webSocket.send(JSON.stringify({
            type: 'error',
            server: 'relay-durable',
            message: 'Token is required for all messages'
          }));
          return;
        }

        // Handle registration
        if (type === 'register') {
          if (!clientToken) {
            const registered = this.registerClient(token, webSocket);
            if (!registered) {
              webSocket.send(JSON.stringify({
                type: 'error',
                server: 'relay-durable',
                message: 'Token already has maximum connections (2)'
              }));
              webSocket.close();
              return;
            }
            clientToken = token;
            webSocket.send(JSON.stringify({
              type: 'registered',
              server: 'relay-durable',
              message: 'Token registered successfully'
            }));
          }
          return;
        }

        // Require registration before other messages
        if (!clientToken) {
          webSocket.send(JSON.stringify({
            type: 'error',
            server: 'relay-durable',
            message: 'Must register token first with register message'
          }));
          return;
        }

        // Validate token matches
        if (clientToken !== token) {
          webSocket.send(JSON.stringify({
            type: 'error',
            server: 'relay-durable',
            message: 'Token mismatch - connection bound to different token'
          }));
          return;
        }

        // Relay message to other connections
        this.relayMessage(token, data, webSocket);
        this.stats.messagesRelayed++;

      } catch (err) {
        console.error('Error processing message:', err);
        webSocket.send(JSON.stringify({
          type: 'error',
          server: 'relay-durable',
          message: `Processing error: ${err.message}`
        }));
      }
    });

    webSocket.addEventListener('close', () => {
      this.stats.activeConnections--;
      if (clientToken) {
        this.unregisterClient(clientToken, webSocket);
      }
    });

    webSocket.addEventListener('error', () => {
      this.stats.activeConnections--;
      if (clientToken) {
        this.unregisterClient(clientToken, webSocket);
      }
    });
  }

  enforceTokenLimit() {
    if (this.sessions.size <= this.TOKEN_LIMIT) return;

    // Remove empty sessions first
    const emptyTokens = [];
    for (const [token, connections] of this.sessions.entries()) {
      if (connections.size === 0) {
        emptyTokens.push(token);
      }
    }

    for (const token of emptyTokens) {
      this.sessions.delete(token);
      this.stats.tokensEvicted++;
    }

    // Remove oldest tokens (LRU)
    if (this.sessions.size > this.TOKEN_LIMIT) {
      const tokensToRemove = this.sessions.size - this.TOKEN_LIMIT;
      const tokenEntries = Array.from(this.sessions.entries());

      for (let i = 0; i < tokensToRemove; i++) {
        const [token, connections] = tokenEntries[i];

        for (const ws of connections) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(1000, 'Token evicted due to limit');
            }
          } catch (err) {
            // Ignore close errors
          }
        }

        this.sessions.delete(token);
        this.stats.tokensEvicted++;
      }
    }
  }

  registerClient(token, webSocket) {
    if (!this.sessions.has(token)) {
      this.enforceTokenLimit();
      this.sessions.set(token, new Set());
    } else {
      // Move to end (mark as recently used)
      const connections = this.sessions.get(token);
      this.sessions.delete(token);
      this.sessions.set(token, connections);
    }

    const connections = this.sessions.get(token);

    if (connections.size >= 2) {
      return false;
    }

    connections.add(webSocket);
    return true;
  }

  unregisterClient(token, webSocket) {
    const connections = this.sessions.get(token);
    if (connections) {
      connections.delete(webSocket);
      if (connections.size === 0) {
        this.sessions.delete(token);
      }
    }
  }

  relayMessage(token, message, senderWebSocket) {
    const connections = this.sessions.get(token);
    if (!connections) return;

    for (const ws of connections) {
      if (ws === senderWebSocket) continue;

      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      } catch {
        connections.delete(ws);
      }
    }
  }
}
