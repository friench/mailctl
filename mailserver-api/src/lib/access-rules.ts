import type { AccessAction, AccessMatchType } from '../db/schema';

/** A normalized access-list rule (subset of the DB row the renderers need). */
export interface AccessRuleInput {
  matchType: AccessMatchType;
  action: AccessAction;
  value: string;
  recipient: string | null;
}

/** The set of config files rendered from the current access rules. */
export interface AccessConfigFiles {
  /** Postfix `check_sender_access` map (global email + domain rules). */
  postfixSender: string;
  /** Postfix `check_client_access` map (global IP rules). */
  postfixClient: string;
  /** main.cf snippet wiring the two maps (global enforcement, engine-independent). */
  postfixMainCf: string;
  /** Rspamd multimap map files (global from/ip allow + block). */
  rspamdFromBlock: string;
  rspamdFromAllow: string;
  rspamdIpBlock: string;
  rspamdIpAllow: string;
  /** Rspamd multimap.conf declaring the global symbols. */
  rspamdConf: string;
  /** Rspamd Lua prefilter enforcing per-recipient overrides. */
  rspamdRcptLua: string;
}

const EMAIL_RE = /^[a-z0-9._%+=-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const IPV4_CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const IPV6_CIDR_RE = /^[0-9a-f:]+(\/\d{1,3})?$/;

export class AccessRuleError extends Error {}

/** Validate + normalize a match value for its type; throws {@link AccessRuleError}. */
export function normalizeValue(matchType: AccessMatchType, raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) throw new AccessRuleError('Value is required');
  if (matchType === 'email') {
    if (!EMAIL_RE.test(value)) throw new AccessRuleError(`Invalid email: ${raw}`);
    return value;
  }
  if (matchType === 'domain') {
    if (!DOMAIN_RE.test(value)) throw new AccessRuleError(`Invalid domain: ${raw}`);
    return value;
  }
  // ip (with optional CIDR)
  if (!IPV4_CIDR_RE.test(value) && !IPV6_CIDR_RE.test(value)) {
    throw new AccessRuleError(`Invalid IP/CIDR: ${raw}`);
  }
  return value;
}

/** Validate + normalize an optional per-recipient scope (a mailbox address). */
export function normalizeRecipient(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === '') return null;
  const value = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(value)) throw new AccessRuleError(`Invalid recipient address: ${raw}`);
  return value;
}

function postfixVerdict(action: AccessAction): string {
  return action === 'allow' ? 'OK' : 'REJECT';
}

/**
 * Render every enforcement file from the full rule set. Global rules
 * (recipient === null) are enforced by BOTH Postfix access maps and Rspamd
 * multimaps; per-recipient rules are enforced by an Rspamd Lua prefilter (the
 * Postfix access-map model can't express per-recipient sender rules).
 */
export function renderAccessConfig(rules: AccessRuleInput[]): AccessConfigFiles {
  const global = rules.filter((r) => r.recipient === null);
  const perRcpt = rules.filter((r) => r.recipient !== null);

  // ── Postfix (global only) ──────────────────────────────────────────────────
  const senderLines: string[] = [];
  const clientLines: string[] = [];
  for (const r of global) {
    if (r.matchType === 'ip') clientLines.push(`${r.value} ${postfixVerdict(r.action)}`);
    else senderLines.push(`${r.value} ${postfixVerdict(r.action)}`);
  }

  // ── Rspamd global multimaps ────────────────────────────────────────────────
  const fromBlock: string[] = [];
  const fromAllow: string[] = [];
  const ipBlock: string[] = [];
  const ipAllow: string[] = [];
  for (const r of global) {
    const bucket =
      r.matchType === 'ip'
        ? r.action === 'block'
          ? ipBlock
          : ipAllow
        : r.action === 'block'
          ? fromBlock
          : fromAllow;
    bucket.push(r.value);
  }

  return {
    postfixSender: withTrailingNewline(senderLines),
    postfixClient: withTrailingNewline(clientLines),
    postfixMainCf: renderPostfixMainCf(),
    rspamdFromBlock: withTrailingNewline(fromBlock),
    rspamdFromAllow: withTrailingNewline(fromAllow),
    rspamdIpBlock: withTrailingNewline(ipBlock),
    rspamdIpAllow: withTrailingNewline(ipAllow),
    rspamdConf: RSPAMD_MULTIMAP_CONF,
    rspamdRcptLua: renderRcptLua(perRcpt),
  };
}

