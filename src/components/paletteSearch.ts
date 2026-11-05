export interface PaletteItem {
  id: string;
  group: 'pages' | 'jobs' | 'commands' | 'search';
  label: string;
  /** Shown after the label, also searched (an id, a description). */
  hint?: string;
  icon?: string;
  /** Where choosing it goes. */
  to: string;
}

/**
 * How well `query` matches `text`: higher is better, null when it does not. Every query character must appear in order
 * (ignoring case); a match at the start, a whole-word start or consecutive characters scores more, so "fr" ranks
 * "Fetch rates" above "Transfer".
 */
export function matchScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct !== -1) return 1000 - direct * 2 - (t.length - q.length) * 0.1 + (direct === 0 ? 500 : 0);
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    const wordStart = at === 0 || /[\s\-_./:]/.test(t[at - 1]);
    score += (at === previous + 1 ? 15 : 1) + (wordStart ? 10 : 0);
    previous = at;
    from = at + 1;
  }
  return score;
}

/** Items matching the query, best first (by label, then hint); every item, in order, without a query. */
export function searchPalette(items: PaletteItem[], query: string, limit = 30): PaletteItem[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, index) => {
      const label = matchScore(query, item.label);
      const hint = item.hint ? matchScore(query, item.hint) : null;
      const score = label !== null ? label : hint !== null ? hint * 0.5 : null;
      return { item, index, score };
    })
    .filter((entry): entry is { item: PaletteItem; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(entry => entry.item);
}
