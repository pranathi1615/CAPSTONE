import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

export const LanguageSwitcher = ({ variant = 'default' }) => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language ? i18n.language.split('-')[0] : 'en';

  const handleLanguageChange = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('i18nextLng', code);
  };

  return (
    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
      <Globe className="w-4 h-4 text-slate-500 ml-1.5" />
      <div className="flex items-center gap-1" role="group" aria-label="Language selection">
        {LANGUAGES.map((lang) => {
          const isActive = currentLang === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleLanguageChange(lang.code)}
              className={`min-h-[44px] px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all select-none touch-manipulation flex items-center justify-center ${
                isActive
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'text-slate-700 hover:bg-slate-200 active:bg-slate-300'
              }`}
              aria-pressed={isActive}
              aria-label={`Switch language to ${lang.label}`}
            >
              {lang.native}
            </button>
          );
        })}
      </div>
    </div>
  );
};
