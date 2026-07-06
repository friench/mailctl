import type { Locale, NamespaceModule } from './types';

/**
 * Auto-collect every namespace module under `ns/`. Adding a page's translations
 * is just dropping a new `ns/<name>.ts` file — no shared registry to edit, so
 * this stays conflict-free when many pages are translated in parallel.
 */
const modules = import.meta.glob<{ default: NamespaceModule }>('./ns/*.ts', { eager: true });

function nsName(path: string): string {
  return path.replace(/^.*\/([^/]+)\.ts$/, '$1');
}

/** Flat `"<namespace>.<key>" → string` map for one locale. */
function buildLocale(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const ns = nsName(path);
    for (const [key, value] of Object.entries(mod.default[locale])) {
      out[`${ns}.${key}`] = value;
    }
  }
  return out;
}

export const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: buildLocale('en'),
  ru: buildLocale('ru'),
};
