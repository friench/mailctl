/** One alias mapping parsed from docker-mailserver's `postfix-virtual.cf`. */
export interface ParsedAlias {
  /** The alias address (LHS). */
  address: string;
  /** Comma-separated target(s) (RHS), whitespace normalized. */
  target: string;
}

/**
 * Parse a `postfix-virtual.cf` file. Each non-comment line is
 * `alias@domain  target1@domain[,target2@domain ...]`. Multiple targets may be
 * comma- or whitespace-separated; they are normalized to a comma-joined string.
 */
export function parsePostfixVirtual(content: string): ParsedAlias[] {
  const out: ParsedAlias[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const address = parts[0];
    if (!address || parts.length < 2) continue;
    const target = parts
      .slice(1)
      .join(' ')
      .split(/[,\s]+/)
      .filter(Boolean)
      .join(',');
    if (!target) continue;
    out.push({ address: address.toLowerCase(), target });
  }
  return out;
}
