// This file defines all the compile-time constants that are used in the project.

// YYYYMMDDHHMM
const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  calendar: 'gregory',
});

export default {
  __BUILD_VERSION__: JSON.stringify(dateFmt.format(new Date()).replace(/\D/g, '')),

  // Environment variables for different deployment environments
  'import.meta.env.VITE_WEBSOCKET_URL': JSON.stringify(process.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001'),
  'import.meta.env.VITE_WEBSOCKET_URL_PRIMARY': JSON.stringify(process.env.VITE_WEBSOCKET_URL_PRIMARY || 'ws://localhost:3001'),
  'import.meta.env.VITE_WEBSOCKET_URL_SECONDARY': JSON.stringify(process.env.VITE_WEBSOCKET_URL_SECONDARY || 'ws://localhost:3002'),
  'import.meta.env.VITE_WEBSOCKET_URL_BACKUP': JSON.stringify(process.env.VITE_WEBSOCKET_URL_BACKUP || 'ws://localhost:3003'),
  'import.meta.env.VITE_DEBUG': JSON.stringify(process.env.VITE_DEBUG === 'true'),
};
