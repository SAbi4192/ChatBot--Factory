import Groq from 'groq-sdk';

/**
 * ============================================================
 * UNIVERSAL BOT GENERATOR
 * ------------------------------------------------------------
 * Procedurally manufactures specialized chatbots from combinations of:
 *   domain + specialty + personality + Design DNA (theme/layout/style/bg)
 * Every bot gets a strong domain-specific system prompt, a rich domain
 * profile (used by the Domain Guard), starter questions, a welcome line,
 * and a full color palette so each bot looks like its own product.
 * ============================================================
 */

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid  = () => Math.random().toString(36).substring(2, 11);

const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
const GROQ_KEY = process.env.GROQ_API_KEY;
const hasGroq = () => !!GROQ_KEY && GROQ_KEY !== 'MISSING_API_KEY' && !GROQ_KEY.startsWith('your_');
const groq = hasGroq() ? new Groq({ apiKey: GROQ_KEY }) : null;

// ---------------------------------------------------------------------------
// THEME PALETTES  (full, coherent color systems — no remote assets)
// ---------------------------------------------------------------------------
const THEME_PALETTES = {
  Midnight:   { mode:'dark',  bg:'#0b1020', surface:'#141a2e', surface2:'#1b2340', text:'#e6e9f2', muted:'#8b93a7', border:'#242c46', primary:'#6366f1', accent:'#22d3ee' },
  Space:      { mode:'dark',  bg:'#0a0a1f', surface:'#141433', surface2:'#1c1c45', text:'#ece9ff', muted:'#9a93c7', border:'#2a2650', primary:'#8b5cf6', accent:'#c084fc' },
  Crimson:    { mode:'dark',  bg:'#0d0b14', surface:'#171326', surface2:'#201936', text:'#f0ecff', muted:'#a29bc0', border:'#2c2442', primary:'#ef4444', accent:'#f59e0b' },
  Emerald:    { mode:'dark',  bg:'#06120e', surface:'#0f1f18', surface2:'#152a20', text:'#e7f6ef', muted:'#86a99a', border:'#1c3329', primary:'#10b981', accent:'#34d399' },
  Terminal:   { mode:'dark',  bg:'#05080a', surface:'#0b1014', surface2:'#0f1a14', text:'#c8f7d4', muted:'#5f8f74', border:'#12351f', primary:'#22c55e', accent:'#16a34a', mono:true },
  Amber:      { mode:'dark',  bg:'#14100a', surface:'#1f1810', surface2:'#2a2015', text:'#f7efe0', muted:'#b3a488', border:'#33291a', primary:'#d97706', accent:'#f59e0b' },
  Slate:      { mode:'light', bg:'#f7f8fa', surface:'#ffffff', surface2:'#f0f2f6', text:'#0f172a', muted:'#64748b', border:'#e5e8ee', primary:'#4f46e5', accent:'#0ea5e9' },
  Royal:      { mode:'light', bg:'#f6f7fb', surface:'#ffffff', surface2:'#eef1f8', text:'#101728', muted:'#5c6784', border:'#e3e7f0', primary:'#1e3a8a', accent:'#3b82f6' },
  Ocean:      { mode:'light', bg:'#f2f8fc', surface:'#ffffff', surface2:'#e9f2f9', text:'#0c2740', muted:'#567089', border:'#dbe8f1', primary:'#0369a1', accent:'#06b6d4' },
  Forest:     { mode:'light', bg:'#f4faf5', surface:'#ffffff', surface2:'#e9f4ec', text:'#0f2417', muted:'#5a7a63', border:'#dcece0', primary:'#15803d', accent:'#22c55e' },
  Sunset:     { mode:'light', bg:'#fdf6f3', surface:'#ffffff', surface2:'#fbeae3', text:'#2a1512', muted:'#8a6f66', border:'#f0e2db', primary:'#be123c', accent:'#fb7185' },
  Mono:       { mode:'light', bg:'#fafafa', surface:'#ffffff', surface2:'#f4f4f5', text:'#18181b', muted:'#71717a', border:'#e4e4e7', primary:'#18181b', accent:'#52525b' },
};
const ALL_THEMES = Object.keys(THEME_PALETTES);

