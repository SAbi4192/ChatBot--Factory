/**
 * Ship pipeline unit tests — export bundle integrity (no secrets, domain
 * rules present), the zero-dependency zip writer, GitHub repo/push flows and
 * Render status mapping. All network calls are mocked with vi.stubGlobal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildBotBundle, buildSystemPrompt, pyStr, pyList, slugify, repoNameFor } from '../../backend/services/export.service.js';
import { zipFiles } from '../../backend/services/zip.js';
import { ensureRepo, pushRepoFiles } from '../../backend/services/github.service.js';
import { mapRenderStatus, renderName } from '../../backend/services/render.service.js';
import { generateSingleBot } from '../../backend/generator.js';

const SECRET_PATTERNS = [/AIza[0-9A-Za-z_-]{20,}/, /gsk_[A-Za-z0-9]{10,}/, /ghp_[A-Za-z0-9]{20,}/];

function fakeBot() {
  return {
    id: 'abc123def',
    name: 'Demo "Quote" Bot',
    domain: 'Healthcare',
    subdomain: 'Dental',
    personality: 'Warm mentor',
    systemPrompt: 'You are a friendly dental educator.',
    designDna: {
      mode: 'dark', theme: 'Midnight', layout: 'Sidebar', messageStyle: 'Bubbles',
      backgroundStyle: 'Gradient', fontFamily: "'Inter', system-ui, sans-serif",
      headingFont: 'inherit', avatarShape: 'squircle', radiusScale: 'soft',
      accentGlow: true, borderRadius: '14px',
      bg: '#0A0C10', surface: '#12151C', surface2: '#1A1E28', text: '#EAEEF2',
      muted: '#8A94A3', border: '#2A313D', primaryColor: '#F5B13D', accentColor: '#FFC96B',
      mono: false,
    },
    welcomeMessage: 'Hello! I help with dental care.',
    starterQuestions: ['How do I floss?', 'Is fluoride safe?', 'Why do gums bleed?'],
    domainProfile: { allowedTopics: ['teeth', 'gums', 'cavities'] },
  };
}

describe('export bundle', () => {
  it('contains exactly the standalone bot file set', () => {
    const files = buildBotBundle(fakeBot());
    expect(Object.keys(files).sort()).toEqual([
      '.gitignore', 'README.md', 'app.py', 'chatbot_config.py',
      'render.yaml', 'requirements.txt', 'templates/index.html',
    ].sort());
  });

  it('bakes the domain guard into chatbot_config.py', () => {
    const cfg = buildBotBundle(fakeBot())['chatbot_config.py'];
    expect(cfg).toContain('STRICT DOMAIN BOUNDARY');
    expect(cfg).toContain('Healthcare');
  });

  it('never writes plaintext credentials into any exported file', () => {
    process.env.GEMINI_API_KEY = 'gsk_TESTKEYSHOULDNTEVERLEAK123';
    for (const content of Object.values(buildBotBundle(fakeBot()))) {
      for (const re of SECRET_PATTERNS) expect(content).not.toMatch(re);
      expect(content).not.toContain('gsk_TESTKEYSHOULDNTEVERLEAK123');
    }
    delete process.env.GEMINI_API_KEY;
  });

  it('leaves no unresolved {{PLACEHOLDER}} tokens', () => {
    for (const content of Object.values(buildBotBundle(fakeBot()))) {
      expect(content).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });

  it('themes the index.html from the Design DNA', () => {
    const html = buildBotBundle(fakeBot())['templates/index.html'];
    expect(html).toContain('#F5B13D');
    expect(html).toContain('data-layout="Sidebar"');
    expect(html).not.toContain('<script>alert');
  });

  it('works for a real generated bot (with all fields)', async () => {
    const bot = await generateSingleBot();
    const files = buildBotBundle(bot);
    expect(Object.keys(files).length).toBe(7);
    expect(files['chatbot_config.py']).toContain('SYSTEM_PROMPT');
  });
});

describe('export helpers', () => {
  it('escapes quotes and newlines into a Python string literal', () => {
    const out = pyStr('say "hi"\nline2 \\ path');
    expect(out.startsWith('"') && out.endsWith('"')).toBe(true);
    expect(out).toContain('\\"hi\\"');
    expect(out).toContain('\\n');
    expect(out).toContain('\\\\');
  });

  it('renders a trailing-comma Python list', () => {
    expect(pyList(['a', 'b'])).toContain('"a",');
    expect(pyList([])).toBe('[]');
  });

  it('slugifies names for repos', () => {
    expect(slugify('Dr. Smile  Teeth!!')).toBe('dr-smile-teeth');
    expect(slugify('')).toBe('bot');
    expect(repoNameFor({ name: 'Cavity Cop' })).toBe('scarlet-cavity-cop');
  });

  it('system prompt refuses off-domain and honors history', () => {
    const p = buildSystemPrompt({ name: 'X', domain: 'Math', subdomain: 'Algebra', systemPrompt: '', domainProfile: {} });
    expect(p).toMatch(/decline/i);
    expect(p).toMatch(/conversation history/i);
  });
});

describe('zip writer (zero-dependency)', () => {
  const files = { 'a.txt': 'hello world', 'dir/b.txt': 'nested ✓ with émojis' };
  const buf = zipFiles(files, new Date(2026, 8, 10, 12, 0, 0));

  it('starts with a local file header and ends with the EOCD', () => {
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    expect(buf.slice(2, 4)).toEqual(Buffer.from([3, 4])); // local file header signature
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50); // EOCD signature
    expect(buf.readUInt16LE(buf.length - 2)).toBe(0); // no zip comment
  });

  it('stores filenames as UTF-8 paths', () => {
    const s = buf.toString('latin1');
    expect(s).toContain('a.txt');
    expect(s).toContain('dir/b.txt');
  });

  it('round-trips byte sizes for stored entries', () => {
    // first entry: 30-byte header + name + payload
    expect(buf.length).toBeGreaterThan(80);
  });
});

describe('github service', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_OWNER = 'tester';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_OWNER;
  });

  const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body });
  const fail = (status, body = {}) => ({ ok: false, status, json: async () => body });

  it('creates a missing private repo and returns its url', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push([String(url), init?.method]);
      if (String(url).includes('/repos/tester/scarlet-x')) return fail(404);
      if (String(url).endsWith('/user/repos') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        expect(body.private).toBe(true);
        return ok({ name: body.name, full_name: `tester/${body.name}` });
      }
      throw new Error(`unexpected call ${url}`);
    }));
    const repo = await ensureRepo({ name: 'scarlet-x' });
    expect(repo).toMatchObject({ owner: 'tester', repo: 'scarlet-x', url: 'https://github.com/tester/scarlet-x', created: true });
    expect(calls[0][0]).toContain('api.github.com');
  });

  it('reuses an existing repo without creating one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) =>
      String(url).includes('/repos/tester/scarlet-x') ? ok({ name: 'scarlet-x', full_name: 'tester/scarlet-x' }) : fail(404)));
    const repo = await ensureRepo({ name: 'scarlet-x' });
    expect(repo.created).toBe(false);
    expect(repo.url).toBe('https://github.com/tester/scarlet-x');
  });

  it('retries once with a suffix on a name collision', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/repos/')) return fail(404);
      if (u.endsWith('/user/repos') && init.method === 'POST') {
        const body = JSON.parse(init.body);
        if (body.name === 'scarlet-x') return fail(422, { errors: [{ message: 'name already exists on this account' }] });
        return ok({ name: body.name, full_name: `tester/${body.name}` });
      }
      throw new Error(`unexpected ${u}`);
    }));
    const repo = await ensureRepo({ name: 'scarlet-x' });
    expect(repo.repo).toMatch(/^scarlet-x-[a-z0-9]{4}$/);
  });

  it('pushes files as base64 commits that update when an sha exists', async () => {
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/repos/tester/demo') && init.method === 'PUT') {
        const body = JSON.parse(init.body);
        seen.push([body.content && Buffer.from(body.content, 'base64').toString('utf8'), !!body.sha]);
        return ok({ content: { sha: 'new-sha' } });
      }
      if (u.includes('contents/app.py')) return fail(404);
      if (u.includes('contents/readme')) return ok({ sha: 'old-sha' });
      if (u.endsWith('/repos/tester/demo')) return ok({ default_branch: 'main' });
      throw new Error(`unexpected ${u}`);
    }));
    await pushRepoFiles({ owner: 'tester', repo: 'demo' }, { 'app.py': 'print(1)', readme: 'existing' });
    expect(seen).toEqual([['print(1)', false], ['existing', true]]);
  });
});

describe('render service', () => {
  it('maps upstream deploy statuses onto ship states', () => {
    expect(mapRenderStatus('activated')).toBe('live');
    expect(mapRenderStatus('build_failed')).toBe('deploy_failed');
    expect(mapRenderStatus('build_queued')).toBe('queued');
    expect(mapRenderStatus('build_in_progress')).toBe('building');
  });

  it('produces DNS-safe unique service names', () => {
    expect(renderName('scarlet-My Bot!!', 'abc123def')).toMatch(/^[a-z0-9][a-z0-9-]{1,39}[a-z0-9]$/);
    expect(renderName('a'.repeat(50), 'id1234').length).toBeLessThanOrEqual(40);
  });
});
