import db from './backend/db.js';
import { generateChatResponse } from './backend/llmService.js';
import { generateSingleBot } from './backend/generator.js';

// Helper to force a bot creation with specific domain/subdomain
function createTestBot(domain, subdomain) {
  let bot = generateSingleBot();
  bot.domain = domain;
  bot.subdomain = subdomain;
  // Re-generate profile to match overridden domain/subdomain
  // We have to mock this since generateDomainProfile isn't exported, but it's fine, we can just edit the DB.
  return bot;
}

async function runTests() {
  db.deleteAll();
  
  // Create Bot 1: Education / Languages
  const b1 = generateSingleBot();
  b1.domain = 'Education';
  b1.subdomain = 'Languages';
  b1.domainProfile = {
    domain: 'Education', specialty: 'Languages',
    allowedTopics: ['education', 'languages', 'grammar', 'english'],
    excludedTopics: ['programming', 'gaming', 'medical', 'python']
  };
  db.insertBotsBulk([b1]);

  // Create Bot 2: Gaming / RPG
  const b2 = generateSingleBot();
  b2.domain = 'Gaming';
  b2.subdomain = 'RPG';
  b2.domainProfile = {
    domain: 'Gaming', specialty: 'RPG',
    allowedTopics: ['gaming', 'rpg', 'character builds', 'quests'],
    excludedTopics: ['photosynthesis', 'medical', 'programming']
  };
  db.insertBotsBulk([b2]);

  // Create Bot 3: Astronomy / Planetary Science
  const b3 = generateSingleBot();
  b3.domain = 'Astronomy';
  b3.subdomain = 'Planetary Science';
  b3.domainProfile = {
    domain: 'Astronomy', specialty: 'Planetary Science',
    allowedTopics: ['astronomy', 'planet', 'mars', 'nasa'],
    excludedTopics: ['bank interest rate', 'programming']
  };
  db.insertBotsBulk([b3]);

  // Create conversations
  db.createConversation('c1', b1.id, 'T1', Date.now());
  db.createConversation('c2', b2.id, 'T2', Date.now());
  db.createConversation('c3', b3.id, 'T3', Date.now());

  const tests = [
    { botId: b1.id, convId: 'c1', msg: 'Explain English grammar.', expected: 'LOCAL' },
    { botId: b1.id, convId: 'c1', msg: 'What is Python?', expected: 'REDIRECT' },
    { botId: b1.id, convId: 'c1', msg: 'Write a Python program to reverse a string.', expected: 'REDIRECT' },
    { botId: b2.id, convId: 'c2', msg: 'Recommend an RPG.', expected: 'LOCAL' },
    { botId: b2.id, convId: 'c2', msg: 'Explain photosynthesis.', expected: 'REDIRECT' },
    { botId: b3.id, convId: 'c3', msg: 'Why is Mars red?', expected: 'LOCAL' },
    { botId: b3.id, convId: 'c3', msg: 'What is the latest NASA mission?', expected: 'WEB' },
    { botId: b3.id, convId: 'c3', msg: 'What is the latest bank interest rate?', expected: 'REDIRECT' },
  ];

  let passed = 0;
  for (const t of tests) {
    console.log(`\n--- Test: ${t.msg} ---`);
    const res = await generateChatResponse(t.botId, t.convId, t.msg);
    const provider = res.provider;
    let actual = provider;
    if (provider === 'local') {
      // Check if it's a redirect by looking at the text
      if (res.response.includes('outside my area of expertise')) {
        actual = 'REDIRECT';
      } else {
        actual = 'LOCAL';
      }
    } else if (provider.includes('web')) {
      actual = 'WEB';
    }

    console.log(`Expected: ${t.expected}, Got: ${actual}`);
    if (actual === t.expected) {
      console.log('✅ PASS');
      passed++;
    } else {
      console.log('❌ FAIL');
    }
  }

  console.log(`\nPassed ${passed}/${tests.length} tests.`);
  process.exit(passed === tests.length ? 0 : 1);
}
runTests();
