/**
 * ============================================================
 * SHARED DOMAIN LEXICON
 * ------------------------------------------------------------
 * A rich vocabulary for every domain and specialty, including the
 * BRAND / PRODUCT / ENTITY names real users actually type
 * ("Intel", "AMD", "Ryzen", "RTX", "H-1B", "ETF", "Airbnb"...).
 *
 * Why this file exists:
 *   A bot's stored domainProfile is a snapshot taken when the bot was
 *   generated. Older bots in the database have thin profiles, so the
 *   Domain Guard had almost no evidence that a question was on-topic and
 *   wrongly refused things like "Which is better, Intel or AMD?".
 *   These lists are looked up by DOMAIN and SPECIALTY NAME at request
 *   time, so every bot — including ones generated months ago — gets the
 *   full vocabulary without being regenerated.
 *
 * Two jobs:
 *   lexiconFor()        -> evidence that a question IS in the bot's field
 *   foreignLexiconFor() -> evidence that a question belongs to a DIFFERENT
 *                          field (this is what keeps off-topic redirects
 *                          working deterministically, with no AI call)
 *
 * Curation rule: only distinctive terms. Generic words like "model",
 * "system", "performance", "price" or "best" are deliberately excluded —
 * they would match everything and make the guard meaningless.
 * ============================================================
 */