function withTrailingNewline(lines: string[]): string {
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/** Paths (inside the DMS container) the writer installs the rendered files to. */
export const ACCESS_PATHS = {
  postfixSender: '/tmp/docker-mailserver/dms-panel-access-sender',
  postfixClient: '/tmp/docker-mailserver/dms-panel-access-client',
  postfixMainCf: '/tmp/docker-mailserver/postfix-main.cf',
  rspamdDir: '/tmp/docker-mailserver/rspamd',
  rspamdFromBlock: '/tmp/docker-mailserver/rspamd/dms-panel-from-block.map',
  rspamdFromAllow: '/tmp/docker-mailserver/rspamd/dms-panel-from-allow.map',
  rspamdIpBlock: '/tmp/docker-mailserver/rspamd/dms-panel-ip-block.map',
  rspamdIpAllow: '/tmp/docker-mailserver/rspamd/dms-panel-ip-allow.map',
  rspamdConf: '/tmp/docker-mailserver/rspamd/override.d/dms-panel-multimap.conf',
  rspamdRcptLua: '/tmp/docker-mailserver/rspamd/local.d/dms-panel-rcpt.lua',
} as const;

/**
 * Wiring appended to Postfix main.cf. Sets the sender/client access checks that
 * enforce global allow/block rules regardless of the spam engine. These override
 * DMS's `smtpd_sender_restrictions` / `smtpd_client_restrictions` (empty by
 * default); recipient restrictions / milters are untouched.
 */
function renderPostfixMainCf(): string {
  return [
    '# --- mailctl panel: allow/deny lists (managed; do not edit) ---',
    `smtpd_sender_restrictions = check_sender_access texthash:${ACCESS_PATHS.postfixSender}, permit`,
    `smtpd_client_restrictions = check_client_access texthash:${ACCESS_PATHS.postfixClient}, permit`,
    '# --- end mailctl panel ---',
    '',
  ].join('\n');
}

/** Rspamd multimap symbols for the global maps. Empty maps are simply never hit. */
const RSPAMD_MULTIMAP_CONF = `# mailctl panel: allow/deny lists (managed; do not edit)
PANEL_ALLOW_FROM {
  type = "from";
  filter = "email:addr";
  map = "${ACCESS_PATHS.rspamdFromAllow}";
  action = "accept";
  description = "mailctl panel from allowlist";
}
PANEL_BLOCK_FROM {
  type = "from";
  filter = "email:addr";
  map = "${ACCESS_PATHS.rspamdFromBlock}";
  action = "reject";
  message = "Sender blocked by mail administrator";
  description = "mailctl panel from blocklist";
}
PANEL_ALLOW_IP {
  type = "ip";
  map = "${ACCESS_PATHS.rspamdIpAllow}";
  action = "accept";
  description = "mailctl panel IP allowlist";
}
PANEL_BLOCK_IP {
  type = "ip";
  map = "${ACCESS_PATHS.rspamdIpBlock}";
  action = "reject";
  message = "Client blocked by mail administrator";
  description = "mailctl panel IP blocklist";
}
`;

/** Escape a string for embedding inside a single-quoted Lua literal. */
function luaStr(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Render a self-contained Rspamd Lua prefilter that applies per-recipient
 * overrides. For each envelope (from × rcpt) pair present in the table it forces
 * `accept` (allow) or `reject` (block). Emits an inert stub when there are none.
 */
function renderRcptLua(rules: AccessRuleInput[]): string {
  const header = '-- mailctl panel: per-recipient allow/deny (managed; do not edit)\n';
  if (rules.length === 0) {
    return `${header}-- (no per-recipient rules)\n`;
  }

  const entries: string[] = [];
  for (const r of rules) {
    // Key each rule by recipient|matchType|value so the Lua can look up by the
    // envelope's from-address, from-domain, and client IP independently.
    const key = `${r.recipient}|${r.matchType}|${r.value}`;
    entries.push(`  [${luaStr(key)}] = ${luaStr(r.action)},`);
  }

  return `${header}local rules = {
${entries.join('\n')}
}

local function verdict(task, rcpt)
  local from = task:get_from('smtp')
  local fromaddr = from and from[1] and from[1].addr and from[1].addr:lower() or nil
  local fromdomain = from and from[1] and from[1].domain and from[1].domain:lower() or nil
  local ip = task:get_from_ip()
  local candidates = {}
  if fromaddr then candidates[#candidates + 1] = rcpt .. '|email|' .. fromaddr end
  if fromdomain then candidates[#candidates + 1] = rcpt .. '|domain|' .. fromdomain end
  if ip and ip:is_valid() then candidates[#candidates + 1] = rcpt .. '|ip|' .. tostring(ip) end
  for _, key in ipairs(candidates) do
    local action = rules[key]
    if action then return action end
  end
  return nil
end

rspamd_config:register_symbol({
  name = 'PANEL_RCPT_RULES',
  type = 'prefilter',
  priority = 10,
  callback = function(task)
    local rcpts = task:get_recipients('smtp') or {}
    for _, r in ipairs(rcpts) do
      local addr = r.addr and r.addr:lower()
      if addr then
        local action = verdict(task, addr)
        if action == 'block' then
          task:set_pre_result('reject', 'Sender blocked for this recipient by mail administrator')
          return
        elseif action == 'allow' then
          task:set_pre_result('accept', 'Sender allowed for this recipient by mail administrator')
          return
        end
      end
    end
  end,
})
`;
}
