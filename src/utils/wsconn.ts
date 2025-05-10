export async function wsConn(url: string, onMessage: (data: any) => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => {
      console.log('WebSocket connected');
      resolve(socket);
    };

    socket.onerror = (event: Event) => {
      console.error('WebSocket error:', event);
      reject(event);
    };

    socket.onmessage = (event: MessageEvent) => {
      onMessage(event.data);
    };
  });
}
