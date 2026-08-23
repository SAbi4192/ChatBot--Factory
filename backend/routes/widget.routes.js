/**
 * Widget routes (Checkpoint 9) — /widget.js launcher + /widget/:botId iframe.
 * The widget is a vanilla JS snippet users paste into any page:
 *   <script src="http://localhost:3001/widget.js" data-bot-id="abc123"></script>
 */
import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();

// Widget launcher JS — served as an inline script (no file IO).
router.get('/widget.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
(function() {
  var BOT_ID = document.currentScript.getAttribute('data-bot-id');
  if (!BOT_ID) return;
  var BASE = window.location.origin;
  var container = document.createElement('div');
  container.id = 'cbf-widget';
  container.innerHTML = '<style>' +
    '#cbf-bubble{position:fixed;bottom:20px;right:20px;z-index:2147483646;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,0.3);transition:transform 0.2s,box-shadow 0.2s}' +
    '#cbf-bubble:hover{transform:scale(1.06);box-shadow:0 8px 30px rgba(0,0,0,0.4)}' +
    '#cbf-frame{position:fixed;bottom:92px;right:20px;z-index:2147483647;width:380px;height:600px;border:none;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,0.35);display:none;max-width:92vw;max-height:82vh;background:#0A0C10}' +
    '#cbf-frame.open{display:block}' +
    '@media(max-width:480px){#cbf-frame{right:0;bottom:0;width:100vw;height:100vh;border-radius:0;max-width:100vw;max-height:100vh}}' +
    '#cbf-footer{position:fixed;bottom:92px;right:20px;z-index:2147483647;font-size:11px;color:rgba(255,255,255,0.4);text-align:right;pointer-events:none;display:none}' +
    '#cbf-footer.open{display:block}' +
    '#cbf-footer a{color:rgba(245,177,61,0.6);text-decoration:none;pointer-events:auto}' +
    '</style>' +
    '<button id="cbf-bubble" aria-label="Open chat widget" style="background:linear-gradient(135deg,#F5B13D,#e09a28);color:#1a1205;font-size:26px;display:grid;place-items:center">💬</button>' +
    '<iframe id="cbf-frame" src="' + BASE + '/widget/' + BOT_ID + '"></iframe>' +
    '<div id="cbf-footer">&#8203;</div>';
  document.body.appendChild(container);

  var bubble = document.getElementById('cbf-bubble');
  var frame = document.getElementById('cbf-frame');
  var footer = document.getElementById('cbf-footer');
  var open = false;
  bubble.onclick = function(){
    open = !open;
    frame.classList.toggle('open', open);
    footer.classList.toggle('open', open);
    bubble.textContent = open ? '✕' : '💬';
  };
})();
`);
});

// Widget iframe page — a self-contained chat UI using the public API.
router.get('/widget/:botId', async (req, res) => {
  const bot = await prisma.bot.findUnique({ where: { id: req.params.botId } });
  if (!bot) return res.status(404).send('Bot not found');
  const dna = bot.designDna || {};
  const bg = dna.bg || '#0A0C10';
  const surface = dna.surface || '#12151C';
  const text = dna.text || '#EAEEF2';
  const muted = dna.muted || '#8B95A1';
  const primary = dna.primaryColor || '#F5B13D';
  const border = dna.border || 'rgba(255,255,255,0.1)';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${bot.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:${bg};color:${text};height:100vh;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid ${border};flex:none}
header img{width:32px;height:32px;border-radius:8px;background:${primary};display:grid;place-items:center;font-size:18px}
header h2{font-size:15px;font-weight:600}
header .sub{font-size:11px;color:${muted};margin-top:2px}
#msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
.msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.55}
.msg.user{background:${primary};color:#1a1205;align-self:flex-end;border-bottom-right-radius:4px}
.msg.assistant{background:${surface};border:1px solid ${border};align-self:flex-start;border-bottom-left-radius:4px}
.msg .meta{font-size:10px;color:${muted};margin-top:4px;letter-spacing:0.04em}
#composer{display:flex;gap:8px;padding:10px 14px;border-top:1px solid ${border};flex:none}
#composer input{flex:1;padding:10px 14px;border-radius:20px;border:1px solid ${border};background:${surface};color:${text};font-size:14px;outline:none}
#composer input:focus{border-color:${primary}}
#composer button{width:40px;height:40px;border-radius:50%;border:none;background:${primary};color:#1a1205;font-size:18px;cursor:pointer;display:grid;place-items:center;flex:none}
#composer button:disabled{opacity:0.4}
.typing{display:flex;gap:4px;padding:8px 12px;background:${surface};border:1px solid ${border};border-radius:12px;align-self:flex-start;border-bottom-left-radius:4px}
.typing i{width:7px;height:7px;border-radius:50%;background:${muted};animation:dot 1s ease-in-out infinite}
.typing i:nth-child(2){animation-delay:0.2s}
.typing i:nth-child(3){animation-delay:0.4s}
@keyframes dot{0%,100%{opacity:0.3}50%{opacity:1}}
.error{text-align:center;padding:20px;color:${muted};font-size:13px}
</style></head><body>
<header>
  <span style="display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:${primary};font-size:18px">${bot.avatar || bot.name.slice(0,2).toUpperCase()}</span>
  <div><h2>${bot.name}</h2><div class="sub">${bot.domain} · ${bot.subdomain}</div></div>
</header>
<div id="msgs"></div>
<div id="composer">
  <input id="input" placeholder="Message ${bot.name}…" autofocus>
  <button id="send" onclick="send()">➤</button>
</div>
<script>
var CONV = null, CID = localStorage.getItem('cbf:conv:'+'${bot.id}');
var BASE = window.location.origin;
var input = document.getElementById('input');
var msgs = document.getElementById('msgs');
var sendBtn = document.getElementById('send');
var typing = false;

function scrollDown(){setTimeout(function(){msgs.scrollTop = msgs.scrollHeight}, 50)}

function addMsg(role, content, meta){
  var d = document.createElement('div');
  d.className = 'msg ' + role;
  d.innerHTML = '<div>' + content.replace(/\\n/g, '<br>') + '</div>';
  if(meta) d.innerHTML += '<div class="meta">' + meta + '</div>';
  msgs.appendChild(d);
  scrollDown();
}

function addTyping(){
  var d = document.createElement('div');
  d.className = 'typing';
  d.id = 'typing-indicator';
  d.innerHTML = '<i></i><i></i><i></i>';
  msgs.appendChild(d);
  scrollDown();
}

function removeTyping(){
  var t = document.getElementById('typing-indicator');
  if(t) t.remove();
}

async function send(){
  var text = input.value.trim();
  if(!text || typing) return;
  input.value = '';
  addMsg('user', text);
  typing = true;
  addTyping();
  sendBtn.disabled = true;
  try{
    var r = await fetch(BASE + '/api/public/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({botId:'${bot.id}', message:text, conversationId:CID})
    });
    var data = await r.json();
    CID = data.conversationId;
    localStorage.setItem('cbf:conv:'+'${bot.id}', CID);
    removeTyping();
    addMsg('assistant', data.response, (data.provider||''));
  }catch(e){
    removeTyping();
    addMsg('assistant', 'I\\'m sorry — the server is not reachable right now. Please try again later.', 'offline');
  }
  typing = false;
  sendBtn.disabled = false;
}

input.addEventListener('keydown', function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});

// Load existing messages
if(CID){
  fetch(BASE + '/api/public/conversations/' + CID + '/messages')
    .then(function(r){return r.json()})
    .then(function(ms){ms.forEach(function(m){addMsg(m.role, m.content, m.provider)})})
    .catch(function(){});
}
</script></body></html>`);
});

export default router;