const LAYOUTS        = ['Sidebar', 'Center', 'Focus'];
const MESSAGE_STYLES = ['Bubbles', 'Cards', 'Compact'];
const BACKGROUNDS    = ['Solid', 'Gradient', 'Mesh', 'Grid'];
const FONTS          = ["'Inter', system-ui, sans-serif", "'Outfit', system-ui, sans-serif"];

const PERSONALITIES = [
  { name:'Professional', style:'Clear, precise, and businesslike. Uses structured explanations.' },
  { name:'Friendly',     style:'Warm and approachable. Uses encouraging, conversational language.' },
  { name:'Analytical',   style:'Methodical and detail-oriented. Breaks problems into steps.' },
  { name:'Enthusiastic', style:'Energetic and motivating, while staying accurate.' },
  { name:'Concise',      style:'Direct and to the point. Avoids filler.' },
  { name:'Mentor',       style:'Patient and instructive, like a supportive teacher.' },
  { name:'Witty',        style:'Lightly humorous and engaging, without sacrificing clarity.' },
];

// ---------------------------------------------------------------------------
// DOMAIN KNOWLEDGE  (base per domain + specialty refinements)
//  Each domain: preferred themes, expertise, welcome, starters, and a
//  guard profile (allowed / related / synonyms / intents / excluded).
// ---------------------------------------------------------------------------
const DOMAIN_DATA = {
  Education: {
    themes: ['Slate','Royal','Mono'],
    specialties: {
      Languages: {
        expertise: ['grammar','vocabulary','translation','pronunciation','linguistics','writing','reading comprehension'],
        welcome: 'What would you like to learn — grammar, vocabulary, or translation?',
        allowed: ['language','languages','grammar','vocabulary','translation','translate','pronunciation','linguistics','english','spanish','french','german','sentence','word','phrase','tense','verb','noun','writing','reading','fluency','idiom','dialect','communication'],
        related: ['literature','syntax','accent','conversation','essay'],
        synonyms: ['linguistic','speech','tongue'],
        intents: ['translating a sentence','learning a new language','fixing grammar','improving pronunciation','building vocabulary'],
        starters: ['Explain the difference between "affect" and "effect"','Translate "Good morning, how are you?" into French','How can I improve my English pronunciation?','Give me 5 advanced vocabulary words with example sentences'],
      },
      Programming: {
        expertise: ['programming concepts','algorithms','data structures','debugging','languages like Python/Java/JS','best practices'],
        welcome: 'What would you like to learn or build today?',
        allowed: ['programming','code','coding','python','java','javascript','c++','algorithm','data structure','function','variable','loop','recursion','debugging','bug','compiler','api','object','class','array','matplotlib','software'],
        related: ['computer science','development','syntax error','framework'],
        synonyms: ['program','developer','script'],
        intents: ['writing a program','understanding an algorithm','fixing a bug','learning a language feature'],
        starters: ['Explain recursion with a simple example','Write a Python function to reverse a string','What is the difference between a list and a tuple?','Give me a beginner coding exercise'],
      },
      Mathematics: {
        expertise: ['algebra','calculus','geometry','statistics','problem solving','proofs'],
        welcome: 'What math topic can I help you with?',
        allowed: ['math','mathematics','algebra','calculus','geometry','statistics','equation','derivative','integral','probability','theorem','fraction','function','matrix','trigonometry'],
        related: ['problem set','proof','number theory'],
        synonyms: ['mathematical','arithmetic'],
        intents: ['solving an equation','understanding a theorem','working a problem step by step'],
        starters: ['Explain the Pythagorean theorem','Solve 2x + 5 = 17 step by step','What is a derivative, intuitively?','Give me a probability practice problem'],
      },
      Physics: {
        expertise: ['mechanics','energy','electricity','thermodynamics','waves','modern physics'],
        welcome: 'What physics concept would you like to explore?',
        allowed: ['physics','force','energy','motion','velocity','acceleration','gravity','electricity','magnetism','thermodynamics','wave','quantum','relativity','momentum','newton'],
        related: ['experiment','formula','units'],
        synonyms: ['physical'],
        intents: ['understanding a law of physics','solving a mechanics problem'],
        starters: ["Explain Newton's second law","Why do objects fall at the same rate in a vacuum?",'What is kinetic vs potential energy?','Explain how a lever works'],
      },
      History: {
        expertise: ['world history','civilizations','wars','historical figures','timelines'],
        welcome: 'Which period or event would you like to learn about?',
        allowed: ['history','historical','ancient','medieval','empire','war','revolution','civilization','dynasty','century','king','queen','treaty','era'],
        related: ['culture','timeline','archaeology'],
        synonyms: ['historic'],
        intents: ['learning about an event','understanding a historical figure'],
        starters: ['What caused World War I?','Tell me about ancient Egypt','Who was Julius Caesar?','Explain the Industrial Revolution'],
      },
    },
  },

  Gaming: {
    themes: ['Crimson','Midnight','Terminal'],
    specialties: {
      RPG: {
        expertise: ['RPG recommendations','character builds','classes','quests','game mechanics','party composition'],
        welcome: 'What are we playing today — need a build, a recommendation, or a quest tip?',
        allowed: ['rpg','role-playing','role playing','character','build','class','quest','loot','level','leveling','skill tree','party','npc','open world','dungeon','stats','game','games','gaming','video game','playthrough'],
        related: ['jrpg','crpg','mmorpg','tabletop','dungeons and dragons'],
        synonyms: ['gamer','gameplay','walkthrough'],
        intents: ['getting a game recommendation','building a character','understanding a mechanic','picking a class'],
        starters: ['Recommend an RPG for beginners','How do I build a mage character?','Which class should I choose for a solo playthrough?','Explain how experience and leveling work'],
      },
      Strategy: {
        expertise: ['strategy games','build orders','resource management','tactics','4X and RTS'],
        welcome: 'Looking for tactics, a build order, or a game to try?',
        allowed: ['strategy','rts','4x','turn-based','build order','tactics','resource','economy','units','base','civilization','tech tree','game','gaming'],
        related: ['grand strategy','tower defense'],
        synonyms: ['strategic','gamer'],
        intents: ['improving strategy','learning a build order','picking a strategy game'],
        starters: ['Recommend a strategy game for beginners','Explain a good opening build order','How do I manage economy vs military?','What is the difference between RTS and turn-based?'],
      },
      FPS: {
        expertise: ['aim','movement','loadouts','maps','competitive play'],
        welcome: 'Want to improve your aim, learn a map, or pick a shooter?',
        allowed: ['fps','shooter','aim','crosshair','loadout','weapon','map','recoil','movement','competitive','rank','game','gaming'],
        related: ['esports','sensitivity'],
        synonyms: ['gamer','gameplay'],
        intents: ['improving aim','choosing a loadout','learning a map'],
        starters: ['How can I improve my aim?','Recommend a good FPS to start with','How do I control recoil?','What sensitivity should I use?'],
      },
    },
  },

  Astronomy: {
    themes: ['Space','Midnight'],
    specialties: {
      'Planetary Science': {
        expertise: ['planets','moons','the solar system','planetary geology','atmospheres'],
        welcome: 'What would you like to explore in the solar system?',
        allowed: ['planet','planets','mars','venus','jupiter','saturn','moon','solar system','orbit','atmosphere','crater','rings','asteroid','comet','dwarf planet','space','astronomy','gravity','telescope','eclipse'],
        related: ['nasa','rover','mission','geology'],
        synonyms: ['planetary','celestial','astronomical'],
        intents: ['learning about a planet','understanding orbits','understanding eclipses'],
        starters: ['Why is Mars red?','What is the difference between a planet and a dwarf planet?','How do lunar eclipses work?','Tell me about Saturn’s rings'],
      },
      Astrophysics: {
        expertise: ['stars','black holes','galaxies','cosmology','stellar life cycles'],
        welcome: 'What corner of the universe are we exploring today?',
        allowed: ['star','stars','black hole','galaxy','nebula','supernova','cosmology','universe','big bang','light year','gravity','astrophysics','dark matter','redshift','space','astronomy'],
        related: ['telescope','spectrum','relativity'],
        synonyms: ['astrophysical','cosmic','stellar'],
        intents: ['understanding stars','understanding black holes','understanding the universe'],
        starters: ['How do black holes form?','What happens when a star dies?','What is dark matter?','How big is the observable universe?'],
      },
      Stargazing: {
        expertise: ['constellations','observing','telescopes','night sky events'],
        welcome: 'Planning a night under the stars? Ask me what to look for.',
        allowed: ['stargazing','constellation','night sky','telescope','binoculars','planet','star','moon','meteor','shower','observing','light pollution','space','astronomy'],
        related: ['aurora','eclipse','sky map'],
        synonyms: ['celestial','astronomical'],
        intents: ['finding constellations','choosing a telescope','planning observation'],
        starters: ['What can I see in the night sky tonight?','How do I find the North Star?','What telescope should a beginner buy?','When is the next meteor shower?'],
      },
    },
  },

  Legal: {
    themes: ['Royal','Mono','Slate'],
    specialties: {
      Immigration: {
        expertise: ['immigration','visas','residency','citizenship','immigration procedures','immigration policy'],
        welcome: 'What would you like to know about immigration, visas, or residency?',
        allowed: ['immigration','immigrant','visa','visas','citizenship','residency','permanent residency','green card','work permit','student visa','asylum','naturalization','embassy','consulate','migrate','migration','relocate','move to','moving to','moving abroad','sponsorship','h-1b','h1b'],
        related: ['work authorization','study abroad','border','policy','application'],
        synonyms: ['relocating','emigrate'],
        intents: ['moving to another country','applying for a visa','getting residency','understanding immigration requirements','visa interviews'],
        starters: ['How can I move to the USA from India?','Which visa should I apply for to work abroad?','How does the green card process work?','What are common reasons visa applications get rejected?'],
      },
      'Family Law': {
        expertise: ['marriage','divorce','custody','adoption','family disputes'],
        welcome: 'How can I help with a family law question today?',
        allowed: ['family law','divorce','marriage','custody','child support','alimony','adoption','prenup','guardianship','separation'],
        related: ['court','mediation','settlement'],
        synonyms: ['matrimonial'],
        intents: ['understanding divorce','understanding custody','understanding adoption'],
        starters: ['How does child custody get decided?','What is the difference between separation and divorce?','What is a prenuptial agreement?','How does the adoption process generally work?'],
      },
      'Corporate Law': {
        expertise: ['business formation','contracts','compliance','intellectual property basics','corporate governance'],
        welcome: 'What corporate or business-law question can I help with?',
        allowed: ['corporate law','business','company','contract','agreement','llc','incorporation','shareholder','compliance','merger','acquisition','liability','governance','startup'],
        related: ['trademark','patent','regulation'],
        synonyms: ['commercial law'],
        intents: ['forming a company','understanding a contract','understanding compliance'],
        starters: ['What is the difference between an LLC and a corporation?','What should a basic contract include?','How do I protect my startup’s idea?','What is a shareholder agreement?'],
      },
    },
  },

  Healthcare: {
    themes: ['Slate','Ocean','Forest'],
    specialties: {
      'General Practice': {
        expertise: ['general health','common symptoms','wellness','prevention','when to see a doctor'],
        welcome: 'What health topic can I help you understand today?',
        allowed: ['health','symptom','symptoms','illness','disease','doctor','medicine','treatment','wellness','prevention','fever','pain','infection','diet','sleep','exercise','blood pressure','vaccine'],
        related: ['nutrition','fitness','recovery','clinic'],
        synonyms: ['medical','clinical'],
        intents: ['understanding symptoms','learning about a condition','general wellness advice'],
        starters: ['What are common causes of a headache?','How can I build a healthier sleep routine?','What does blood pressure actually measure?','When should I see a doctor for a fever?'],
        disclaimer: true,
      },
      'Mental Health': {
        expertise: ['stress','anxiety basics','mindfulness','healthy habits','emotional wellbeing'],
        welcome: 'I can share general wellbeing information — what’s on your mind?',
        allowed: ['mental health','stress','anxiety','mindfulness','meditation','wellbeing','mood','burnout','self-care','sleep','relaxation','breathing'],
        related: ['therapy','journaling','habits'],
        synonyms: ['psychological','emotional'],
        intents: ['managing stress','building healthy habits','understanding wellbeing'],
        starters: ['What are some simple ways to manage stress?','Explain a basic breathing exercise','How does sleep affect mood?','What is mindfulness?'],
        disclaimer: true,
      },
    },
  },

  Banking: {
    themes: ['Royal','Slate','Mono'],
    specialties: {
      'Retail Banking': {
        expertise: ['accounts','savings','deposits','cards','everyday banking'],
        welcome: 'How can I help with your everyday banking questions?',
        allowed: ['bank','banking','account','savings','checking','deposit','withdrawal','debit','atm','balance','transfer','statement','overdraft','interest'],
        related: ['budgeting','fees','online banking'],
        synonyms: ['financial'],
        intents: ['opening an account','understanding fees','understanding interest'],
        starters: ['What is the difference between savings and checking?','How does compound interest work?','What is an overdraft fee?','How can I start budgeting my income?'],
      },
      Investment: {
        expertise: ['investing basics','stocks','bonds','funds','risk and diversification'],
        welcome: 'Curious about investing basics? Ask away (educational, not advice).',
        allowed: ['investment','invest','investing','stock','stocks','bond','bonds','mutual fund','etf','portfolio','dividend','risk','diversification','return','market','compound'],
        related: ['retirement','index fund','asset'],
        synonyms: ['financial'],
        intents: ['understanding investing','understanding stocks vs bonds','understanding risk'],
        starters: ['What is the difference between stocks and bonds?','Explain diversification simply','What is an index fund?','How does compound growth help investors?'],
        disclaimer: true,
      },
    },
  },

  Tourism: {
    themes: ['Ocean','Forest','Sunset'],
    specialties: {
      'Trip Planning': {
        expertise: ['itineraries','destinations','budgeting trips','travel tips'],
        welcome: 'Where are you headed? Let’s plan the trip.',
        allowed: ['travel','trip','vacation','holiday','itinerary','destination','flight','hotel','tour','sightseeing','packing','budget travel','backpacking','tourist','landmark'],
        related: ['passport','visa requirements','local transport'],
        synonyms: ['traveling','journey'],
        intents: ['planning a trip','building an itinerary','finding destinations'],
        starters: ['Plan a 3-day itinerary for Paris','What should I pack for a beach vacation?','How do I travel on a tight budget?','Suggest destinations for a first international trip'],
      },
      Hotels: {
        expertise: ['accommodation','hotel types','booking tips','amenities'],
        welcome: 'Looking for the right place to stay? Ask me anything about hotels.',
        allowed: ['hotel','hostel','resort','accommodation','booking','room','check-in','amenities','stay','airbnb','lodging'],
        related: ['reviews','location','budget'],
        synonyms: ['lodging'],
        intents: ['choosing a hotel','understanding booking','finding amenities'],
        starters: ['How do I choose a good hotel?','What is the difference between a hostel and a hotel?','What amenities should I look for?','How can I find good deals on rooms?'],
      },
    },
  },

  Technology: {
    themes: ['Midnight','Terminal','Slate'],
    specialties: {
      Hardware: {
        expertise: ['CPUs and GPUs','PC building and upgrades','component compatibility','cooling and thermals','benchmarks and real-world performance'],
        welcome: 'Building or upgrading? Ask me about parts, compatibility, or performance.',
        allowed: ['hardware','cpu','gpu','processor','graphics card','motherboard','ram','memory','ssd','hdd','storage','power supply','psu','cooling','cooler','thermal paste','overclock','overclocking','bios','chipset','socket','ddr4','ddr5','pcie','nvme','benchmark','bottleneck','intel','amd','ryzen','nvidia','geforce','radeon','rtx','laptop','desktop','pc build','monitor','keyboard'],
        related: ['upgrade path','compatibility','build budget','thermals','power draw'],
        synonyms: ['components','parts','rig','pc'],
        intents: ['choosing a CPU or GPU','building a PC','upgrading a component','comparing two products','fixing overheating'],
        starters: ['Which is better for gaming — Intel or AMD?','What parts do I need for a budget PC build?','How do I stop my CPU from overheating?','What is the difference between DDR4 and DDR5?'],
      },
      Networking: {
        expertise: ['home and office networks','routers and Wi-Fi','IP addressing','troubleshooting connectivity','bandwidth and latency'],
        welcome: 'Network trouble or setup question? Let’s sort it out.',
        allowed: ['network','networking','router','modem','wifi','wi-fi','ethernet','lan','wan','ip address','dns','dhcp','subnet','bandwidth','latency','ping','packet','firewall','vpn','broadband','fiber','5g','signal','access point','mesh network'],
        related: ['speed test','port forwarding','network security'],
        synonyms: ['internet connection','connectivity'],
        intents: ['fixing slow internet','setting up a router','understanding IP addresses','improving wifi coverage'],
        starters: ['Why is my Wi-Fi slower than the speed I pay for?','What is the difference between a router and a modem?','How do I improve Wi-Fi coverage at home?','What does an IP address actually identify?'],
      },
      Cybersecurity: {
        expertise: ['security basics','passwords','phishing','encryption concepts','safe practices'],
        welcome: 'Want to lock things down? Ask me about staying secure.',
        allowed: ['security','cybersecurity','password','phishing','malware','encryption','firewall','vpn','hacker','breach','two-factor','authentication','privacy','vulnerability','antivirus'],
        related: ['network security','data protection'],
        synonyms: ['infosec','cyber'],
        intents: ['staying secure online','understanding phishing','understanding encryption'],
        starters: ['How do I create a strong password?','What is phishing and how do I avoid it?','What does two-factor authentication do?','Explain encryption in simple terms'],
      },
      AI: {
        expertise: ['AI concepts','machine learning basics','neural networks','how models work'],
        welcome: 'Curious about AI? Ask me how it works.',
        allowed: ['ai','artificial intelligence','machine learning','ml','neural network','model','training','dataset','algorithm','deep learning','llm','chatbot','prediction'],
        related: ['data science','automation'],
        synonyms: ['intelligent systems'],
        intents: ['understanding AI','understanding machine learning','how models work'],
        starters: ['What is machine learning, simply?','How does a neural network work?','What is the difference between AI and ML?','How are chatbots trained?'],
      },
    },
  },

  Restaurant: {
    themes: ['Sunset','Amber','Mono'],
    specialties: {
      Menu: {
        expertise: ['dishes','cuisines','ingredients','recommendations','dietary options'],
        welcome: 'Hungry for ideas? Ask me about dishes and cuisines.',
        allowed: ['menu','dish','food','cuisine','recipe','ingredient','meal','starter','dessert','vegetarian','vegan','gluten-free','flavor','pairing','dining'],
        related: ['nutrition','portion','allergen'],
        synonyms: ['culinary','eatery'],
        intents: ['choosing a dish','understanding a cuisine','finding dietary options'],
        starters: ['Suggest a 3-course Italian dinner','What is a good vegetarian main dish?','What wine pairs with grilled salmon?','Explain the difference between ramen and pho'],
      },
    },
  },

  Fashion: {
    themes: ['Sunset','Mono','Amber'],
    specialties: {
      Styling: {
        expertise: ['outfits','color coordination','occasions','wardrobe basics'],
        welcome: 'Let’s put a great look together. What’s the occasion?',
        allowed: ['fashion','style','outfit','clothing','wardrobe','color','accessory','trend','dress','shoes','look','styling','wear','apparel'],
        related: ['seasonal','capsule wardrobe','fabric'],
        synonyms: ['fashionable','trendy'],
        intents: ['building an outfit','coordinating colors','dressing for an occasion'],
        starters: ['What should I wear to a job interview?','How do I build a capsule wardrobe?','Which colors go well together?','How do I dress smart-casual?'],
      },
    },
  },
};

