/**
 * Load environment variables from the project-root .env BEFORE any other
 * module is evaluated. This file is imported first in server.js so that
 * llmService.js / domainGuard.js see GROQ_API_KEY, GEMINI_API_KEY, etc.
 * at module-load time (ES module imports are evaluated before the importing
 * module's body, so a late dotenv.config() would run too late).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
