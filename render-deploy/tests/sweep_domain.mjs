/**
 * FAIRNESS SWEEP — self-consistency check with no hand-written expectations.
 *
 * Every bot ships starter questions that the app itself renders as clickable
 * suggestions. If a bot refuses its OWN suggested question, the demo breaks in
 * the most visible way possible. So: generate a large sample of bots and assert
 * that every starter question is answered, with no AI provider reachable.
 *
 * Then do the mirror test: ask every bot a battery of questions that clearly
 * belong to OTHER domains (built from the other domains' starter questions) and
 * assert those are redirected.
 *
 * Run:  node sweep_domain.mjs
 */
process.env.GROQ_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.LOCAL_LLM_URL = 'http://127.0.0.1:59999/api/chat';

const BASE = new URL('../backend/', import.meta.url).href;
const { generateSingleBot } = await import(`${BASE}generator.js`);
const { checkDomainRelevance } = await import(`${BASE}domainGuard.js`);

const SAMPLE = 400;

// One representative bot per (domain, specialty) pair the generator can produce.
const bots = new Map();
for (let i = 0; i < 12000 && bots.size < 60; i++) {
  const b = await generateSingleBot();
  const key = `${b.domain}|${b.subdomain}`;
  if (!bots.has(key)) bots.set(key, b);
}
console.log(`Specialties discovered: ${bots.size}`);

const starters = b => (typeof b.starterQuestions === 'string'
  ? JSON.parse(b.starterQuestions || '[]') : b.starterQuestions) || [];

/* ---------- Part A: every bot answers its own starter questions ---------- */
let aPass = 0; const aFail = [];
for (const b of bots.values()) {
  for (const q of starters(b)) {
    const r = await checkDomainRelevance(b, q, []);
    if (r.relevant) aPass++;
    else aFail.push(`${b.domain}·${b.subdomain} refused its OWN starter "${q}" (${r.reason})`);
  }
}
console.log(`\nA. Own starter questions: ${aPass} answered, ${aFail.length} refused`);
for (const f of aFail) console.log('  >> ' + f);

/* ---------- Part B: questions from OTHER domains must redirect ---------- */
// Only compare across different DOMAINS (not sibling specialties): a Hardware
// bot answering a Networking question is acceptable behaviour, a Hardware bot
// answering "how is child custody decided" is not.
const byDomain = new Map();
for (const b of bots.values()) {
  if (!byDomain.has(b.domain)) byDomain.set(b.domain, []);
  byDomain.get(b.domain).push(...starters(b));
}

let bPass = 0; const bFail = [];
for (const b of bots.values()) {
  for (const [domain, questions] of byDomain) {
    if (domain === b.domain) continue;
    for (const q of questions) {
      const r = await checkDomainRelevance(b, q, []);
      if (!r.relevant) bPass++;
      else bFail.push(`${b.domain}·${b.subdomain} answered a ${domain} question: "${q}" (${r.reason})`);
    }
  }
}
console.log(`\nB. Cross-domain questions: ${bPass} redirected, ${bFail.length} leaked`);
// Print a capped sample plus a tally, so a systematic hole is obvious.
const tally = new Map();
for (const f of bFail) {
  const term = (f.match(/Matches own field: ([^)]*)/) || [, 'default-allow'])[1];
  tally.set(term, (tally.get(term) || 0) + 1);
}
for (const f of bFail.slice(0, 25)) console.log('  >> ' + f);
if (bFail.length > 25) console.log(`  ... and ${bFail.length - 25} more`);
if (tally.size) {
  console.log('\n  Leak causes (most common first):');
  for (const [term, n] of [...tally].sort((x, y) => y[1] - x[1]).slice(0, 20)) {
    console.log(`    ${String(n).padStart(4)}  ${term}`);
  }
}

const leakRate = bPass + bFail.length ? (bFail.length / (bPass + bFail.length)) * 100 : 0;
console.log(`\nSummary: own-question refusal rate ${(aFail.length / (aPass + aFail.length) * 100).toFixed(1)}% (target 0%)`);
console.log(`         cross-domain leak rate    ${leakRate.toFixed(1)}%`);
process.exit(aFail.length === 0 && leakRate < 8 ? 0 : 1);
