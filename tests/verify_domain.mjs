/**
 * Domain Guard acceptance harness — worst case: NO local model, NO cloud keys.
 * Everything here must pass deterministically at Layers 0-3.
 *
 * Run:  node verify_domain.mjs
 */
process.env.GROQ_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:59999/api/chat'; // nothing listening

const BASE = new URL('../backend/', import.meta.url).href;
const { generateSingleBot } = await import(`${BASE}generator.js`);
const { checkDomainRelevance, generateRedirectMessage, generateIntroMessage } = await import(`${BASE}domainGuard.js`);
const { isCurrentQuery } = await import(`${BASE}currentInfo.js`);

let pass = 0, fail = 0;
const failures = [];

async function expect(bot, question, shouldAnswer, note = '') {
  const r = await checkDomainRelevance(bot, question, []);
  const ok = r.relevant === shouldAnswer;
  ok ? pass++ : fail++;
  if (!ok) failures.push(`${bot.domain}·${bot.subdomain} :: "${question}" -> got ${r.relevant ? 'ANSWER' : 'REDIRECT'}, wanted ${shouldAnswer ? 'ANSWER' : 'REDIRECT'} (${r.reason})`);
  const verdict = r.relevant ? 'ANSWER  ' : 'REDIRECT';
  console.log(`  ${ok ? 'PASS' : '>>FAIL'} [L${r.layer}] ${verdict} "${question}" ${note}`);
  return r;
}

const botCache = new Map();
function findBot(domain, subdomain) {
  const key = `${domain}|${subdomain}`;
  if (botCache.has(key)) return botCache.get(key);
  for (let i = 0; i < 8000; i++) {
    const b = generateSingleBot();
    if (b.domain === domain && b.subdomain === subdomain) { botCache.set(key, b); return b; }
  }
  throw new Error(`Could not generate ${domain} · ${subdomain}`);
}

/* ============================================================
   1. LEGACY BOT — reproduces a row already sitting in the user's
      SQLite database: a thin profile from an older generator, whose
      whole vocabulary was "technology, hardware, basics, ...".
      This is the exact bot that misbehaved.
   ============================================================ */
console.log('\n=== 1. LEGACY thin-profile bot (Technology · Hardware) ===');
const legacyBot = {
  id: 'legacy1',
  name: 'Pro Technology',
  domain: 'Technology',
  subdomain: 'Hardware',
  personality: 'Professional',
  starterQuestions: ['What is a CPU?'],
  domainProfile: {
    domain: 'Technology',
    specialty: 'Hardware',
    description: 'Technology assistance focused on Hardware.',
    allowedTopics: ['technology', 'hardware', 'basics', 'advanced concepts', 'history'],
    relatedTopics: [],
    synonyms: [],
    commonIntents: [],
    excludedTopics: ['python', 'java', 'javascript', 'code', 'coding', 'programming',
      'recipe', 'biryani', 'cooking', 'cricket match', 'football score', 'live score']
  }
};

// The six questions the user actually tried.
await expect(legacyBot, 'Hi!', true, '(greeting)');
await expect(legacyBot, 'What Can u do?', true, '(meta, typo "u")');
await expect(legacyBot, 'What is an Hardware?', true);
await expect(legacyBot, 'Which is Best Intel or AMD?', true, '(was broken)');
await expect(legacyBot, 'Tell me the lastest Version of ryzen 9 series?', true, '(was broken)');
await expect(legacyBot, 'What is Python', false, '(software q to a hardware bot)');

// Extra realistic hardware questions that must all be answered.
console.log('\n  -- more hardware questions --');
for (const q of [
  'Is a 4070 better than a 7800 XT?',
  'How much RAM do I need for video editing?',
  'My CPU is overheating, what should I check?',
  'DDR4 vs DDR5 — is it worth upgrading?',
  'What PSU wattage do I need for an RTX 4080?',
  'Why is my SSD slower than advertised?',
  'How do I get more fps in games?',
  'Is this motherboard compatible with a Ryzen 7?',
  'Recommend a good monitor for programming work',
  'What is the function of a chipset?',
  'Which components should I upgrade first?',
  'Difference between the 4000 series and 5000 series?',
  'Is the new generation worth the price?',
  'What does the power switch on the PSU do?',
  'How do I read my CPU model number?'
]) await expect(legacyBot, q, true);

// Off-topic must STILL redirect on the same bot.
console.log('\n  -- off-topic must still redirect --');
for (const q of [
  'Suggest a good biryani recipe',
  'Who won the cricket match yesterday?',
  'Write a Python program to sort a list',
  'What should I wear to a wedding?',
  'How do I apply for a US visa?',
  'How is child custody decided?',
  'What is a good mutual fund to buy?',
  'Which Netflix series should I watch?'
]) await expect(legacyBot, q, false);

/* ============================================================
   2. NEWLY GENERATED Hardware bot
   ============================================================ */
