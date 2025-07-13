/**
 * WebSocket Relay #1 - Using Durable Objects
 * Relays messages between connections with the same token (max 2 per token)
 */

import { RelayDurableObject } from './relay-durable-object.js';

export { RelayDurableObject };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle WebSocket upgrade with Durable Object
    if (request.headers.get('Upgrade') === 'websocket') {
      // Get or create Durable Object instance
      const id = env.RELAY_DURABLE_OBJECT.idFromName('relay-instance');
      const durableObject = env.RELAY_DURABLE_OBJECT.get(id);
      return durableObject.fetch(request);
    }

    // API endpoints
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        server: 'relay-1-durable',
        architecture: 'Durable Objects',
        message: 'WebSocket relay using Durable Objects for cross-connection communication'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/stats') {
      // Get stats from Durable Object
      const id = env.RELAY_DURABLE_OBJECT.idFromName('relay-instance');
      const durableObject = env.RELAY_DURABLE_OBJECT.get(id);

      // Create a request to get stats from the Durable Object
      const statsRequest = new Request('https://relay/stats', { method: 'GET' });
      const statsResponse = await durableObject.fetch(statsRequest);

      if (statsResponse.ok) {
        return statsResponse;
      } else {
        return new Response(JSON.stringify({
          server: 'WebSocket Relay #1 (Durable Objects)',
          error: 'Unable to fetch stats from Durable Object'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(`🟢 WebSocket Relay #1 (Durable Objects)

📊 Status: Active
🏗️ Architecture: Durable Objects
🔗 Cross-connection communication: Enabled

Connect via WebSocket to relay messages between connections.
Health check: ${url.origin}/health
Statistics: ${url.origin}/stats`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
