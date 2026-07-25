/**
 * Word-boundary actor/entity matching.
 *
 * The engines matched known actors with `text.includes(name)`, which collides on
 * substrings: "Niger" matches "Nigeria", "Mali" matches "Somaliland", "UN" matches
 * "UNICEF", "IS" matches "Paris". This matches whole tokens only, so a name is
 * found only when bounded by non-alphanumeric characters (or string edges).
 */

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if `name` appears in `text` as a whole word/phrase (case-insensitive). */
export function matchesWord(text: string, name: string): boolean {
  if (!name) return false
  // Unicode letters/numbers act as "word" chars; spaces, hyphens, punctuation are
  // boundaries. So "Niger" won't match inside "Nigeria".
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'iu')
  return re.test(text)
}

/** Subset of `names` that appear as whole words in `text`. */
export function matchKnownActors(text: string, names: readonly string[]): string[] {
  return names.filter(n => matchesWord(text, n))
}
