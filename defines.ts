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
  'import.meta.env.VITE_WEBSOCKET_URL': JSON.stringify(process.env.VITE_WEBSOCKET_URL || 'wss://ownly-websocket-relay-1.tianyuan-3da.workers.dev'),
  'import.meta.env.VITE_WEBSOCKET_URL_PRIMARY': JSON.stringify(process.env.VITE_WEBSOCKET_URL_PRIMARY || 'wss://ownly-websocket-relay-1.tianyuan-3da.workers.dev'),
  'import.meta.env.VITE_WEBSOCKET_URL_SECONDARY': JSON.stringify(process.env.VITE_WEBSOCKET_URL_SECONDARY || 'wss://ownly-websocket-relay-2.tianyuan-3da.workers.dev'),
  'import.meta.env.VITE_WEBSOCKET_URL_BACKUP': JSON.stringify(process.env.VITE_WEBSOCKET_URL_BACKUP || 'wss://ownly-websocket-relay-3.tianyuan-3da.workers.dev'),
  'import.meta.env.VITE_DEBUG': JSON.stringify(process.env.VITE_DEBUG === 'true'),
};
