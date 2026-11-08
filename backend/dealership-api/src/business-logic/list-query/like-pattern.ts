/**
 * Text for a LIKE pattern that matches only itself: `%`, `_` and the escape character `\` (Postgres's default) are
 * escaped, so a search for "50%" finds "50%" and not everything starting with 50.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}
