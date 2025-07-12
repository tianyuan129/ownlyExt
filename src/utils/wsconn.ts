export async function wsConn(url: string, onMessage: (data: any) => void): Promise<WebSocket> {
  // Get all available relay endpoints
  const relayEndpoints = [
    import.meta.env.VITE_WEBSOCKET_URL_PRIMARY,
    import.meta.env.VITE_WEBSOCKET_URL_SECONDARY,
    import.meta.env.VITE_WEBSOCKET_URL_BACKUP,
    url // Use provided URL as fallback
  ].filter(Boolean);

  console.log(`🔗 Available relay endpoints: ${relayEndpoints.length}`);

  // Try each endpoint until one connects
  for (let i = 0; i < relayEndpoints.length; i++) {
    const endpoint = relayEndpoints[i];
    try {
      console.log(`🔄 Attempting connection ${i + 1}/${relayEndpoints.length}: ${endpoint}`);
      const socket = await connectToSingleEndpoint(endpoint, onMessage);
      console.log(`✅ Connected to relay: ${endpoint}`);
      return socket;
    } catch (error) {
      console.warn(`❌ Failed to connect to ${endpoint}:`, error);
      if (i === relayEndpoints.length - 1) {
        throw new Error(`Failed to connect to any relay endpoint. Last error: ${error}`);
      }
    }
  }

  throw new Error('No relay endpoints available');
}

function connectToSingleEndpoint(url: string, onMessage: (data: any) => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let connected = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        socket.close();
        reject(new Error(`Connection timeout for ${url}`));
      }
    }, 5000); // 5 second timeout

    socket.onopen = () => {
      connected = true;
      clearTimeout(timeout);
      console.log(`WebSocket connected to ${url}`);
      resolve(socket);
    };

    socket.onerror = (event: Event) => {
      connected = true; // Prevent timeout from firing
      clearTimeout(timeout);
      console.error(`WebSocket error for ${url}:`, event);
      reject(event);
    };

    socket.onmessage = (event: MessageEvent) => {
      onMessage(event.data);
    };

    socket.onclose = (event: CloseEvent) => {
      console.log(`WebSocket closed for ${url}:`, event.code, event.reason);
    };
  });
}
