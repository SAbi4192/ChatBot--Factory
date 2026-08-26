/**
 * Track which bots the user has actually opened, so the Library "New" badge
 * clears once a bot has been visited — even if it was created minutes ago.
 */
const KEY = 'scarlet:seen-bots';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function wasBotSeen(id: string): boolean {
  return read().includes(id);
}

export function markBotSeen(id: string) {
  try {
    const list = read();
    if (!list.includes(id)) {
      list.unshift(id);
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 2000)));
    }
  } catch {
    /* localStorage unavailable — badge stays until the 24h window passes */
  }
}
