import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../backend/app.js';

const PORT = 3998;
const BASE_URL = `http://localhost:${PORT}`;

describe('Ship pipeline routes (Export -> GitHub -> Render)', () => {
  let server;
  let token;
  let orgId;
  let botId;

  beforeAll(async () => {
    server = createServer(PORT);
    await new Promise((r) => setTimeout(r, 400));
    process.env.GITHUB_TOKEN = '';
    process.env.RENDER_API_KEY = '';

    const email = `ship-${Date.now()}@test.local`;
    const reg = await request(BASE_URL).post('/api/auth/register').send({ email, password: 'password123' });
    token = reg.body.accessToken;
    orgId = reg.body.orgs?.[0]?.id;
    const gen = await request(BASE_URL).post('/api/bots/generate').set('Authorization', `Bearer ${token}`).set('x-org-id', orgId).send({ count: 1 });
    botId = gen.body.sample?.id;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`).set('x-org-id', orgId);

  it('rejects unauthenticated ZIP export', async () => {
    const res = await request(BASE_URL).get(`/api/bots/export/${botId}/zip`);
    expect(res.status).toBe(401);
  });

  it('streams a standalone bot ZIP bundle', async () => {
    const res = await auth(request(BASE_URL).get(`/api/bots/export/${botId}/zip`).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="scarlet-/);
    expect(res.body.length).toBeGreaterThan(200);
    expect(res.body.slice(0, 2).toString('latin1')).toBe('PK');
  });

  it('ship github without token -> friendly 503 naming GITHUB_TOKEN', async () => {
    const res = await auth(request(BASE_URL).post(`/api/bots/ship/github/${botId}`));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GITHUB_TOKEN/);
    expect(JSON.stringify(res.body)).not.toMatch(/at |Error:|stack/i);
  });

  it('ship render before github -> actionable 400', async () => {
    const res = await auth(request(BASE_URL).post(`/api/bots/ship/render/${botId}`));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/GitHub first/i);
  });

  it('ship status without deploy -> null-safe response', async () => {
    const res = await auth(request(BASE_URL).get(`/api/bots/ship/status/${botId}`));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deployStatus: null });
  });

  it('sleep without deploy -> actionable 400', async () => {
    const res = await auth(request(BASE_URL).post(`/api/bots/ship/sleep/${botId}`));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no Render deployment/i);
  });

  it('reset clears ship bookkeeping', async () => {
    const res = await auth(request(BASE_URL).delete(`/api/bots/ship/${botId}`));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