// Cross-domain exclusions used to build each bot's excludedTopics.
const GLOBAL_TOPIC_POOL = {
  programming: ['python','java','javascript','code','coding','programming','algorithm','matplotlib','software'],
  cooking:     ['recipe','biryani','cooking','ingredient'],
  automotive:  ['car repair','engine repair','oil change','tire'],
  finance:     ['stock market','bank interest rate','loan','mortgage'],
  medical:     ['diagnosis','prescription','symptom'],
  gaming:      ['rpg','fps','video game','character build'],
  legal:       ['visa','immigration','lawsuit'],
  sports:      ['cricket match','football score','live score'],
};

// ---------------------------------------------------------------------------
function pickSpecialty(domain) {
  const specialties = Object.keys(DOMAIN_DATA[domain].specialties);
  return rand(specialties);
}

function generateName(domain, specialty) {
  const roots = {
    Education:['Lumen','Scholar','Mentor','Sage','Nova','Aster'],
    Gaming:['Vortex','Pixel','Rift','Blaze','Quest','Nyx'],
    Astronomy:['Orbit','Nova','Cosmos','Stella','Apex','Helios'],
    Legal:['Justia','Lex','Meridian','Sterling','Verdict','Aegis'],
    Healthcare:['Vitalis','Care','Pulse','Sana','Aster','Remedy'],
    Banking:['Ledger','Vault','Sterling','Fortuna','Meridian','Capital'],
    Tourism:['Voyage','Wander','Compass','Atlas','Journey','Zephyr'],
    Technology:['Synapse','Cipher','Nexus','Byte','Quanta','Circuit'],
    Restaurant:['Savor','Ember','Basil','Gusto','Palate','Hearth'],
    Fashion:['Vogue','Attire','Luxe','Muse','Atelier','Drape'],
  };
  const root = rand(roots[domain] || ['Nova','Apex','Core','Lumen']);
  const styleRoll = Math.random();
  if (styleRoll < 0.5) return root;                       // e.g. "Lumen"
  if (styleRoll < 0.8) return `${root} ${domain}`;        // e.g. "Lumen Education"
  return `${root} AI`;                                    // e.g. "Lumen AI"
}