// Keys are matched against `${domain} ${subdomain}`.toLowerCase().
// A bot inherits every list whose key appears in that string.
export const DOMAIN_LEXICON = {
  // ---------------------------------------------------------------- Technology
  technology: [
    'technology', 'tech', 'computer', 'device', 'gadget', 'digital', 'electronics',
    'operating system', 'windows', 'linux', 'macos', 'android', 'ios', 'firmware', 'driver'
  ],
  hardware: [
    'hardware', 'cpu', 'gpu', 'ram', 'ssd', 'hdd', 'psu', 'apu', 'tdp', 'vram',
    'processor', 'graphics card', 'video card', 'motherboard', 'mainboard', 'chipset',
    'socket', 'memory', 'hard drive', 'solid state', 'storage', 'power supply',
    'cooling', 'cooler', 'heatsink', 'thermal paste', 'liquid cooling', 'airflow',
    'overclock', 'overclocking', 'undervolt', 'bios', 'uefi', 'benchmark', 'bottleneck',
    'ddr4', 'ddr5', 'pcie', 'nvme', 'sata', 'transistor', 'semiconductor', 'silicon',
    'intel', 'amd', 'ryzen', 'threadripper', 'core i3', 'core i5', 'core i7', 'core i9',
    'nvidia', 'geforce', 'radeon', 'rtx', 'gtx', 'snapdragon', 'apple silicon',
    'laptop', 'desktop', 'pc build', 'build a pc', 'rig', 'workstation', 'peripheral',
    'keyboard', 'mouse', 'monitor', 'refresh rate', 'resolution', 'wattage', 'watts', 'rgb',
    // Performance wording hardware users actually type. Listing these here means
    // they count as IN-field for a hardware bot instead of reading as "gaming".
    'fps', 'frame rate', 'frames per second', 'gaming pc', 'gaming performance',
    'thermal throttling', 'throttling', 'upgrade',
    // Product-line wording ("Ryzen 9 series", "RTX 40 series").
    'generation', 'component', 'components'
  ],
  software: [
    'software', 'application', 'app', 'install', 'installation', 'update', 'patch',
    'license', 'operating system', 'windows', 'linux', 'macos', 'driver', 'utility'
  ],
  networking: [
    'network', 'networking', 'router', 'modem', 'wifi', 'wi-fi', 'ethernet', 'lan', 'wan',
    'ip address', 'dns', 'dhcp', 'subnet', 'bandwidth', 'latency', 'ping', 'packet',
    'switch', 'firewall', 'vpn', 'broadband', 'fiber', '5g', 'protocol', 'tcp'
  ],
  'web development': [
    'web development', 'website', 'frontend', 'backend', 'html', 'css', 'react',
    'javascript', 'node', 'api', 'http', 'browser', 'responsive', 'framework', 'database'
  ],
  cloud: [
    'cloud', 'aws', 'azure', 'google cloud', 'server', 'hosting', 'deployment',
    'container', 'docker', 'kubernetes', 'serverless', 'scaling', 'virtual machine'
  ],
  cybersecurity: [
    'security', 'cybersecurity', 'password', 'passwords', 'phishing', 'malware', 'virus',
    'ransomware', 'encryption', 'firewall', 'vpn', 'hacker', 'hacking', 'breach', 'leak',
    'two-factor', '2fa', 'authentication', 'privacy', 'vulnerability', 'antivirus',
    'spyware', 'exploit', 'penetration testing', 'zero-day', 'ssl', 'https', 'certificate',
    // Shared with Banking on purpose: "how do I secure my account" must not read
    // as a banking question when asked of a security bot.
    'account', 'scam', 'fraud', 'identity theft'
  ],
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
    'llm', 'large language model', 'language model', 'chatbot', 'training data', 'dataset',
    'inference', 'transformer', 'gpt', 'chatgpt', 'claude', 'gemini', 'llama', 'openai',
    'anthropic', 'hugging face', 'fine-tuning', 'fine tuning', 'prompt', 'embedding',
    'token', 'hallucinate', 'hallucination', 'computer vision', 'nlp',
    // 'language' is shared with the Languages specialty on purpose: "why do
    // language models hallucinate" is an AI question, not a grammar question.
    'language', 'natural language', 'reinforcement learning', 'supervised'
  ],
  'data science': [
    'data science', 'data analysis', 'statistics', 'dataset', 'pandas', 'visualization',
    'regression', 'clustering', 'correlation', 'feature', 'analytics', 'big data'
  ],

  // ---------------------------------------------------------------- Education
  // NOTE: bare verbs like "learn" and "study" are deliberately absent — every
  // domain's users say "I want to learn X", so they would misfire as evidence
  // that a question belongs to Education rather than to the bot's own field.
  education: [
    'student', 'teacher', 'lesson', 'course', 'class', 'classroom', 'lecture',
    'exam', 'homework', 'syllabus', 'curriculum', 'school', 'college',
    'university', 'revision', 'assignment', 'tutorial'
  ],
  languages: [
    'language', 'languages', 'grammar', 'vocabulary', 'translation', 'translate',
    'pronunciation', 'linguistics', 'english', 'spanish', 'french', 'german', 'japanese',
    'mandarin', 'hindi', 'sentence', 'phrase', 'tense', 'verb', 'noun', 'adjective',
    'conjugation', 'fluency', 'fluent', 'idiom', 'dialect', 'accent', 'writing', 'reading',
    'speaking', 'synonym', 'antonym', 'spelling', 'punctuation', 'preposition', 'pronoun'
  ],
  programming: [
    'programming', 'code', 'coding', 'python', 'java', 'javascript', 'typescript', 'c++',
    'algorithm', 'data structure', 'function', 'variable', 'loop', 'recursion', 'debugging',
    'compiler', 'syntax', 'array', 'class', 'object', 'pointer', 'runtime', 'repository', 'git',
    'tuple', 'dictionary', 'iterator', 'stack', 'queue', 'boolean', 'integer', 'string'
  ],
  mathematics: [
    'math', 'maths', 'mathematics', 'algebra', 'calculus', 'geometry', 'statistics',
    'equation', 'derivative', 'integral', 'probability', 'theorem', 'fraction', 'matrix',
    'trigonometry', 'logarithm', 'polynomial', 'vector', 'proof', 'arithmetic',
    'function', 'variable', 'infinite series', 'sequence', 'geometric', 'algebraic'
  ],
  physics: [
    'physics', 'force', 'energy', 'motion', 'velocity', 'acceleration', 'gravity',
    'electricity', 'magnetism', 'thermodynamics', 'quantum', 'relativity', 'momentum',
    'newton', 'einstein', 'friction', 'wavelength', 'photon', 'entropy', 'kinetic',
    // Words physics questions genuinely use. Several are multi-listed on purpose
    // (e.g. "object" is also programming, "circuit" is also hardware) — a bot
    // subtracts its own terms from its foreign set, so multi-listing a word makes
    // it neutral for the fields that share it instead of off-topic evidence.
    'object', 'objects', 'vacuum', 'mass', 'voltage', 'circuit', 'resistance',
    'ampere', 'free fall', 'pressure', 'density', 'wave', 'optics', 'lens',
    'lever', 'pulley', 'inclined plane', 'simple machine', 'torque', 'joule'
  ],
  chemistry: [
    'chemistry', 'chemical', 'molecule', 'atom', 'element', 'compound', 'reaction',
    'periodic table', 'acid', 'alkaline', 'ph', 'bond', 'ion', 'catalyst', 'organic chemistry'
  ],
  biology: [
    'biology', 'cell', 'dna', 'gene', 'genetics', 'evolution', 'organism', 'species',
    'photosynthesis', 'ecosystem', 'bacteria', 'protein', 'enzyme', 'chromosome'
  ],
  history: [
    'history', 'historical', 'ancient', 'medieval', 'empire', 'revolution', 'civilization',
    'dynasty', 'century', 'treaty', 'world war', 'renaissance', 'colonial', 'archaeology',
    'caesar', 'napoleon', 'cleopatra', 'pharaoh', 'emperor', 'king', 'queen', 'monarchy',
    'battle of', 'independence', 'aqueduct'
  ],

  // ---------------------------------------------------------------- Gaming
  gaming: [
    'game', 'games', 'gaming', 'gamer', 'gameplay', 'video game', 'playthrough', 'console',
    'playstation', 'ps5', 'xbox', 'nintendo', 'switch', 'steam', 'multiplayer', 'co-op',
    'speedrun', 'walkthrough', 'patch notes', 'dlc', 'esports', 'streamer'
  ],
  rpg: [
    'rpg', 'role-playing', 'role playing', 'jrpg', 'mmorpg', 'character build', 'skill tree',
    'quest', 'loot', 'levelling', 'leveling', 'grinding', 'npc', 'open world', 'dungeon',
    'party composition', 'mage', 'paladin', 'rogue', 'lore', 'elden ring', 'skyrim', 'witcher'
  ],
  fps: [
    'fps', 'shooter', 'aim', 'crosshair', 'loadout', 'recoil', 'sensitivity', 'headshot',
    'killstreak', 'respawn', 'valorant', 'counter-strike', 'call of duty', 'overwatch', 'apex'
  ],
  strategy: [
    'strategy', 'rts', '4x', 'turn-based', 'build order', 'tactics', 'tech tree',
    'resource management', 'civilization', 'starcraft', 'age of empires', 'total war',
    // Shared with History on purpose — "how do I expand my empire?" is a
    // strategy-game question when asked of a strategy bot.
    'empire', 'military', 'army', 'units', 'base building', 'economy vs military',
    'expand', 'expansion', 'scouting', 'rush'
  ],

  // ---------------------------------------------------------------- Astronomy
  astronomy: [
    'astronomy', 'space', 'telescope', 'orbit', 'cosmic', 'celestial', 'nasa', 'esa',
    'spacecraft', 'satellite', 'observatory', 'light year', 'universe', 'eclipse'
  ],
  'planetary science': [
    'planet', 'planets', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus',
    'neptune', 'pluto', 'moon', 'solar system', 'atmosphere', 'crater', 'asteroid',
    'comet', 'meteorite', 'dwarf planet', 'rover', 'perseverance', 'curiosity'
  ],
  astrophysics: [
    'astrophysics', 'star', 'stars', 'black hole', 'galaxy', 'nebula', 'supernova',
    'cosmology', 'big bang', 'dark matter', 'dark energy', 'redshift', 'quasar',
    'pulsar', 'neutron star', 'white dwarf', 'event horizon', 'milky way'
  ],
  stargazing: [
    'stargazing', 'constellation', 'night sky', 'binoculars', 'meteor shower',
    'light pollution', 'observing', 'sky map', 'aurora', 'orion', 'north star', 'polaris'
  ],

  // ---------------------------------------------------------------- Legal
  legal: [
    'law', 'legal', 'lawyer', 'attorney', 'court', 'rights', 'statute', 'regulation',
    'legislation', 'clause', 'liability', 'jurisdiction', 'filing', 'petition', 'appeal'
  ],
  immigration: [
    'immigration', 'immigrant', 'visa', 'visas', 'citizenship', 'residency', 'green card',
    'permanent residency', 'work permit', 'student visa', 'asylum', 'refugee',
    'naturalization', 'embassy', 'consulate', 'migrate', 'migration', 'relocate',
    'move to', 'moving to', 'moving abroad', 'settle abroad', 'sponsorship', 'h-1b', 'h1b',
    'f-1', 'l-1', 'pr card', 'deportation', 'port of entry', 'biometrics', 'uscis'
  ],
  'family law': [
    'family law', 'divorce', 'marriage', 'custody', 'child support', 'alimony', 'adoption',
    'prenup', 'prenuptial', 'guardianship', 'separation', 'spousal', 'maintenance'
  ],
  'corporate law': [
    'corporate law', 'company', 'contract', 'agreement', 'llc', 'incorporation',
    'shareholder', 'compliance', 'merger', 'acquisition', 'governance', 'startup',
    'trademark', 'patent', 'intellectual property', 'nda', 'due diligence'
  ],

  // ---------------------------------------------------------------- Healthcare
  healthcare: [
    'health', 'healthcare', 'doctor', 'clinic', 'hospital', 'patient', 'medicine',
    'treatment', 'wellness', 'prevention', 'nurse', 'medical'
  ],
  'general practice': [
    'symptom', 'symptoms', 'illness', 'disease', 'fever', 'headache', 'pain', 'infection',
    'cough', 'cold', 'flu', 'blood pressure', 'cholesterol', 'diabetes', 'vaccine',
    'immunity', 'diet', 'nutrition', 'sleep', 'exercise', 'hydration', 'checkup'
  ],
  'mental health': [
    'mental health', 'stress', 'anxiety', 'mindfulness', 'meditation', 'wellbeing',
    'mood', 'burnout', 'self-care', 'relaxation', 'breathing exercise', 'therapy',
    'journaling', 'coping', 'emotional', 'overwhelmed',
    'concentration', 'motivation', 'work-life balance'
  ],
  dental: [
    'dental', 'dentist', 'dentists', 'teeth', 'tooth', 'toothache', 'toothbrush',
    'toothpaste', 'floss', 'flossing', 'brushing', 'cavity', 'cavities', 'gum', 'gums',
    'gum disease', 'gingivitis', 'plaque', 'tartar', 'scaling', 'root planing',
    'root canal', 'whitening', 'braces', 'orthodontics', 'mouthwash', 'bad breath',
    'halitosis', 'sensitivity', 'wisdom tooth', 'oral care', 'oral hygiene',
    'dental care', 'dental health', 'dentures', 'implant', 'implants', 'crown',
    'crowns', 'filling', 'fillings', 'extraction', 'molar', 'molars', 'enamel',
    'smile', 'dental floss', 'electric toothbrush', 'water flosser'
  ],

  // ---------------------------------------------------------------- Banking
  // 'balance' alone was too greedy ("work-life balance", "balance the equation"),
  // so only the banking phrase counts.
  banking: [
    'bank', 'banking', 'account', 'savings', 'checking', 'deposit', 'withdrawal',
    'debit', 'credit card', 'atm', 'account balance', 'transfer', 'statement', 'overdraft',
    'interest rate', 'loan', 'mortgage', 'emi', 'credit score', 'ifsc', 'iban',
    'budgeting', 'income', 'expenses', 'savings goal', 'salary'
  ],
  'retail banking': [
    'savings account', 'current account', 'passbook', 'cheque', 'check book',
    'net banking', 'upi', 'branch', 'fixed deposit', 'recurring deposit', 'kyc'
  ],
  // 'share'/'shares' removed: "can you share some tips?" is not an investing question.
  investment: [
    'investment', 'invest', 'investing', 'stock', 'stocks', 'stock market', 'bond',
    'bonds', 'mutual fund', 'etf', 'portfolio', 'dividend', 'diversification',
    'index fund', 'compound interest', 'brokerage', 'nifty', 'sensex', 'nasdaq', 's&p 500',
    'bull market', 'bear market', 'capital gains', 'roi'
  ],

  // ---------------------------------------------------------------- Tourism
  tourism: [
    'travel', 'trip', 'vacation', 'holiday', 'tourist', 'tourism', 'destination',
    'sightseeing', 'landmark', 'itinerary', 'flight', 'airport', 'passport', 'backpacking'
  ],
  'trip planning': [
    'itinerary', 'plan a trip', 'packing', 'budget travel', 'road trip', 'excursion',
    'travel insurance', 'layover', 'currency exchange', 'local transport', 'guided tour'
  ],
  hotels: [
    'hotel', 'hostel', 'resort', 'accommodation', 'booking', 'check-in', 'checkout',
    'amenities', 'airbnb', 'lodging', 'suite', 'room service', 'concierge', 'star rating',
    'rooms', 'hotel room', 'front desk', 'nightly rate', 'housekeeping'
  ],

  // ---------------------------------------------------------------- Restaurant
  restaurant: [
    'restaurant', 'dining', 'menu', 'dish', 'food', 'cuisine', 'meal', 'chef',
    'reservation', 'takeaway', 'appetizer', 'starter', 'dessert',
    'breakfast', 'lunch', 'dinner', 'brunch'
  ],
  menu: [
    'recipe', 'ingredient', 'ingredients', 'cooking', 'flavor', 'flavour', 'pairing',
    'vegetarian', 'vegan', 'gluten-free', 'spicy', 'biryani', 'pasta', 'ramen', 'pho',
    'sushi', 'curry', 'dessert', 'wine', 'wine pairing', 'allergen', 'portion', 'seasoning',
    'grilled', 'roasted', 'baked', 'fried', 'marinade', 'sauce', 'soup', 'salad',
    'salmon', 'steak', 'paneer', 'italian', 'course meal', 'three-course', '3-course'
  ],

  // ---------------------------------------------------------------- Fashion
  // 'model' was removed — "which CPU model?" is not a fashion question.
  fashion: [
    'fashion', 'style', 'styling', 'outfit', 'clothing', 'clothes', 'wardrobe',
    'accessory', 'accessories', 'trend', 'dress', 'shoes', 'apparel', 'fabric',
    'capsule wardrobe', 'smart casual', 'formal wear', 'tailoring', 'runway',
    'wear', 'what to wear', 'wedding', 'attire', 'jeans', 'shirt', 't-shirt',
    'saree', 'kurta', 'blazer', 'jewellery', 'jewelry', 'makeup', 'handbag',
    'footwear', 'sneakers', 'layering', 'color', 'colour', 'occasion'
  ],

  // ---------------------------------------------------------------- Fields no bot
  // owns. These never match a bot's own domain, so they act purely as
  // off-topic evidence — this is what makes redirects deterministic.
  sports: [
    'cricket', 'football', 'soccer', 'basketball', 'tennis', 'hockey', 'baseball',
    'match score', 'live score', 'world cup', 'olympics', 'ipl', 'fifa', 'nba',
    'tournament', 'championship', 'league table', 'batsman', 'goalkeeper'
  ],
  entertainment: [
    'movie', 'movies', 'film', 'netflix', 'tv show', 'tv series', 'web series',
    'episode', 'actor', 'actress', 'box office', 'trailer', 'celebrity', 'song',
    'album', 'lyrics', 'concert'
  ],
  automotive: [
    'car repair', 'engine repair', 'oil change', 'tyre', 'tire', 'gearbox', 'clutch',
    'odometer', 'mileage', 'car insurance', 'test drive', 'sedan', 'suv'
  ],
  relationships: [
    'dating', 'girlfriend', 'boyfriend', 'crush', 'breakup', 'relationship advice', 'flirt'
  ]
};

