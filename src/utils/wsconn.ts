export async function wsConn(url: string, onMessage: (data: any) => void): Promise<WebSocket> {
    try {
      const socket = await connectToSingleEndpoint(url, onMessage);
      console.log(`✅ Connected to relay: ${url}`);
      return socket;
    } catch (error) {
      console.warn(`❌ Failed to connect to ${url}:`, error);
    }

  throw new Error('Relay unavailable');
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
