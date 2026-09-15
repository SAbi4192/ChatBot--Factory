import { prisma } from "./prisma.js";
import { checkDomainRelevance } from "./domainGuard.js";
const bot = await prisma.bot.findFirst({ where: { name: { contains: "Drivetrain" } } });
const H = [{role:"user",content:"Hi"},{role:"assistant",content:"Hey! Ask me about bikes."},{role:"user",content:"Tell me about the Duke 390"},{role:"assistant",content:"The KTM Duke 390 is a naked street motorcycle with a 373cc engine."}];
const cases = [
 ["off", "Who is Modi?", []],
 ["off", "What is RAG?", H],
 ["off", "tell me a joke", H],
 ["off", "write python code to sort a list", H],
 ["off", "who is Virat Kohli", H],
 ["off", "what is the capital of France", H],
 ["on",  "What is the mileage of Duke 390?", []],
 ["on",  "price?", [{role:"user",content:"Tell me about the Duke 390"},{role:"assistant",content:"The KTM Duke 390 is a 373cc naked street motorcycle."}]],
 ["on",  "best helmet for touring", []],
 ["on",  "how often should I service my bullet", []],
];
let pass=0;
for (const [want, msg, hist] of cases) {
  const r = await checkDomainRelevance(bot, msg, hist);
  const got = r.relevant ? "on" : "off";
  const ok = got===want;
  if (ok) pass++;
  console.log((ok?"PASS":"FAIL!!"), want.padEnd(3), `"${msg}"`.padEnd(45), "->", r.result, "L"+r.layer, "|", r.reason.slice(0,60));
}
console.log(`\n${pass}/${cases.length}`);
process.exit(pass===cases.length?0:1);