function buildSystemPrompt({ name, domain, specialty, spec, personality, profile }) {
  const expertise = profile?.coreConcepts ? profile.coreConcepts.map(e => `- ${e}`).join('\n') : spec.expertise.map(e => `- ${e}`).join('\n');
  const questionTypes = profile?.questionTypes ? profile.questionTypes.map(q => `- ${q}`).join('\n') : '- General domain questions';
  const outOfDomainBehavior = profile?.boundaries ? profile.boundaries : `If a question is clearly unrelated to ${specialty}, briefly and politely explain what you specialize in.`;
  
  const disclaimer = spec.disclaimer
    ? `\n\nIMPORTANT: Provide general, educational information only. You are not a licensed professional; for personal decisions, advise the user to consult a qualified expert.`
    : '';
  return `You are ${name}, a specialized ${domain} assistant focused on ${specialty}.

Your expertise covers:
${expertise}

You are capable of understanding and answering the following types of questions within your domain:
${questionTypes}

Rules of behavior:
- You are a domain specialist, NOT a generic assistant.
- IF the user's question is logically within the domain of ${domain} and ${specialty}, you MUST answer the actual question directly using your domain expertise. Do not refuse simply because the exact question or wording was not predefined.
- ${outOfDomainBehavior}
- Be accurate. If you are unsure, say so rather than inventing details.
- Format answers in clean Markdown (short paragraphs, lists, and code blocks where useful).

Personality: ${personality.name}. ${personality.style}${disclaimer}`;
}

