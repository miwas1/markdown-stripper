import React from 'react';
import { Languages } from 'lucide-react';
import messages from '../i18n/locales.json';
import { SUPPORTED_LOCALES, type Locale, useI18n } from '../i18n/I18nProvider';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-600 shadow-sm focus-within:ring-2 focus-within:ring-indigo-300">
      <Languages className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
      {!compact && <span className="hidden sm:inline">{t('language.label')}</span>}
      <select
        value={locale}
        onChange={event => setLocale(event.target.value as Locale)}
        aria-label={t('language.select')}
        className="min-w-0 cursor-pointer bg-transparent py-2 pr-1 text-xs font-semibold text-zinc-700 outline-none"
      >
        {SUPPORTED_LOCALES.map(code => <option key={code} value={code}>{messages[code]['language.name']}</option>)}
      </select>
    </label>
  );
}
