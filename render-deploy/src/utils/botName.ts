import type { Bot } from '../types';

/**
 * Human-readable bot name.
 *
 * Procedural bots get names like "Rift" + domain "Gaming"; displaying them on
 * adjacent lines reads as "RiftGaming". This joins them with a space — but
 * skips when the name already carries the domain ("Orbit Astronomy"), or when
 * the bot is custom/template-made (long descriptive names).
 */
export function displayBotName(bot: Pick<Bot, 'name' | 'domain' | 'creationMethod'>): string {
  const n = bot.name.trim();
  const d = bot.domain?.trim() ?? '';
  if (bot.creationMethod === 'custom' || bot.creationMethod === 'template') return n;
  if (!d || n.length > 24) return n;
  const lower = n.toLowerCase();
  if (lower.endsWith(` ${d.toLowerCase()}`) || lower.endsWith(' ai')) return n;
  return `${n} ${d}`;
}
