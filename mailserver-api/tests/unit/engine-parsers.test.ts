import { describe, it, expect } from 'vitest';
import { parseDmsSettings, parseDoveadmStats, parseRspamcStat } from '../../src/lib/engine-parsers';

const RSPAMC = `Results for command: stat (0.002 seconds)
Messages scanned: 5000
Messages with action reject: 100, 2.00%
Messages with action soft reject: 3, 0.06%
Messages with action add header: 250, 5.00%
Messages with action greylist: 40, 0.80%
Messages with action no action: 4607, 92.14%
Spam count: 350
Ham count: 4650
Connections count: 5000
Total learns: 42
`;

describe('parseRspamcStat', () => {
  it('extracts scanned/spam/ham/learned and the action histogram', () => {
    const stat = parseRspamcStat(RSPAMC)!;
    expect(stat.scanned).toBe(5000);
    expect(stat.spam).toBe(350);
    expect(stat.ham).toBe(4650);
    expect(stat.learned).toBe(42);
    expect(stat.actions.reject).toBe(100);
    expect(stat.actions['no action']).toBe(4607);
    expect(stat.actions['add header']).toBe(250);
  });

  it('returns null when the output has no metrics', () => {
    expect(parseRspamcStat('cannot connect to rspamd')).toBeNull();
    expect(parseRspamcStat('')).toBeNull();
  });
});

describe('parseDmsSettings', () => {
  it('parses shell-style assignments and the enabled flag', () => {
    const settings = parseDmsSettings(
      [
        '# generated',
        "ENABLE_RSPAMD='1'",
        "ENABLE_CLAMAV='0'",
        'ENABLE_OPENDKIM=1',
        "POSTMASTER_ADDRESS='postmaster@example.org'",
        '',
      ].join('\n'),
    );
    const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));
    expect(byKey.ENABLE_RSPAMD!.enabled).toBe(true);
    expect(byKey.ENABLE_CLAMAV!.enabled).toBe(false);
    expect(byKey.ENABLE_OPENDKIM!.enabled).toBe(true);
    expect(byKey.POSTMASTER_ADDRESS!.value).toBe('postmaster@example.org');
    expect(byKey.POSTMASTER_ADDRESS!.enabled).toBe(false);
  });

  it('ignores comments and blank lines', () => {
    expect(parseDmsSettings('# only a comment\n\n')).toEqual([]);
  });
});

describe('parseDoveadmStats', () => {
  it('parses a tab-separated table with a header row', () => {
    const dump = 'metric_name\tcount\tduration\nimap_command\t1234\t5678\nsmtp_command\t42\t99';
    const stats = parseDoveadmStats(dump);
    expect(stats.columns).toEqual(['metric_name', 'count', 'duration']);
    expect(stats.rows).toHaveLength(2);
    expect(stats.rows[0]).toEqual(['imap_command', '1234', '5678']);
  });

  it('returns empty for no output', () => {
    expect(parseDoveadmStats('')).toEqual({ columns: [], rows: [] });
  });
});
