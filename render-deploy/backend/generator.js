import Groq from 'groq-sdk';
import { DOMAIN_DATA } from './domainData.js';

/**
 * ============================================================
 * SCARLET BOT GENERATOR
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
  Grape:      { mode:'dark',  bg:'#0e0712', surface:'#190e22', surface2:'#241433', text:'#fae8ff', muted:'#c084fc', border:'#581c87', primary:'#c084fc', accent:'#e879f9' },
  Mono:       { mode:'light', bg:'#fafafa', surface:'#ffffff', surface2:'#f4f4f5', text:'#18181b', muted:'#71717a', border:'#e4e4e7', primary:'#18181b', accent:'#52525b' },
};
const ALL_THEMES = Object.keys(THEME_PALETTES);

const LAYOUTS        = ['Sidebar', 'Center', 'Focus'];
const MESSAGE_STYLES = ['Bubbles', 'Cards', 'Compact'];
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
// Cross-domain exclusions used to build each bot's excludedTopics.
// Expanded so the Domain Guard can positively recognise OTHER fields.
// ---------------------------------------------------------------------------
const GLOBAL_TOPIC_POOL = {
  programming: ['python','java','javascript','code','coding','programming','algorithm','matplotlib','software','react','typescript','git'],
  cooking:     ['recipe','biryani','cooking','ingredient','pasta','pizza','curry','dough','bake'],
  automotive:  ['car repair','engine repair','oil change','tire','brake','motorcycle','ev charging'],
  finance:     ['stock market','bank interest rate','loan','mortgage','investing','dividend','crypto','bitcoin'],
  medical:     ['diagnosis','prescription','symptom','doctor','vaccine','cpr'],
  gaming:      ['rpg','fps','video game','character build','quest','leveling'],
  legal:       ['visa','immigration','lawsuit','contract','trademark','patent'],
  sports:      ['cricket match','football score','live score','nba','soccer'],
  travel:      ['flight booking','hotel','vacation','itinerary','airport'],
  music:       ['guitar','piano','songwriting','mixing','beat','dj'],
  psychology:  ['cognitive bias','therapy','behaviorism','memory','attachment'],
  environment: ['renewable','solar panel','recycling','carbon footprint','climate change'],
  photography: ['aperture','shutter','lens','lightroom','portrait'],
  marketing:   ['seo','ppc','google ads','funnel','branding'],
  education:   ['lesson plan','phonics','curriculum','grading','esl'],
};

// ---------------------------------------------------------------------------
function pickSpecialty(domain) {
  const specialties = Object.keys(DOMAIN_DATA[domain].specialties);
  return rand(specialties);
}

const NAME_ROOTS = {
  Education:['Lumen','Scholar','Mentor','Sage','Nova','Aster','Wisdom','Apex'],
  Gaming:['Vortex','Pixel','Rift','Blaze','Quest','Nyx','Combo','Crit'],
  Astronomy:['Orbit','Nova','Cosmos','Stella','Apex','Helios','Zenith','Astral'],
  Legal:['Justia','Lex','Meridian','Sterling','Verdict','Aegis','Tribunal','Counsel'],
  Healthcare:['Vitalis','Care','Pulse','Sana','Aster','Remedy','Medico','Heal'],
  Banking:['Ledger','Vault','Sterling','Fortuna','Meridian','Capital','Fiscal','Yield'],
  Technology:['Synapse','Cipher','Nexus','Byte','Quanta','Circuit','Kernel','Pulse'],
  Tourism:['Voyage','Wander','Compass','Atlas','Journey','Zephyr','Roam','Explore'],
  Restaurant:['Savor','Ember','Basil','Gusto','Palate','Hearth','Simmer','Morsel'],
  Fashion:['Vogue','Attire','Luxe','Muse','Atelier','Drape','Silhouette','Runway'],
  Finance:['Fortuna','Bullion','Harbor','Mint','Capital','Ledger','Treasury','Wealth'],
  'Food & Cooking':['Savor','Ember','Basil','Gusto','Palate','Hearth','Simmer','Morsel'],
  Travel:['Voyage','Wander','Compass','Atlas','Journey','Zephyr','Roam','Explore'],
  Sports:['Apex','Velocity','Summit','Pulse','Enduro','Impact','Stride','Dynamo'],
  Entertainment:['Reel','Screen','Beat','Scene','Nova','Cue','Starlight','Projector'],
  Business:['Meridian','Summit','Vertex','Strategy','Pinnacle','Harvest','Clarity','Momentum'],
  Science:['Quantum','Prism','Veritas','Element','Curio','Lumen','Syntheti','Axiom'],
  Creative:['Palette','Muse','Brush','Verse','Sketch','Color','Canvas','Inkwell'],
  'Home & Garden':['Hearth','Bloom','Homestead','Nest','Verdant','Trellis','Patch','Aurelia'],
  Automotive:['Torque','Piston','Revline','Drivetrain','Apex','Charger','Gear','AutoPilot'],
  Agriculture:['Harvest','Field','Terra','Cropwise','Verdant','Sow&Grow','Tiller','Acres'],
  Architecture:['Forma','Blueprint','Atrium','Structura','Facade','Plinth','Cantilever','Vault'],
  Aviation:['Aero','Skyline','Altitude','Wingman','Cockpit','Ascend','Vector','Flightsim'],
  'Beauty & Skincare':['Lumina','Glow','Radiance','Velvet','Bloom','Sienna','Petal','Aura'],
  Construction:['Craftsman','BuildRight','Formwork','Beam&Co','Foundry','Stucco','Level','Mason'],
  Design:['Forma','Canvas','Glyph','Modulo','Pixel','Linea','Curvature','Emblem'],
  Economics:['Equilibrium','Marketscope','Supply&Co','MacroMind','Fiscal','Yield','Ledger','Elastic'],
  Engineering:['Mechanica','Structura','Volt','Torque','Cadence','Fluxion','Ductile','Anvil'],
  Environment:['EcoNova','Verdana','Terra','Elysia','Greenly','Carbonia','Epoch','Aurora'],
  Geography:['Atlas','Meridian','Terrain','GlobeWise','Latitude','Compass','Pangea','Carto'],
  'Government & Politics':['Civica','Republic','Framer','Senate','Polity','Elector','Charter','Legislia'],
  Hospitality:['Guestly','Pleasure','Hostess','Courtyard','BellaStay','Concierge','Tavola','Reception'],
  Insurance:['Securex','Coverage','Safeguard','Policywise','Assura','Reliance','Shielded','Actuary'],
  Journalism:['Byline','Reporta','Dateline','Pressman','Scribe','Ledger','Broadcast','Editoria'],
  'Logistics & Supply Chain':['Freightly','SupplyWise','CargoLink','Routewell','Dispatch','Pallet','Voyager','Logis'],
  Manufacturing:['Forge','Fabricata','Millwright','Produceo','Output','Lathe','Foundry','Assembly'],
  Marketing:['Growthly','BrandNova','Convertly','Reach','Amplify','Traffic','Clickwise','Engage'],
  Music:['Melodia','Crescendo','Tempo','Riff','Chordia','Harmony','Pitch','Staccato'],
  Philosophy:['Sophia','Logos','Eudaimonia','Noema','Aletheia','Arete','Reason','Theoria'],
  Photography:['Aperture','Shutter','Lumina','Fstop','Pixel','Exposure','Framely','Snapshot'],
  Psychology:['Psyche','Mindscape','Cognito','Insight','Eunoia','Therapy','Mindful','Percept'],
  'Real Estate':['EstateWise','Valua','Mortgable','Realtia','Lotwell','Appraise','Homesite','Equitable'],
  Retail:['Storefront','Marketia','RetailWise','Merchant','ShelfLife','Checkout','Boutique','Vendly'],
  Security:['Sentinelle','Guardian','Aegis','Vigilance','Shieldworks','PatrolX','Fortress','Defense'],
  'Social Media':['Viralia','Trend','Followed','Influenza','Postera','Engage','Retweet','Follower'],
  Teaching:['Schola','Mentora','Pedagogy','Learnwell','TutorX','Acedemia','Guidance','Lessons'],
  Writing:['Scribe','Wordwright','Quill','Prose','Inkwell','Lexicon','Stanza','Narrativa'],
};

function generateName(domain) {
  const root = rand(NAME_ROOTS[domain] || ['Nova','Apex','Core','Lumen']);
  const styleRoll = Math.random();
  if (styleRoll < 0.5) return root;                       // e.g. "Lumen"
  if (styleRoll < 0.8) return `${root} ${domain}`;        // e.g. "Lumen Education"
  return `${root} AI`;                                    // e.g. "Lumen AI"
}

/**
 * Rich, expert-grade system prompt (roughly 400-550 words) following the
 * Scarlet template: expertise, terminology, personality, response style,
 * question types, intents, practical guidance, key facts, boundaries,
 * and conversation style.
 */
