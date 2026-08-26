// Entry point — wires the app factory to the port and runs the first-run
// bootstrap (legacy bots -> admin account) before serving traffic.
import './loadEnv.js';

import { createApp } from './app.js';
import { bootstrapIfNeeded } from './services/auth.service.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

let server = null;

// Prevent crashes from unhandled errors — log and keep the server running.
process.on('uncaughtException', (err) => {
  console.error(`[FATAL] Uncaught Exception: ${err.message}`);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[FATAL] Unhandled Rejection:`, reason);
});

// Graceful shutdown.
function shutdown(signal) {
  console.log(`\n[Scarlet] ${signal} received — shutting down gracefully…`);
  if (server) {
    server.close(() => {
      console.log('[Scarlet] Server closed.');
      process.exit(0);
    });
    // Safety net: force-exit if connections refuse to drain.
    setTimeout(() => {
      console.error('[Scarlet] Force exit after timeout.');
      process.exit(1);
    }, 8000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrapIfNeeded()
  .catch((err) => console.error('[bootstrap] failed:', err.message))
  .finally(() => {
    server = app.listen(PORT, () => {
      console.log(`\n🏭  Universal Chatbot Factory backend running on http://localhost:${PORT}`);
      console.log(`    AI mode: ${process.env.AI_PROVIDER || 'auto'}`);
    });
  });
