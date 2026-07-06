import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AppSettingsDTO } from '@contracts';
import { useAuth } from '../auth';
import { api } from '../api';
import { useI18n, LOCALES } from '../i18n';

const NAV = [
  { to: '/admin/', labelKey: 'nav.dashboard', end: true },
  { to: '/admin/stats', labelKey: 'nav.stats' },
  { to: '/admin/domains', labelKey: 'nav.domains' },
  { to: '/admin/mailboxes', labelKey: 'nav.mailboxes' },
  { to: '/admin/aliases', labelKey: 'nav.aliases' },
  { to: '/admin/import', labelKey: 'nav.import' },
  { to: '/admin/quarantine', labelKey: 'nav.quarantine' },
  { to: '/admin/access-lists', labelKey: 'nav.accessLists' },
  { to: '/admin/engine', labelKey: 'nav.engine' },
  { to: '/admin/ops', labelKey: 'nav.ops' },
  { to: '/admin/migrations', labelKey: 'nav.migrations' },
  { to: '/admin/fetchmail', labelKey: 'nav.fetchmail' },
  { to: '/admin/sync', labelKey: 'nav.sync' },
  { to: '/admin/smtp-accounts', labelKey: 'nav.smtpAccounts' },
  { to: '/admin/api-keys', labelKey: 'nav.apiKeys' },
  { to: '/admin/send-log', labelKey: 'nav.sendLog' },
  { to: '/admin/bounces', labelKey: 'nav.bounces' },
  { to: '/admin/webhooks', labelKey: 'nav.webhooks' },
  { to: '/admin/feature-flags', labelKey: 'nav.featureFlags' },
  { to: '/admin/backups', labelKey: 'nav.backups' },
  { to: '/admin/users', labelKey: 'nav.users' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsDTO>('/admin/api/settings'),
    staleTime: 5 * 60_000,
  });
  const webmailUrl = settings.data?.webmailUrl ?? null;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-4 text-lg font-semibold border-b border-slate-700">mail-api</div>
        <nav className="flex-1 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-5 py-2 text-sm hover:bg-slate-800 ${
                  isActive ? 'bg-slate-800 text-white border-l-2 border-indigo-400' : ''
                }`
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
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
