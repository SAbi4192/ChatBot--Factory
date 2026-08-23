// Entry point — wires the app factory to the port and runs the first-run
// bootstrap (legacy bots -> admin account) before serving traffic.
import './loadEnv.js';

import { createApp } from './app.js';
import { bootstrapIfNeeded } from './services/auth.service.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

bootstrapIfNeeded()
  .catch((err) => console.error('[bootstrap] failed:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`\n🏭  Universal Chatbot Factory backend running on http://localhost:${PORT}`);
      console.log(`    AI mode: ${process.env.AI_PROVIDER || 'auto'}`);
    });
  });
