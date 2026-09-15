<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{BOT_NAME_HTML}}</title>
{{FONT_LINK}}
<style>
  :root {
    {{THEME_VARS}}
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    --maxw: 760px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ---------- ambient background layers ---------- */
  .bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
  body[data-bg="Gradient"] .bg { background:
      radial-gradient(1100px 700px at 8% -12%, var(--surface2), transparent 60%),
      radial-gradient(900px 600px at 110% 115%, var(--surface2), transparent 55%); }
  body[data-bg="Mesh"] .bg { background:
      radial-gradient(700px 420px at 12% 8%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 65%),
      radial-gradient(650px 480px at 88% 22%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%),
      radial-gradient(800px 500px at 50% 110%, var(--surface2), transparent 60%); }
  body[data-bg="Grid"] .bg { opacity: .7; background-image:
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 34px 34px;
      mask-image: radial-gradient(900px 620px at 50% 20%, #000 40%, transparent 90%); }
  body[data-bg="Dots"] .bg { opacity: .8; background-image:
      radial-gradient(var(--border) 1.6px, transparent 1.6px);
      background-size: 24px 24px;
      mask-image: radial-gradient(900px 620px at 50% 25%, #000 45%, transparent 92%); }
  body[data-bg="Orbits"] .bg { background:
      radial-gradient(closest-side at 50% -14%, color-mix(in srgb, var(--primary) 14%, transparent), transparent),
      radial-gradient(closest-side at 92% 108%, color-mix(in srgb, var(--accent) 12%, transparent), transparent); }

  /* ---------- shell / layouts ---------- */
  .app {
    position: relative; z-index: 1;
    display: grid; grid-template-columns: 1fr; grid-template-rows: 100%;
    height: 100dvh;
  }
  body[data-layout="Sidebar"] .app { grid-template-columns: 292px 1fr; }
  body:not([data-layout="Sidebar"]) .sidecard { display: none; }

  .sidecard {
    display: flex; flex-direction: column; gap: 18px;
    padding: 26px 20px 20px;
    border-right: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 62%, transparent);
    backdrop-filter: blur(14px);
    overflow-y: auto;
  }
  .sidecard .ident { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .sidecard .about { font-size: .82rem; color: var(--muted); line-height: 1.55; }
  .sidecard .section-label { margin-top: 6px; font-family: var(--font-mono); font-size: .62rem; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); }
  .sidecard ol { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .sidecard ol li {
    font-size: .8rem; line-height: 1.45; padding: 10px 12px;
    border: 1px solid var(--border); border-radius: var(--r);
    background: var(--surface2);
    cursor: pointer; transition: border-color .18s ease, transform .18s ease;
  }
  .sidecard ol li:hover { border-color: var(--primary); transform: translateX(3px); }
  .sidecard .credit { margin-top: auto; font-family: var(--font-mono); font-size: .6rem; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .sidecard .credit b { color: var(--primary); font-weight: 700; }

  .chat-col { display: flex; flex-direction: column; height: 100%; min-width: 0; }

  .chat-head {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 22px; border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    backdrop-filter: blur(14px);
    animation: rise .45s ease both;
  }
  .chat-head .name { font-size: .98rem; font-weight: 650; font-family: var(--head); letter-spacing: .01em; }
  .chat-head .line { font-size: .72rem; color: var(--muted); }
  .chat-head .status { margin-left: auto; display: flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #3ecf6f; box-shadow: 0 0 0 0 color-mix(in srgb, #3ecf6f 60%, transparent); animation: pulse 2.2s infinite; }
  body.busy .dot { background: var(--primary); }
  body.busy .status-txt::after { content: ' Thinking'; }
  body:not(.busy) .status-txt::after { content: ' Online'; }

  .avatar {
    width: 40px; height: 40px; flex: 0 0 40px;
    display: grid; place-items: center;
    border-radius: var(--avatar-rr);
    background: linear-gradient(135deg, var(--primary), var(--accent));
    color: var(--bg); font-weight: 800; font-size: .95rem;
    box-shadow: var(--glow);
    user-select: none;
  }
  .avatar.lg { width: 64px; height: 64px; flex-basis: 64px; font-size: 1.5rem; }

  /* ---------- feed ---------- */
  .feed {
    flex: 1; overflow-y: auto;
    padding: 26px 22px 10px;
    scroll-behavior: smooth;
  }
  .thread { max-width: var(--maxw); margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }

  .intro { max-width: var(--maxw); margin: 26px auto 8px; text-align: center; display: flex; flex-direction: column; gap: 14px; align-items: center; padding-bottom: 12px; }
  body[data-layout="Center"] .intro { display: none; }
  .intro .avatar { margin: 0 auto; }
  .intro h2 { font-family: var(--head); font-size: 1.35rem; font-weight: 700; }
  .intro p { color: var(--muted); font-size: .86rem; max-width: 46ch; line-height: 1.6; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 4px; }
  .chip {
    font-size: .78rem; padding: 8px 14px; cursor: pointer;
    border: 1px solid var(--border); border-radius: 999px;
    background: var(--surface); color: var(--text);
    transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease;
  }
  .chip:hover { border-color: var(--primary); transform: translateY(-1px); box-shadow: var(--glow); }
  body.started .intro { display: none; }

  .msg { max-width: 78%; padding: 12px 16px; line-height: 1.55; font-size: .9rem;
         border-radius: var(--r); animation: rise .34s ease both; word-wrap: break-word; }
  .msg.user { align-self: flex-end; background: var(--primary); color: var(--bg); border-bottom-right-radius: 6px; }
  .msg.bot  { align-self: flex-start; background: var(--surface2); border: 1px solid var(--border); border-bottom-left-radius: 6px; }
  .msg .who { display: block; font-family: var(--font-mono); font-size: .58rem; letter-spacing: .18em; text-transform: uppercase; opacity: .65; margin-bottom: 5px; }
  .msg p + p { margin-top: 8px; }
  .msg pre { margin: 8px 0; padding: 10px 12px; border-radius: calc(var(--r) / 1.6);
             background: color-mix(in srgb, var(--bg) 60%, var(--surface)); border: 1px solid var(--border); overflow-x: auto; }
  .msg code { font-family: var(--font-mono); font-size: .82em; }
  .msg :not(pre) > code { padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--primary) 14%, transparent); }
  .msg strong { font-weight: 700; }

  body[data-msg="Cards"] .msg.bot { max-width: 92%; align-self: stretch; border-left: 3px solid var(--primary); background: var(--surface); }
  body[data-msg="Cards"] .msg.user { max-width: 62%; }
  body[data-msg="Compact"] .msg { padding: 7px 12px; font-size: .84rem; }
  body[data-msg="Compact"] .msg.bot { background: transparent; border-color: transparent; border-left: 2px solid var(--border); border-radius: 0 var(--r) var(--r) 0; }
  body[data-msg="Compact"] .thread { gap: 8px; }

  .typing { align-self: flex-start; display: flex; gap: 5px; padding: 14px 16px;
            background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r); }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: bounce 1s infinite; }
  .typing i:nth-child(2) { animation-delay: .15s; }
  .typing i:nth-child(3) { animation-delay: .3s; }

  .retry { margin-top: 8px; font: inherit; font-size: .76rem; font-weight: 600; cursor: pointer;
           color: var(--primary); background: none; border: 1px solid currentColor; border-radius: 999px; padding: 5px 14px; }
  .retry:hover { box-shadow: var(--glow); }

  /* ---------- composer ---------- */
  .composer { padding: 12px 22px 18px; }
  .box {
    max-width: var(--maxw); margin: 0 auto;
    display: flex; align-items: flex-end; gap: 10px;
    padding: 10px 10px 10px 16px;
    border: 1px solid var(--border); border-radius: calc(var(--r) + 6px);
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 32px -18px color-mix(in srgb, var(--bg) 90%, black);
    transition: border-color .18s ease;
  }
  .box:focus-within { border-color: var(--primary); }
  .box textarea {
    flex: 1; resize: none; border: 0; outline: 0; background: transparent;
    color: var(--text); font: inherit; font-size: .92rem; line-height: 1.5;
    max-height: 160px; padding: 6px 0;
  }
  .box textarea::placeholder { color: var(--muted); opacity: .8; }
  .send {
    width: 40px; height: 40px; flex: 0 0 40px; border: 0; cursor: pointer;
    display: grid; place-items: center;
    border-radius: calc(var(--r) + 2px);
    background: linear-gradient(135deg, var(--primary), var(--accent));
    color: var(--bg);
    box-shadow: var(--glow);
    transition: transform .15s ease, filter .15s ease, opacity .15s ease;
  }
  .send:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
  .send:active:not(:disabled) { transform: translateY(0); }
  .send:disabled { opacity: .45; cursor: not-allowed; }
  .hint { max-width: var(--maxw); margin: 7px auto 0; text-align: center;
          font-family: var(--font-mono); font-size: .6rem; letter-spacing: .1em; color: var(--muted); text-transform: uppercase; opacity: .75; }
  .hint kbd { font-family: inherit; border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }

  body[data-mono] .chat-head .name, body[data-mono] .intro h2 { font-family: var(--font-mono); }

  /* ---------- animations ---------- */
  @keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
  @keyframes bounce { 0%, 70%, 100% { transform: translateY(0); opacity: .5; } 35% { transform: translateY(-5px); opacity: 1; } }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, #3ecf6f 55%, transparent); } 70% { box-shadow: 0 0 0 9px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }

  /* ---------- responsive ---------- */
  @media (max-width: 860px) {
    body[data-layout="Sidebar"] .app { grid-template-columns: 1fr; }
    .sidecard { display: none; }
    .msg { max-width: 88%; }
  }
</style>
</head>
<body {{BODY_ATTRS}}>
<div class="bg" aria-hidden="true"></div>

<div class="app">
  <aside class="sidecard" aria-label="About this assistant">
    <div class="ident">
      <span class="avatar lg" id="sideAvatar" aria-hidden="true"></span>
      <h1 style="font-family:var(--head);font-size:1.06rem;font-weight:750;line-height:1.3" id="sideName"></h1>
      <p class="about" id="sideAbout"></p>
    </div>
    <div class="section-label">Try asking</div>
    <ol id="sideStarters"></ol>
    <div class="credit">⚡ Built with <b>Scarlet&nbsp;Chatbot&nbsp;Factory</b></div>
  </aside>

  <main class="chat-col">
    <header class="chat-head">
      <span class="avatar" id="headAvatar" aria-hidden="true"></span>
      <div>
        <div class="name" id="headName"></div>
        <div class="line" id="headLine"></div>
      </div>
      <div class="status"><span class="dot" aria-hidden="true"></span><span class="status-txt"></span></div>
    </header>

    <section class="feed" id="feed" role="log" aria-live="polite">
      <div class="intro" id="intro">
        <span class="avatar lg" id="introAvatar" aria-hidden="true"></span>
        <h2 id="introName"></h2>
        <p id="introText"></p>
        <div class="chips" id="chips"></div>
      </div>
      <div class="thread" id="thread"></div>
    </section>

    <form class="composer" id="composer" autocomplete="off">
      <div class="box">
        <textarea id="input" rows="1" placeholder="Ask me anything about your topic..."></textarea>
        <button class="send" id="send" type="submit" aria-label="Send message" title="Send">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg>
        </button>
      </div>
      <p class="hint"><kbd>Enter</kbd> send &nbsp;·&nbsp; <kbd>Shift</kbd>+<kbd>Enter</kbd> new line</p>
    </form>
  </main>
</div>

<script>
  const BOT = {{BOT_JS}};

  const $ = (id) => document.getElementById(id);
  const feed = $('feed'), thread = $('thread'), input = $('input'), sendBtn = $('send');
  const history = [];
  let busy = false;
  let lastUserText = '';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function inlineInto(node, text) {
    const re = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`)/g;
    let last = 0; let m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.append(text.slice(last, m.index));
      node.append(m[2] !== undefined ? el('strong', null, m[2]) : el('code', null, m[3]));
      last = re.lastIndex;
    }
    if (last < text.length) node.append(text.slice(last));
  }

  function renderInto(node, text) {
    const blocks = String(text).split(/```(\w*)\n?([\s\S]*?)```/g);
    for (let i = 0; i < blocks.length; i += 3) {
      const plain = blocks[i];
      if (plain) for (const chunk of plain.split(/\n{2,}/)) {
        const p = el('p'); inlineInto(p, chunk.trim()); if (chunk.trim()) node.append(p);
      }
      const code = blocks[i + 2];
      if (code !== undefined) { const pre = el('pre'); pre.append(el('code', null, code.trimEnd())); node.append(pre); }
    }
  }

  function bubble(role, text, opts) {
    const m = el('div', 'msg ' + role);
    m.style.whiteSpace = role === 'user' ? 'pre-wrap' : 'normal';
    if (role === 'bot') { m.append(el('span', 'who', BOT.name)); renderInto(m, text); }
    else m.append(document.createTextNode(text));
    if (opts && opts.retry) {
      const b = el('button', 'retry', 'Try again');
      b.type = 'button';
      b.onclick = () => { m.remove(); send(opts.retryText); };
      m.append(b);
    }
    thread.append(m);
    feed.scrollTop = feed.scrollHeight;
    return m;
  }

  function showTyping() {
    const t = el('div', 'typing');
    t.setAttribute('id', 'typing');
    for (let i = 0; i < 3; i += 1) t.append(el('i'));
    thread.append(t);
    feed.scrollTop = feed.scrollHeight;
  }
  function hideTyping() { const t = $('typing'); if (t) t.remove(); }

  async function send(text) {
    const clean = String(text || '').trim();
    if (!clean || busy) return;
    lastUserText = clean;
    document.body.classList.add('started');
    bubble('user', clean);
    const prior = history.map((h) => ({ role: h.role, content: h.content }));
    history.push({ role: 'user', content: clean });
    if (history.length > 40) history.splice(0, history.length - 40);
    setBusy(true);
    showTyping();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history: prior }),
      });
      const data = await res.json();
      hideTyping();
      if (!res.ok || data.error) {
        bubble('bot', (data && data.error) || 'Something went wrong reaching the assistant.', { retry: true, retryText: clean });
      } else {
        bubble('bot', data.reply);
        history.push({ role: 'assistant', content: data.reply });
      }
    } catch {
      hideTyping();
      bubble('bot', 'Network hiccup - please check your connection and try again.', { retry: true, retryText: clean });
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  function setBusy(v) {
    busy = v;
    document.body.classList.toggle('busy', v);
    sendBtn.disabled = v;
    input.disabled = v;
  }

  function addStarterChips(container) {
    (BOT.starters || []).forEach((s) => {
      const b = el('button', 'chip', s);
      b.type = 'button';
      b.onclick = () => send(s);
      container.append(b);
    });
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); input.value = ''; grow(); }
  });
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
  input.addEventListener('input', grow);

  const dom = () => {
    const ini = initials(BOT.name);
    ['headAvatar', 'sideAvatar', 'introAvatar'].forEach((id) => { const n = $(id); if (n) n.textContent = ini; });
    ['headName', 'sideName', 'introName'].forEach((id) => { const n = $(id); if (n) n.textContent = BOT.name; });
    $('headLine').textContent = [BOT.domain, BOT.subdomain].filter(Boolean).join(' · ');
    $('sideAbout').textContent = 'A focused ' + BOT.domain + ' assistant - ' + BOT.subdomain + '. Ask anything inside the specialty; it politely stays in its lane.';
    $('introText').textContent = BOT.welcome;
    addStarterChips($('chips'));
    const ol = $('sideStarters');
    (BOT.starters || []).forEach((s) => { const li = el('li', null, s); li.onclick = () => send(s); ol.append(li); });
    bubble('bot', BOT.welcome);
  };
  dom();
  grow();
</script>
</body>
</html>
