import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'en' | 'km';

const STORAGE_KEY = 'tg-downloader-language';

const en = {
  'nav.dashboard': 'Dashboard',
  'nav.groups': 'Groups & Topics',
  'nav.downloads': 'Downloads',
  'nav.automation': 'Automation',
  'nav.urllists': 'Link Lists',
  'nav.settings': 'Settings',
  'nav.guide': 'How to use',
  'nav.admin': 'Admin',
  'nav.systemStatus': 'System Status',
  'nav.online': 'Online',
  'nav.offline': 'Not connected',
  'nav.appName': 'KH Telegram Download',
  'nav.appTagline': 'Telegram video toolkit',

  'page.dashboard.title': 'Dashboard',
  'page.dashboard.subtitle': 'Everything at a glance',
  'page.groups.title': 'Groups & Topics',
  'page.groups.subtitle': 'Open a group, pick a topic, then select videos to download or forward',
  'page.downloads.title': 'Downloads',
  'page.downloads.subtitle': 'Monitor and manage the download queue',
  'page.automation.title': 'Automation',
  'page.automation.subtitle': 'Auto-download rules and forwarding jobs',
  'page.urllists.title': 'Link Lists',
  'page.urllists.subtitle': 'Organise episode links for batch downloading',
  'page.settings.title': 'Settings',
  'page.settings.subtitle': 'Connections, downloads and appearance',
  'page.guide.title': 'How to use',
  'page.guide.subtitle': 'From connecting Telegram to forwarding a whole topic',

  'theme.appearance': 'Appearance',
  'theme.accent': 'Accent colour',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  'tab.rules': 'Auto-download rules',
  'tab.forwards': 'Forward jobs',
  'tab.telegram': 'Telegram',
  'tab.r2': 'R2 Storage',
  'tab.s3source': 'Other Storage',
  'tab.downloads': 'Downloads',
  'tab.appearance': 'Appearance',

  'status.telegram': 'Telegram',
  'status.r2': 'R2 Storage',
  'status.backend': 'Userbot service',
  'status.connected': 'Connected',
  'status.disconnected': 'Disconnected',
  'status.checking': 'Checking…',

  'auth.tagline': 'Sign in to your own private workspace',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.confirmPassword': 'Confirm password',
  'auth.signIn': 'Sign in',
  'auth.signUp': 'Create account',
  'auth.noAccount': "Don't have an account?",
  'auth.haveAccount': 'Already have an account?',
  'auth.switchToSignUp': 'Sign up',
  'auth.switchToSignIn': 'Sign in',
  'auth.passwordMismatch': 'Passwords do not match.',
  'auth.checkEmailTitle': 'Check your email',
  'auth.checkEmailBody': "We've sent a confirmation link to your email. Open it, then come back and sign in.",
  'auth.backToSignIn': 'Back to sign in',
  'auth.signOut': 'Sign out',
  'auth.orEmail': 'or use email',

  'subscribe.title': 'Choose a plan',
  'subscribe.tagline': 'Pick a plan to unlock your workspace',
  'subscribe.quotaLimited': '{n} downloads / month',
  'subscribe.quotaUnlimited': 'Unlimited downloads',
  'subscribe.changePlan': 'Change plan',
  'subscribe.waiting': 'Waiting for payment confirmation...',
  'subscribe.noQr': 'QR not set up yet -- contact the operator',
  'subscribe.attachScreenshot': 'Attach payment screenshot',
  'subscribe.replaceScreenshot': 'Replace screenshot',
  'subscribe.screenshotAttached': 'Screenshot sent -- waiting for review',
  'subscribe.selectFailed': 'Could not start this plan. Please try again.',
  'subscribe.uploadFailed': 'Could not upload the screenshot. Please try again.',
  'subscribe.rejected': 'This payment claim was rejected. Please try again or contact the operator.',

  'gate.proOnly.title': 'Pro plan required',
  'gate.proOnly.body': 'Connecting your own Telegram account and your own storage is a Pro feature.',
  'gate.proOnly.cta': 'View plans',
  'gate.quotaReached': 'You have reached this month’s download limit for your plan.',
};

type TranslationKey = keyof typeof en;