function buildSystemPrompt({ name, domain, specialty, spec, personality, profile }) {
  const expertiseList = profile?.coreConcepts?.length ? profile.coreConcepts : spec.expertise;
  const expertise = expertiseList.map(e => `- ${e}`).join('\n');
  const related = (spec.related || []).length
    ? (spec.related || []).map(t => `- ${t}`).join('\n')
    : '- Adjacent practical knowledge within the same field';
  const intents = profile?.commonIntents?.length ? profile.commonIntents : (spec.intents || []);
  const intentsList = intents.map(i => `- ${i}`).join('\n');
  const questionTypes = profile?.questionTypes?.length
    ? profile.questionTypes.map(q => `- ${q}`).join('\n')
    : '- General questions and explanations\n- Comparisons and recommendations\n- Step-by-step how-to questions\n- Troubleshooting and common problems';
  const boundaries = profile?.boundaries
    ? profile.boundaries
    : `You ONLY discuss ${domain} and ${specialty} topics. For questions clearly outside this field, politely explain your specialization and redirect the user back to ${domain}.`;

  const synonymsList = profile?.synonyms?.length
    ? profile.synonyms.slice(0, 8).map(s => `- ${s}`).join('\n')
    : (spec.synonyms || []).map(s => `- ${s}`).join('\n') || '- Common alternate phrasings users may use';

  const entitiesList = profile?.entities?.length
    ? profile.entities.slice(0, 8).map(s => `- ${s}`).join('\n')
    : null;

  const facts = profile?.semanticRelationships?.length
    ? profile.semanticRelationships.slice(0, 6).map(r => `- ${r}`).join('\n')
    : null;

  const disclaimer = spec.disclaimer
    ? '\n- For medical, legal, or financial matters, provide general educational information only. You are not a licensed professional — advise the user to consult a qualified expert for personal decisions.'
    : '';

  return `You are "${name}", a specialized ${domain} assistant operating exclusively within the domain of ${specialty}.

YOUR EXPERTISE COVERS:
${expertise}
- Practical applications and common use cases
- Established principles, terminology, and best practices in ${specialty}
- How concepts connect to real-world situations and everyday decisions
- Comparisons between approaches, tools, or techniques where relevant
- Common mistakes, pitfalls, and how to avoid them

TERMINOLOGY YOU UNDERSTAND:
${synonymsList}
${entitiesList ? `\nKEY ENTITIES AND PRODUCTS:\n${entitiesList}` : ''}
${related ? `\nRELATED KNOWLEDGE AREAS (answer confidently about these too):\n${related}` : ''}

YOUR PERSONALITY:
${personality.name}. ${personality.style}

HOW YOU RESPOND:
- Always provide detailed, accurate, and helpful answers within ${domain} and ${specialty}.
- Use examples and analogies when explaining complex topics.
- Ask clarifying questions when the user's intent is unclear.
- Provide step-by-step guidance for procedural questions.
- Include relevant tips, warnings, and best practices.
- Cite general principles and established knowledge rather than inventing specifics.
- Answer multi-part questions completely — address every part the user asked.
- When a question touches a topic adjacent to ${specialty} (its tools, related fields, or common usage), answer it helpfully while keeping the focus on ${domain}.

TYPES OF QUESTIONS YOU HANDLE:
${questionTypes}

COMMON USER INTENTS:
${intentsList}

PRACTICAL GUIDANCE:
- Break multi-step processes into numbered, actionable instructions.
- When a choice exists, present the options with trade-offs so the user can decide.
- Explain terminology in plain language the first time it appears.
- Anticipate the follow-up a user is likely to ask and pre-empt it.
- Offer concrete, realistic examples drawn from everyday ${domain} practice.
- For "explain like I'm new" requests, simplify without losing accuracy.
- For advanced users, go deeper: mention edge cases, nuance, and advanced techniques.${facts ? `\n\nKEY FACTS YOU CAN RELY ON:\n${facts}` : ''}

BOUNDARIES:
- ${boundaries}
- Never fabricate information — if unsure, say so.
- Format answers in clean Markdown (short paragraphs, lists, and code blocks where useful).${disclaimer}

CONVERSATION HANDLING:
- When the user shares a personal experience, story, or statement about themselves related to your field (for example "I got my sweet tooth at age 8" or "I had a dental surgery"), respond directly and warmly to what they said. Do NOT reply "it seems like you meant X" or claim the message is unclear.
- When the user continues or elaborates on their previous message, respond to the new information directly instead of re-asking what they meant.
- Interpret casual phrasing and typos sensibly ("I have done my dental surger on age 8" means they had dental surgery at age 8).
- Only ask for clarification when a real question is missing essential details.
- Acknowledge the user's experience with empathy, then add useful information or a relevant follow-up question.

CONVERSATION STYLE:
- Be ${personality.name.toLowerCase()} and helpful in every exchange.
- Use clear, domain-appropriate language that stays informative without overwhelming.
- Keep responses focused and well-structured.
- End with follow-up suggestions when appropriate, inviting the user to go deeper.`;
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
  const background = p.mode === 'dark' ? rand(['Solid','Gradient','Mesh','Grid','Dots','Orbits']) : rand(['Solid','Gradient','Mesh','Grid','Dots']);

  // Per-bot visual identity so 100 bots never look like the same skin with
  // different colors: avatar geometry, corner scale, glow, display font.
  const avatarShape = p.mono ? 'square' : rand(['round', 'squircle', 'squircle', 'round', 'square']);
  const radiusScale = p.mono ? 'sharp' : rand(['soft', 'soft', 'medium', 'medium', 'sharp']);
  const accentGlow = p.mode === 'dark' ? Math.random() < 0.5 : Math.random() < 0.25;
  const headingFont = p.mono
    ? "'JetBrains Mono', ui-monospace, monospace"
    : rand(['inherit', 'inherit', 'inherit', "'Georgia', 'Times New Roman', serif", "'Palatino Linotype', 'Book Antiqua', Palatino, serif"]);

  return {
    theme,
    mode: p.mode,
    layout,
    messageStyle,
    backgroundStyle: background,
    fontFamily: p.mono ? "'JetBrains Mono', ui-monospace, monospace" : rand(FONTS),
    headingFont,
    mono: !!p.mono,
    avatarShape,
    radiusScale,
    accentGlow,
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
  const name = generateName(domain);
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
