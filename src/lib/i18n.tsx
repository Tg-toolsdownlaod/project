import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'en' | 'km';

const STORAGE_KEY = 'tg-downloader-language';

type TranslationKey =
  | 'nav.dashboard'
  | 'nav.groups'
  | 'nav.downloads'
  | 'nav.autodownload'
  | 'nav.forwards'
  | 'nav.urllists'
  | 'nav.r2'
  | 'nav.telegram'
  | 'nav.settings'
  | 'nav.systemStatus'
  | 'nav.online'
  | 'nav.appName'
  | 'nav.appTagline'
  | 'page.dashboard.title'
  | 'page.dashboard.subtitle'
  | 'page.groups.title'
  | 'page.groups.subtitle'
  | 'page.downloads.title'
  | 'page.downloads.subtitle'
  | 'page.autodownload.title'
  | 'page.autodownload.subtitle'
  | 'page.forwards.title'
  | 'page.forwards.subtitle'
  | 'page.urllists.title'
  | 'page.urllists.subtitle'
  | 'page.r2.title'
  | 'page.r2.subtitle'
  | 'page.telegram.title'
  | 'page.telegram.subtitle'
  | 'page.settings.title'
  | 'page.settings.subtitle';

const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.groups': 'Groups & Topics',
    'nav.downloads': 'Download Queue',
    'nav.autodownload': 'Auto Download',
    'nav.forwards': 'Forward to Group',
    'nav.urllists': 'URL Lists',
    'nav.r2': 'R2 Storage',
    'nav.telegram': 'Telegram',
    'nav.settings': 'Settings',
    'nav.systemStatus': 'System Status',
    'nav.online': 'Online',
    'nav.appName': 'TG Downloader',
    'nav.appTagline': 'Video Extractor Pro',
    'page.dashboard.title': 'Dashboard',
    'page.dashboard.subtitle': 'Overview of your download activity',
    'page.groups.title': 'Groups & Topics',
    'page.groups.subtitle': 'Open a group, pick a topic, then select videos to download or forward',
    'page.downloads.title': 'Download Queue',
    'page.downloads.subtitle': 'Monitor and manage active downloads',
    'page.autodownload.title': 'Auto Download',
    'page.autodownload.subtitle': 'Automatically download new episodes',
    'page.forwards.title': 'Forward to Group',
    'page.forwards.subtitle': 'Copy videos from a topic into another Telegram group',
    'page.urllists.title': 'URL Lists',
    'page.urllists.subtitle': 'Organize episode links for batch downloading',
    'page.r2.title': 'R2 Storage',
    'page.r2.subtitle': 'Cloudflare R2 configuration and files',
    'page.telegram.title': 'Telegram',
    'page.telegram.subtitle': 'Userbot connection and credentials',
    'page.settings.title': 'Settings',
    'page.settings.subtitle': 'Download preferences and configuration',
  },
  km: {
    'nav.dashboard': 'ផ្ទាំងគ្រប់គ្រង',
    'nav.groups': 'ក្រុម និង Topics',
    'nav.downloads': 'ជួរទាញយក',
    'nav.autodownload': 'ទាញយកស្វ័យប្រវត្តិ',
    'nav.forwards': 'បញ្ជូនទៅក្រុម',
    'nav.urllists': 'បញ្ជី URL',
    'nav.r2': 'ឃ្លាំង R2',
    'nav.telegram': 'តេឡេក្រាម',
    'nav.settings': 'ការកំណត់',
    'nav.systemStatus': 'ស្ថានភាពប្រព័ន្ធ',
    'nav.online': 'កំពុងដំណើរការ',
    'nav.appName': 'TG Downloader',
    'nav.appTagline': 'កម្មវិធីទាញយកវីដេអូ',
    'page.dashboard.title': 'ផ្ទាំងគ្រប់គ្រង',
    'page.dashboard.subtitle': 'ទិដ្ឋភាពទូទៅនៃសកម្មភាពទាញយក',
    'page.groups.title': 'ក្រុម និង Topics',
    'page.groups.subtitle': 'ចុចលើក្រុម → topic → ជ្រើសរើសវីដេអូ ដើម្បីទាញយក ឬបញ្ជូនបន្ត',
    'page.downloads.title': 'ជួរទាញយក',
    'page.downloads.subtitle': 'តាមដាន និងគ្រប់គ្រងការទាញយកបច្ចុប្បន្ន',
    'page.autodownload.title': 'ទាញយកស្វ័យប្រវត្តិ',
    'page.autodownload.subtitle': 'ទាញយក episode ថ្មីដោយស្វ័យប្រវត្តិ',
    'page.forwards.title': 'បញ្ជូនទៅក្រុម',
    'page.forwards.subtitle': 'ចម្លងវីដេអូពី topic ទៅក្រុម Telegram ថ្មី',
    'page.urllists.title': 'បញ្ជី URL',
    'page.urllists.subtitle': 'រៀបចំ link episode សម្រាប់ទាញយកជាបណ្តុំ',
    'page.r2.title': 'ឃ្លាំង R2',
    'page.r2.subtitle': 'ការកំណត់ និងឯកសារ Cloudflare R2',
    'page.telegram.title': 'តេឡេក្រាម',
    'page.telegram.subtitle': 'ការភ្ជាប់ userbot និង credentials',
    'page.settings.title': 'ការកំណត់',
    'page.settings.subtitle': 'ចំណូលចិត្ត និងការកំណត់ការទាញយក',
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return saved === 'km' ? 'km' : 'en';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('lang-km', language === 'km');
    window.localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);
  const toggleLanguage = () => setLanguageState((prev) => (prev === 'en' ? 'km' : 'en'));
  const t = (key: TranslationKey) => translations[language][key] ?? translations.en[key];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