/** Every key whose name appears in "<domain> <subdomain>". */
function keysFor(domain = '', subdomain = '') {
  const label = `${domain} ${subdomain}`.toLowerCase();
  return Object.keys(DOMAIN_LEXICON).filter(key => label.includes(key));
}

/** Terms that prove a question IS inside this bot's field. */
export function lexiconFor(domain, subdomain) {
  const terms = new Set();
  for (const key of keysFor(domain, subdomain)) {
    for (const term of DOMAIN_LEXICON[key]) terms.add(term);
  }
  // The domain and specialty words themselves always count.
  if (domain) terms.add(String(domain).toLowerCase());
  if (subdomain) terms.add(String(subdomain).toLowerCase());
  return [...terms];
}

/**
 * Terms that prove a question belongs to a DIFFERENT field.
 * Anything the bot itself covers is subtracted, so a Restaurant bot is
 * never "off-topic" for the word `recipe` while a Legal bot still is.
 */
export function foreignLexiconFor(domain, subdomain) {
  const own = new Set(lexiconFor(domain, subdomain));
  const ownKeys = new Set(keysFor(domain, subdomain));
  const foreign = new Set();
  for (const [key, terms] of Object.entries(DOMAIN_LEXICON)) {
    if (ownKeys.has(key)) continue;
    for (const term of terms) if (!own.has(term)) foreign.add(term);
  }
  return [...foreign];
}

export default DOMAIN_LEXICON;
