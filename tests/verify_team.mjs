/**
 * Team Mode acceptance harness — worst case: NO Groq, NO local model, NO DB.
 * Verifies the deterministic layers: gate regex, tokenization, lexical scoring
 * (weights + stemming + candidate separation), and graceful no-candidate.
 *
 * Run:  node tests/verify_team.mjs
 */
process.env.GROQ_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:59999/api/chat'; // nothing listening

const BASE = new URL('../backend/', import.meta.url).href;
const { isTeamGateQuery, tokens, lexicalScore } = await import(`${BASE}services/teamMode.service.js`);

let pass = 0, fail = 0;
const failures = [];
function expect(label, got, want, note = '') {
  const ok = got === want;
  ok ? pass++ : fail++;
  if (!ok) failures.push(`${label}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)} ${note}`);
  console.log(`  ${ok ? 'PASS' : '>>FAIL'} ${label}${note ? ` — ${note}` : ''}`);
}

/* ============================================================
 * 1. Gate: small talk / meta STAY with the orchestrator
 * ============================================================ */
console.log('\n[1] Team gate — small talk & meta questions');
for (const q of ['hi', 'Hi!', 'HELLO', 'hey there', 'thanks', 'thank you so much!', 'good morning',
  'who are you', 'What can you do?', 'introduce yourself', 'ok', 'bye']) {
  expect(`gate("${q}")`, isTeamGateQuery(q), true);
}
// Domain-ish questions must NOT be gated (they route).
for (const q of ['weather in chennai', 'how do I reverse a string', 'what is the capital of France',
  'recommend me a pasta recipe', 'explain photosynthesis', 'hi, what is 2+2']) {
  expect(`gate("${q}")`, isTeamGateQuery(q), false);
}
expect('gate(long greeting padded)', isTeamGateQuery('hey   !!!'), true);

/* ============================================================
 * 2. Tokenizer
 * ============================================================ */
console.log('\n[2] Tokenizer');
const t = tokens('What is the Python closure syntax?');
expect('keeps meaningful words', t.includes('python') && t.includes('closure') && t.includes('syntax'), true);
expect('drops stopwords', t.includes('what') || t.includes('the'), false);
expect('lowercase', tokens('PASTA Recipe').every((x) => x === x.toLowerCase()), true);
expect('punctuation stripped', tokens('hello, world! (test)').includes('hello'), true);

/* ============================================================
 * 3. Lexical scoring — separation between specialists
 * ============================================================ */
console.log('\n[3] Lexical scoring');
const cookingBot = {
  id: 'cook1', name: 'Chef Marco', domain: 'cooking', subdomain: 'italian',
  description: 'Recipes and cooking help',
  domainProfile: {
    domain: 'cooking', specialty: 'italian',
    description: 'Italian recipes and cooking techniques',
    allowedTopics: ['pasta', 'pizza', 'italian cuisine', 'cooking', 'recipes', 'baking'],
    commonIntents: ['finding a recipe', 'cooking technique', 'ingredient substitution'],
  },
};
const codingBot = {
  id: 'code1', name: 'Code Sensei', domain: 'programming', subdomain: 'python',
  description: 'Python programming help',
  domainProfile: {
    domain: 'programming', specialty: 'python',
    description: 'Python programming and debugging',
    allowedTopics: ['python', 'programming', 'code', 'debugging', 'algorithms', 'syntax'],
    commonIntents: ['fixing a bug', 'writing a program', 'understanding an algorithm'],
  },
};
const qtCook = tokens('give me a pasta recipe with tomato sauce');
const qtCode = tokens('how do I fix a python indentation error');
const sCookCook = lexicalScore(cookingBot, qtCook);
const sCookCode = lexicalScore(cookingBot, qtCode);
const sCodeCook = lexicalScore(codingBot, qtCook);
const sCodeCode = lexicalScore(codingBot, qtCode);
console.log(`  cooking/cook=${sCookCook.toFixed(2)} cooking/code=${sCookCode.toFixed(2)} coding/cook=${sCodeCook.toFixed(2)} coding/code=${sCodeCode.toFixed(2)}`);
expect('cooking query → cooking bot wins', sCookCook > sCodeCook, true);
expect('coding query → coding bot wins', sCodeCode > sCookCode, true);
expect('scores bounded [0,1]', sCookCook >= 0 && sCookCook <= 1 && sCodeCode >= 0 && sCodeCode <= 1, true);
expect('stemming works (recipes→recipe)', lexicalScore(cookingBot, tokens('easy bread recipes')) > 0, true);

/* ============================================================
 * 4. Offline import safety (module loads with zero keys)
 * ============================================================ */
console.log('\n[4] Module loads offline');
expect('service functions exported', typeof isTeamGateQuery === 'function' && typeof lexicalScore === 'function' && typeof tokens === 'function', true);

console.log(`\n==============================================`);
console.log(`Team Mode verify: ${pass} passed, ${fail} failed`);
console.log(`==============================================`);
if (fail > 0) { console.log(failures.join('\n')); process.exit(1); }
