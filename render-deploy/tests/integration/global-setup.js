import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, '..', '..', 'data', 'test_integration.db');

export default async function setup() {
  // Fresh test database for every run.
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
  }
  // Apply the schema to the test DB before tests import the Prisma client.
  execSync('node node_modules/prisma/build/index.js migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: `file:../data/test_integration.db` },
  });
}
