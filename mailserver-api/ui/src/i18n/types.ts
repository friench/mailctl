export type Locale = 'en' | 'ru';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
];

/**
 * A translation namespace module. Each page/area gets one file under `ns/`
 * exporting this shape as its default export; the filename (minus `.ts`) is the
 * namespace, so keys are referenced as `t('<filename>.<key>')`.
 *
 * Example — `ns/quarantine.ts`:
 *   const quarantine: NamespaceModule = {
 *     en: { title: 'Spam quarantine' },
 *     ru: { title: 'Спам-карантин' },
 *   };
 *   export default quarantine;
 */
export interface NamespaceModule {
  en: Record<string, string>;
  ru: Record<string, string>;
}
