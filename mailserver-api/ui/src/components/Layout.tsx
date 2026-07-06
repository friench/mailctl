import { useCallback, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AppSettingsDTO } from '@contracts';
import { useAuth } from '../auth';
import { api } from '../api';
import { useI18n, LOCALES } from '../i18n';

interface NavItem {
  to: string;
  labelKey: string;
  end?: boolean;
}
interface NavGroup {
  key: string;
  titleKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    titleKey: 'navGroups.overview',
    items: [
      { to: '/admin/', labelKey: 'nav.dashboard', end: true },
      { to: '/admin/stats', labelKey: 'nav.stats' },
    ],
  },
  {
    key: 'mail',
    titleKey: 'navGroups.mail',
    items: [
      { to: '/admin/domains', labelKey: 'nav.domains' },
      { to: '/admin/mailboxes', labelKey: 'nav.mailboxes' },
      { to: '/admin/aliases', labelKey: 'nav.aliases' },
      { to: '/admin/import', labelKey: 'nav.import' },
      { to: '/admin/migrations', labelKey: 'nav.migrations' },
      { to: '/admin/fetchmail', labelKey: 'nav.fetchmail' },
    ],
  },
  {
    key: 'sending',
    titleKey: 'navGroups.sending',
    items: [
      { to: '/admin/smtp-accounts', labelKey: 'nav.smtpAccounts' },
      { to: '/admin/send-log', labelKey: 'nav.sendLog' },
      { to: '/admin/webhooks', labelKey: 'nav.webhooks' },
      { to: '/admin/bounces', labelKey: 'nav.bounces' },
      { to: '/admin/suppressions', labelKey: 'nav.suppressions' },
    ],
  },
  {
    key: 'antispam',
    titleKey: 'navGroups.antispam',
    items: [
      { to: '/admin/quarantine', labelKey: 'nav.quarantine' },
      { to: '/admin/access-lists', labelKey: 'nav.accessLists' },
    ],
  },
  {
    key: 'observability',
    titleKey: 'navGroups.observability',
    items: [
      { to: '/admin/engine', labelKey: 'nav.engine' },
      { to: '/admin/ops', labelKey: 'nav.ops' },
    ],
  },
  {
    key: 'maintenance',
    titleKey: 'navGroups.maintenance',
    items: [
      { to: '/admin/sync', labelKey: 'nav.sync' },
      { to: '/admin/backups', labelKey: 'nav.backups' },
    ],
  },
  {
    key: 'access',
    titleKey: 'navGroups.access',
    items: [
      { to: '/admin/users', labelKey: 'nav.users' },
      { to: '/admin/api-keys', labelKey: 'nav.apiKeys' },
    ],
  },
  {
    key: 'settings',
    titleKey: 'navGroups.settings',
    items: [{ to: '/admin/feature-flags', labelKey: 'nav.featureFlags' }],
  },
];

const COLLAPSE_KEY = 'mailctl.nav.collapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-5 py-2 text-sm hover:bg-slate-800 ${
    isActive ? 'bg-slate-800 text-white border-l-2 border-indigo-400' : ''
  }`;

export function Layout() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsDTO>('/admin/api/settings'),
    staleTime: 5 * 60_000,
  });
  const webmailUrl = settings.data?.webmailUrl ?? null;

  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const toggleGroup = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-4 text-lg font-semibold border-b border-slate-700">mailctl</div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300"
                >
                  <span>{t(group.titleKey)}</span>
                  <span className="text-slate-600">{isCollapsed ? '▸' : '▾'}</span>
                </button>
                {!isCollapsed &&
                  group.items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
              </div>
            );
          })}
          {webmailUrl && (
            <a
              href={webmailUrl}
              target="_blank"
              rel="noreferrer"
              className="block px-5 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Webmail ↗
            </a>
          )}
          <a
            href="/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="block px-5 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            {t('nav.apiSpec')} ↗
          </a>
        </nav>
        <div className="px-5 py-3 border-t border-slate-700 text-xs">
          <div className="truncate text-slate-400">{user?.email}</div>
          <label className="mt-2 block text-slate-400">
            {t('common.language')}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number]['code'])}
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-slate-200"
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 text-indigo-300 hover:text-indigo-100"
          >
            {t('common.signOut')}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