function buildExcluded(domain, allowedSet) {
  // Pull topics from OTHER domains' pools that this bot does not cover.
  const keep = [];
  for (const [, words] of Object.entries(GLOBAL_TOPIC_POOL)) {
    for (const w of words) {
      if (![...allowedSet].some(a => a.includes(w) || w.includes(a))) keep.push(w);
    }
  }
  return [...new Set(keep)];
}

function buildDesignDNA(domain) {
  const preferred = DOMAIN_DATA[domain].themes || ALL_THEMES;
  // 75% domain-appropriate theme, 25% wildcard for variety
  const theme = Math.random() < 0.75 ? rand(preferred) : rand(ALL_THEMES);
  const p = THEME_PALETTES[theme];

  let layout, messageStyle;
  if (theme === 'Terminal') {
    layout = 'Focus'; messageStyle = 'Compact';
  } else {
    layout = rand(LAYOUTS);
    messageStyle = rand(MESSAGE_STYLES);
  }
  const background = p.mode === 'dark' ? rand(['Solid','Gradient','Mesh']) : rand(BACKGROUNDS);

  return {
    theme,
    mode: p.mode,
    layout,
    messageStyle,
    backgroundStyle: background,
    fontFamily: p.mono ? "'JetBrains Mono', ui-monospace, monospace" : rand(FONTS),
    mono: !!p.mono,
    borderRadius: p.mono ? '4px' : (Math.random() < 0.5 ? '12px' : '18px'),
    // full palette
    bg: p.bg, surface: p.surface, surface2: p.surface2, text: p.text,
    muted: p.muted, border: p.border, primaryColor: p.primary, accentColor: p.accent,
    // legacy field kept for the DB `theme`/color columns and old code paths
    secondaryColor: p.surface2,
  };
}