console.log('\n=== 2. NEW Technology · Hardware bot ===');
const hw = findBot('Technology', 'Hardware');
console.log(`  bot: ${hw.name}`);
for (const q of ['Which is Best Intel or AMD?', 'Tell me the lastest Version of ryzen 9 series?',
  'hello', 'what can you do', 'What graphics card should I buy?']) await expect(hw, q, true);
for (const q of ['Suggest a good biryani recipe', 'Who won the cricket match yesterday?']) await expect(hw, q, false);

/* ============================================================
   3. GRADED ACCEPTANCE TABLE — Legal · Immigration (spec #49)
   ============================================================ */
console.log('\n=== 3. Legal · Immigration acceptance table ===');
const legal = findBot('Legal', 'Immigration');
console.log(`  bot: ${legal.name}`);
const legalCases = [
  ['How can I move to the USA from India?', true],
  ['Which visa should I apply for to work abroad?', true],
  ['How does the green card process work?', true],
  ['What are common reasons visa applications get rejected?', true],
  ['How do I apply for citizenship?', true],
  ['Write a Python program to sort a list', false],
  ['Suggest a good biryani recipe', false],
  ['Who won the cricket match yesterday?', false],
  ['What is the best RPG to play right now?', false],
  ['How do I fix a bug in my JavaScript code?', false],
];
for (const [q, want] of legalCases) await expect(legal, q, want);

/* ============================================================
   4. Greetings + meta across every domain (must never refuse)
   ============================================================ */
console.log('\n=== 4. Greetings/meta across domains ===');
const seen = new Set();
for (let i = 0; i < 600 && seen.size < 10; i++) {
  const b = generateSingleBot();
  if (seen.has(b.domain)) continue;
  seen.add(b.domain);
  await expect(b, 'hi', true, `(${b.domain})`);
  await expect(b, 'what can you do?', true, `(${b.domain})`);
}

/* ============================================================
   5. IN-DOMAIN BATTERY — several realistic questions per specialty.
      This is the section that catches lexicon collisions: a word that
      belongs to two fields must never make a fair question look foreign.
   ============================================================ */
console.log('\n=== 5. In-domain battery (must ALL answer) ===');
const battery = {
  'Technology|Cybersecurity': [
    'Is it safe to reuse the same password?',
    'How do I secure my account against hackers?',
    'How can I tell if an email is a phishing scam?',
    'Is a VPN worth using on public wifi?',
    'What should I do after a data breach?'
  ],
  'Technology|AI': [
    'How is ChatGPT different from Claude?',
    'What is a transformer model?',
    'How does fine-tuning work?',
    'Why do language models hallucinate?'
  ],
  'Technology|Networking': [
    'Why is my wifi dropping every few minutes?',
    'What is the difference between a switch and a router?',
    'How do I reduce latency for online play?',
    'What does changing my DNS actually do?'
  ],
  'Technology|Hardware': [
    'Which is better for gaming, Intel or AMD?',
    'What parts do I need for a budget PC build?',
    'How do I stop my CPU from overheating?',
    'What is the difference between DDR4 and DDR5?',
    'Is 16GB of RAM enough in 2026?'
  ],
  'Education|Programming': [
    'Explain recursion with an example',
    'What is the difference between a list and a tuple in Python?',
    'How do I debug an infinite loop?',
    'When should I use a class instead of a function?'
  ],
  'Education|Mathematics': [
    'How do I solve a quadratic equation?',
    'What is the sum of an infinite geometric series?',
    'Explain the chain rule',
    'How do I find the probability of two independent events?'
  ],
  'Education|Languages': [
    'What is the difference between affect and effect?',
    'How do I use the past perfect tense?',
    'Give me tips to improve my English pronunciation',
    'What does this idiom mean?'
  ],
  'Education|Physics': [
    'Why do objects fall at the same rate in a vacuum?',
    'What is the difference between mass and weight?',
    'How does a lens focus light?',
    'Explain Newton\'s third law',
    'What is voltage in a simple circuit?'
  ],
  'Education|History': [
    'What caused World War I?',
    'Who built the Roman aqueducts?',
    'Why did the Roman Empire fall?'
  ],
  'Gaming|RPG': [
    'Which class should I pick in Elden Ring?',
    'How do I build a mage in Skyrim?',
    'Is grinding worth it before the final dungeon?'
  ],
  'Gaming|FPS': [
    'How do I improve my aim in Valorant?',
    'What sensitivity should I use?',
    'Best loadout for long range fights?'
  ],
  'Gaming|Strategy': [
    'What is a good opening build order?',
    'How do I manage resources early game?',
    'Which civilization is strongest?'
  ],
  'Astronomy|Astrophysics': [
    'How do black holes form?',
    'What is dark matter?',
    'Why do stars have different colours?'
  ],
  'Astronomy|Planetary Science': [
    'Why is Mars red?',
    'Does Venus have an atmosphere?',
    'How did the Moon form?'
  ],
  'Astronomy|Stargazing': [
    'When is the next meteor shower?',
    'What telescope should a beginner buy?',
    'How do I find Orion in the night sky?'
  ],
  'Legal|Family Law': [
    'How is child custody decided?',
    'What is the difference between separation and divorce?',
    'Do I need a prenup?'
  ],
  'Legal|Corporate Law': [
    'What is the difference between an LLC and a corporation?',
    'Do I need an NDA before pitching my startup?',
    'What does a shareholder agreement cover?'
  ],
  'Legal|Immigration': [
    'How does the green card process work?',
    'Can I switch employers on an H-1B?',
    'What documents do I need for a student visa?'
  ],
  'Healthcare|General Practice': [
    'What causes frequent headaches?',
    'How much sleep do adults actually need?',
    'What is a healthy blood pressure range?'
  ],
  'Healthcare|Mental Health': [
    'How can I manage stress before exams?',
    'What are some grounding techniques for anxiety?',
    'How do I improve my work-life balance?'
  ],
  'Banking|Retail Banking': [
    'How does compound interest work?',
    'What is the difference between a debit and a credit card?',
    'How do I improve my credit score?'
  ],
  'Banking|Investment': [
    'What is an index fund?',
    'How do I diversify a portfolio?',
    'What is the difference between stocks and bonds?'
  ],
  'Tourism|Trip Planning': [
    'Plan a 3-day itinerary for Paris',
    'How much should I budget for a week in Japan?',
    'What should I pack for a road trip?'
  ],
  'Tourism|Hotels': [
    'What is the difference between a hostel and a hotel?',
    'Is it cheaper to book direct or through an app?',
    'What amenities should I look for?'
  ],
  'Restaurant|Menu': [
    'Suggest a good biryani recipe',
    'What wine pairs with steak?',
    'What are good vegetarian starters?'
  ],
  'Fashion|Styling': [
    'What should I wear to a job interview?',
    'How do I build a capsule wardrobe?',
    'What shoes go with smart casual?'
  ]
};

