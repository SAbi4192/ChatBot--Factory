import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../backend/app.js';

const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;

describe('API integration (Checkpoint 10)', () => {
  let server;
  let token;
  let orgId;

  beforeAll(async () => {
    server = createServer(PORT);
    await new Promise((r) => setTimeout(r, 400));

    // Register a fresh user on the isolated test DB.
    const email = `it-${Date.now()}@test.local`;
    const reg = await request(BASE_URL).post('/api/auth/register').send({ email, password: 'password123' });
    token = reg.body.accessToken;
    orgId = reg.body.orgs?.[0]?.id;
  });

  afterAll(async () => {
    // Force-close lingering keep-alive connections from supertest, otherwise
    // server.close() never resolves and the hook times out (10s default).
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  });

  it('serves health', async () => {
    const res = await request(BASE_URL).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects unauthenticated bot access', async () => {
    const res = await request(BASE_URL).get('/api/bots');
    expect(res.status).toBe(401);
  });

  it('registers a user with a personal workspace', () => {
    expect(token).toBeTruthy();
    expect(orgId).toBeTruthy();
  });

  it('rejects weak passwords', async () => {
    const res = await request(BASE_URL).post('/api/auth/register').send({ email: `weak-${Date.now()}@test.local`, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing bots', async () => {
    const res = await request(BASE_URL)
      .get('/api/bots/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', orgId);
    expect(res.status).toBe(404);
  });

  it('generates and lists bots in the org', async () => {
    const gen = await request(BASE_URL)
      .post('/api/bots/generate')
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', orgId)
      .send({ count: 2 });
    expect(gen.status).toBe(200);
    expect(gen.body.count).toBe(2);

    const list = await request(BASE_URL)
      .get('/api/bots')
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', orgId);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
  });

  it('validates chat input', async () => {
    const res = await request(BASE_URL)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', orgId)
      .send({ botId: 'x' });
    expect(res.status).toBe(400);
  });
});