async function generateDomainIntelligence(domain, specialty, spec, allowedSet) {
  const baseProfile = {
    domain,
    specialty,
    description: `${domain} assistance focused on ${specialty}: ${spec.expertise.slice(0, 5).join(', ')}.`,
    allowedTopics: [...new Set([specialty.toLowerCase(), domain.toLowerCase(), ...spec.allowed])],
    relatedTopics: spec.related || [],
    synonyms: spec.synonyms || [],
    commonIntents: spec.intents || [],
    excludedTopics: buildExcluded(domain, allowedSet),
  };

  if (!groq) return baseProfile;

  const prompt = `Generate a comprehensive "Domain Intelligence Package" in JSON format for a chatbot specialized in the domain "${domain}" and specialty "${specialty}".

The JSON must contain the following keys exactly:
- "description": A 1-2 sentence description of this specialty.
- "coreConcepts": Array of 10-15 core concepts this bot understands.
- "entities": Array of 10-15 named entities, tools, products, or major terms relevant to this field.
- "synonyms": Array of 10-15 alternative ways users might refer to terms in this field.
- "semanticRelationships": Array of 5-10 relationship facts (e.g. "Moon -> orbits -> Earth", "HTML -> structures -> Webpage").
- "questionTypes": Array of 8-12 types of questions users ask (e.g., "Calculations of...", "Comparisons between...", "Troubleshooting for...", "Why questions about...").
- "commonIntents": Array of 8-12 common user intents (e.g., "understanding a concept", "finding a recommendation").
- "boundaries": A 1-2 sentence rule explaining what topics strictly DO NOT belong to this bot, acting as a boundary for out-of-domain rejection.

Make the output robust, highly relevant, and formatted as a strict JSON object.`;

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });
    
    const generated = JSON.parse(completion.choices[0].message.content);
    
    return {
      domain,
      specialty,
      description: generated.description || baseProfile.description,
      allowedTopics: [...new Set([...baseProfile.allowedTopics, ...(generated.coreConcepts || []), ...(generated.entities || [])])],
      relatedTopics: baseProfile.relatedTopics,
      synonyms: [...new Set([...baseProfile.synonyms, ...(generated.synonyms || [])])],
      commonIntents: [...new Set([...baseProfile.commonIntents, ...(generated.commonIntents || [])])],
      excludedTopics: baseProfile.excludedTopics,
      semanticRelationships: generated.semanticRelationships || [],
      questionTypes: generated.questionTypes || [],
      boundaries: generated.boundaries || ''
    };
  } catch (error) {
    console.error("Failed to generate Domain Intelligence Package:", error);
    return baseProfile;
  }
}

export async function generateSingleBot() {
  const domain = rand(Object.keys(DOMAIN_DATA));
  const specialty = pickSpecialty(domain);
  const spec = DOMAIN_DATA[domain].specialties[specialty];
  const personality = rand(PERSONALITIES);
  const name = generateName(domain, specialty);
  const designDna = buildDesignDNA(domain);

  const allowedTopics = [...new Set([specialty.toLowerCase(), domain.toLowerCase(), ...spec.allowed])];
  const allowedSet = new Set(allowedTopics.map(a => a.toLowerCase()));
  
  const domainProfile = await generateDomainIntelligence(domain, specialty, spec, allowedSet);

  return {
    id: uid(),
    name,
    domain,
    subdomain: specialty,
    description: `A ${personality.name.toLowerCase()} ${domain.toLowerCase()} assistant specializing in ${specialty}.`,
    personality: personality.name,
    systemPrompt: buildSystemPrompt({ name, domain, specialty, spec, personality, profile: domainProfile }),
    welcomeMessage: spec.welcome,
    starterQuestions: (spec.starters || []).slice(0, 4),
    domainProfile,
    // Offline monogram avatar: the UI renders initials on the bot's primary color.
    avatar: '',
    designDna,
    createdAt: Date.now(),
  };
}