for (const [key, questions] of Object.entries(battery)) {
  const [d, s] = key.split('|');
  let b;
  try { b = findBot(d, s); } catch { console.log(`  (skip ${d}·${s} — not in generator)`); continue; }
  console.log(`  -- ${d} · ${s} (${b.name}) --`);
  for (const q of questions) await expect(b, q, true);
}

/* ============================================================
   6. CROSS-DOMAIN OFF-TOPIC MATRIX — the same battery of clearly
      foreign questions asked of several unrelated bots.
   ============================================================ */
console.log('\n=== 6. Off-topic matrix (must ALL redirect) ===');
const offTopic = [
  ['Suggest a good biryani recipe', 'Restaurant'],
  ['Who won the cricket match yesterday?', null],
  ['Write a Python program to sort a list', 'Education'],
  ['How do I apply for a US visa?', 'Legal'],
  ['Which Netflix series should I watch?', null],
  ['How is child custody decided?', 'Legal'],
  ['What is an index fund?', 'Banking'],
  ['How do black holes form?', 'Astronomy'],
];
const victims = [
  ['Technology', 'Hardware'], ['Astronomy', 'Stargazing'], ['Banking', 'Retail Banking'],
  ['Healthcare', 'General Practice'], ['Tourism', 'Hotels'], ['Gaming', 'FPS']
];
for (const [d, s] of victims) {
  let b;
  try { b = findBot(d, s); } catch { continue; }
  console.log(`  -- ${d} · ${s} --`);
  for (const [q, ownerDomain] of offTopic) {
    if (ownerDomain === d) continue; // not off-topic for its own owner
    await expect(b, q, false);
  }
}

/* ============================================================
   7. Current-info routing (which questions reach the web)
   ============================================================ */
console.log('\n=== 7. Current-info routing ===');
const routing = [
  ['Tell me the lastest Version of ryzen 9 series?', true],
  ['What are the latest AI model releases?', true],
  ['What is the newest Nvidia card?', true],
  ['Who won the cricket match yesterday?', true],
  ['How do I know which CPU to buy?', false],   // "know" must not match "now"
  ['What is the exchange rate concept?', false], // "exchange" must not match "change"
  ['Explain how a CPU works', false],
  ['What is DDR5?', false],
  ['How does compound interest work?', false],
  ['Is 16GB of RAM enough in 2026?', true],
];
for (const [q, want] of routing) {
  const got = isCurrentQuery(q);
  const ok = got === want;
  ok ? pass++ : fail++;
  if (!ok) failures.push(`isCurrentQuery("${q}") -> ${got}, wanted ${want}`);
  console.log(`  ${ok ? 'PASS' : '>>FAIL'} ${got ? 'WEB  ' : 'LOCAL'} "${q}"`);
}

/* ============================================================
   8. Message quality
   ============================================================ */
console.log('\n=== 8. Sample messages ===');
console.log('\n--- redirect (legacy hardware bot) ---\n' + generateRedirectMessage(legacyBot));
console.log('\n--- greeting reply (new hardware bot) ---\n' + generateIntroMessage(hw, 'greeting'));
console.log('\n--- "what can you do" reply (legal bot) ---\n' + generateIntroMessage(legal, 'meta'));

console.log(`\n================ ${pass} passed, ${fail} failed ================`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(' - ' + f);
}
process.exit(fail === 0 ? 0 : 1);