const km: Record<TranslationKey, string> = {
  'nav.dashboard': 'ផ្ទាំងគ្រប់គ្រង',
  'nav.groups': 'ក្រុម និង Topics',
  'nav.downloads': 'ការទាញយក',
  'nav.automation': 'ស្វ័យប្រវត្តិកម្ម',
  'nav.urllists': 'បញ្ជីតំណ',
  'nav.settings': 'ការកំណត់',
  'nav.guide': 'របៀបប្រើប្រាស់',
  'nav.admin': 'អ្នកគ្រប់គ្រង',
  'nav.systemStatus': 'ស្ថានភាពប្រព័ន្ធ',
  'nav.online': 'កំពុងដំណើរការ',
  'nav.offline': 'មិនទាន់ភ្ជាប់',
  'nav.appName': 'KH Telegram Download',
  'nav.appTagline': 'ឧបករណ៍វីដេអូ Telegram',

  'page.dashboard.title': 'ផ្ទាំងគ្រប់គ្រង',
  'page.dashboard.subtitle': 'មើលទិដ្ឋភាពទាំងអស់ក្នុងមួយភ្លែត',
  'page.groups.title': 'ក្រុម និង Topics',
  'page.groups.subtitle': 'ចុចលើក្រុម → topic → ជ្រើសរើសវីដេអូ ដើម្បីទាញយក ឬបញ្ជូនបន្ត',
  'page.downloads.title': 'ការទាញយក',
  'page.downloads.subtitle': 'តាមដាន និងគ្រប់គ្រងជួរទាញយក',
  'page.automation.title': 'ស្វ័យប្រវត្តិកម្ម',
  'page.automation.subtitle': 'ច្បាប់ទាញយកស្វ័យប្រវត្តិ និងការបញ្ជូនបន្ត',
  'page.urllists.title': 'បញ្ជីតំណ',
  'page.urllists.subtitle': 'រៀបចំតំណ episode សម្រាប់ទាញយកជាបណ្តុំ',
  'page.settings.title': 'ការកំណត់',
  'page.settings.subtitle': 'ការភ្ជាប់ ការទាញយក និងរូបរាង',
  'page.guide.title': 'របៀបប្រើប្រាស់',
  'page.guide.subtitle': 'ចាប់ពីភ្ជាប់ Telegram រហូតដល់បញ្ជូន topic ទាំងមូល',

  'theme.appearance': 'រូបរាង',
  'theme.accent': 'ពណ៌សំខាន់',
  'theme.light': 'ភ្លឺ',
  'theme.dark': 'ងងឹត',
  'theme.system': 'តាមប្រព័ន្ធ',

  'tab.rules': 'ច្បាប់ទាញយកស្វ័យប្រវត្តិ',
  'tab.forwards': 'ការបញ្ជូនបន្ត',
  'tab.telegram': 'Telegram',
  'tab.r2': 'ឃ្លាំង R2',
  'tab.s3source': 'ឃ្លាំងផ្សេងទៀត',
  'tab.downloads': 'ការទាញយក',
  'tab.appearance': 'រូបរាង',

  'status.telegram': 'Telegram',
  'status.r2': 'ឃ្លាំង R2',
  'status.backend': 'សេវា Userbot',
  'status.connected': 'បានភ្ជាប់',
  'status.disconnected': 'មិនបានភ្ជាប់',
  'status.checking': 'កំពុងពិនិត្យ…',

  'auth.tagline': 'ចូលទៅកាន់ workspace ឯកជនរបស់អ្នក',
  'auth.email': 'អ៊ីមែល',
  'auth.password': 'ពាក្យសម្ងាត់',
  'auth.confirmPassword': 'បញ្ជាក់ពាក្យសម្ងាត់',
  'auth.signIn': 'ចូលប្រើ',
  'auth.signUp': 'បង្កើតគណនី',
  'auth.noAccount': 'មិនទាន់មានគណនី?',
  'auth.haveAccount': 'មានគណនីរួចហើយ?',
  'auth.switchToSignUp': 'ចុះឈ្មោះ',
  'auth.switchToSignIn': 'ចូលប្រើ',
  'auth.passwordMismatch': 'ពាក្យសម្ងាត់មិនត្រូវគ្នាទេ។',
  'auth.checkEmailTitle': 'សូមពិនិត្យអ៊ីមែលរបស់អ្នក',
  'auth.checkEmailBody': 'យើងបានផ្ញើតំណបញ្ជាក់ទៅអ៊ីមែលរបស់អ្នក។ បើកវា រួចត្រឡប់មកចូលប្រើវិញ។',
  'auth.backToSignIn': 'ត្រឡប់ទៅចូលប្រើ',
  'auth.signOut': 'ចាកចេញ',
  'auth.orEmail': 'ឬប្រើអ៊ីមែល',

  'subscribe.title': 'ជ្រើសរើសកម្រិតជាវ',
  'subscribe.tagline': 'ជ្រើសរើសកម្រិតមួយ ដើម្បីចូលប្រើ workspace របស់អ្នក',
  'subscribe.quotaLimited': 'ទាញយក {n} ដង / ខែ',
  'subscribe.quotaUnlimited': 'ទាញយកគ្មានដែនកំណត់',
  'subscribe.changePlan': 'ប្តូរកម្រិត',
  'subscribe.waiting': 'កំពុងរង់ចាំការបញ្ជាក់ការទូទាត់...',
  'subscribe.noQr': 'មិនទាន់ដាក់ QR ទេ — សូមទាក់ទងអ្នកគ្រប់គ្រង',
  'subscribe.attachScreenshot': 'ភ្ជាប់រូបថតវិក្កយបត្រ',
  'subscribe.replaceScreenshot': 'ប្តូររូបភាពថ្មី',
  'subscribe.screenshotAttached': 'បានផ្ញើរូបភាព — កំពុងរង់ចាំការត្រួតពិនិត្យ',
  'subscribe.selectFailed': 'មិនអាចចាប់ផ្តើមកម្រិតនេះបានទេ។ សូមព្យាយាមម្តងទៀត។',
  'subscribe.uploadFailed': 'មិនអាចផ្ទុករូបភាពបានទេ។ សូមព្យាយាមម្តងទៀត។',
  'subscribe.rejected': 'ការទូទាត់នេះមិនត្រូវបានទទួលយកទេ។ សូមព្យាយាមម្តងទៀត ឬទាក់ទងអ្នកគ្រប់គ្រង។',

  'gate.proOnly.title': 'ត្រូវការកម្រិត Pro',
  'gate.proOnly.body': 'ការភ្ជាប់គណនី Telegram ខ្លួនឯង និង storage ខ្លួនឯង គឺជាមុខងារ Pro។',
  'gate.proOnly.cta': 'មើលកម្រិតជាវ',
  'gate.quotaReached': 'អ្នកបានប្រើប្រាស់ចំនួនទាញយកគ្រប់កំណត់សម្រាប់ខែនេះហើយ។',
};

const translations: Record<Language, Record<TranslationKey, string>> = { en, km };

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
