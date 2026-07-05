/** Parsers for the raw output of the engine-observability shell commands. */

export interface RspamdStat {
  scanned: number;
  spam: number;
  ham: number;
  learned: number;
  /** action name (e.g. "reject", "no action") → message count */
  actions: Record<string, number>;
}

export interface DmsSetting {
  key: string;
  value: string;
  /** Convenience flag for the common `'1'`/`'0'` toggle values. */
  enabled: boolean;
}

export interface DoveadmStats {
  columns: string[];
  rows: string[][];
}

/**
 * Parse `rspamc stat`. Returns null when the output has no recognizable metrics
 * (e.g. Rspamd disabled / command failed). Lines of interest:
 *   Messages scanned: N
 *   Messages with action <name>: N, P%
 *   Spam count: N   /   Ham count: N   /   Total learns: N
 */
export function parseRspamcStat(stdout: string): RspamdStat | null {
  const text = stdout.replace(/\r\n/g, '\n');
  const num = (re: RegExp): number | null => {
    const m = text.match(re);
    return m ? Number.parseInt(m[1]!, 10) : null;
  };

  const scanned = num(/Messages scanned:\s*(\d+)/);
  if (scanned === null) return null;

  const actions: Record<string, number> = {};
  const actionRe = /Messages with action ([a-z ]+):\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(text)) !== null) {
    actions[m[1]!.trim()] = Number.parseInt(m[2]!, 10);
  }

  return {
    scanned,
    spam: num(/Spam count:\s*(\d+)/) ?? 0,
    ham: num(/Ham count:\s*(\d+)/) ?? 0,
    learned: num(/Total learns:\s*(\d+)/) ?? 0,
    actions,
  };
}

/**
 * Parse docker-mailserver's `/etc/dms-settings` (shell-style `KEY='value'`
 * assignments). Comment/blank lines are ignored.
 */
export function parseDmsSettings(stdout: string): DmsSetting[] {
  const out: DmsSetting[] = [];
  for (const raw of stdout.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!.trim().replace(/^['"]|['"]$/g, '');
    out.push({ key, value, enabled: value === '1' });
  }
  return out;
}

/**
 * Parse `doveadm stats dump` — a tab-separated table with a header row. Returns
 * empty columns/rows when the stats plugin produced nothing.
 */
export function parseDoveadmStats(stdout: string): DoveadmStats {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0]!.split('\t').map((c) => c.trim());
  const rows = lines.slice(1).map((l) => l.split('\t').map((c) => c.trim()));
  return { columns, rows };
}
