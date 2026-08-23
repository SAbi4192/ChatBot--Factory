import fetch from 'node-fetch';

async function run() {
  console.log("Generating 1 bot...");
  const genRes = await fetch('http://localhost:3001/api/bots/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 1 })
  });
  const genData = await genRes.json();
  const botId = genData.sample.id;
  console.log(`Bot created: ${botId} (${genData.sample.name} - ${genData.sample.domain})`);
  console.log(`Starter Questions:`, genData.sample.starterQuestions);

  console.log("Creating conversation...");
  const convRes = await fetch('http://localhost:3001/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'testconv123', botId, title: 'Test', createdAt: Date.now() })
  });
  
  console.log("Sending normal query (Recursion)...");
  const chat1Res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId, conversationId: 'testconv123', message: 'What is recursion?' })
  });
  const chat1 = await chat1Res.json();
  console.log(`Provider: ${chat1.provider}`);
  console.log(`Sources: ${chat1.sources}`);
  
  console.log("Sending current query (Latest movie)...");
  const chat2Res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId, conversationId: 'testconv123', message: 'What is the latest movie of Tom Holland?' })
  });
  const chat2 = await chat2Res.json();
  console.log(`Provider: ${chat2.provider}`);
  console.log(`Sources: ${chat2.sources}`);
}
run();
