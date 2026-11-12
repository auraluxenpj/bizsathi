export type Locale = 'en' | 'ne';

const STORAGE_KEY = 'bizsathi-language';

export function resolveLocale(value?: string | null): Locale {
  if (value === 'ne') return 'ne';
  return 'en';
}

export function getStoredLanguage(userId?: string | null): Locale {
  if (typeof window === 'undefined') return 'en';
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  const stored = window.localStorage.getItem(key);
  return resolveLocale(stored ?? undefined);
}

export function setStoredLanguage(locale: Locale, userId?: string | null) {
  if (typeof window === 'undefined') return;
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  window.localStorage.setItem(key, locale);
}

export const translations: Record<Locale, Record<string, string>> = {
  en: {
    Business: 'Business',
    Management: 'Management',
    Dashboard: 'Dashboard',
    Home: 'Home',
    Transactions: 'Transactions',
    Parties: 'Parties',
    Inventory: 'Inventory',
    Sales: 'Sales',
    Purchase: 'Purchase',
    Expenses: 'Expenses',
    'Cash & Bank': 'Cash & Bank',
    Reports: 'Reports',
    'Manage Staff': 'Manage Staff',
    'Business Tools': 'Business Tools',
    'Security findings': 'Security findings',
    'Review history': 'Review history',
    'My account': 'My account',
    'Quick POS': 'Quick POS',
    'New Sale': 'New Sale',
    More: 'More',
    'Business profile': 'Business profile',
    'No access': 'No access',
    'Loading your workspace…': 'Loading your workspace…',
    'Quick actions': 'Quick actions',
    'Approximate based on current ledger records': 'Approximate based on current ledger records',
    'All business figures are approximate until the ledger is reconciled': 'All business figures are approximate until the ledger is reconciled',
    'No business linked yet': 'No business linked yet',
    'Welcome': 'Welcome',
    'Today': 'Today',
    'This month': 'This month',
    Daily: 'Daily',
    Monthly: 'Monthly',
    'Today sales': 'Today sales',
    'Today expenses': 'Today expenses',
    'Gross profit': 'Gross profit',
    'Not available': 'Not available',
    'Gross profit is unavailable until cost of goods sold can be calculated from verified inventory costs.': 'Gross profit is unavailable until cost of goods sold can be calculated from verified inventory costs.',
    'Cash and bank balance': 'Cash and bank balance',
    'Customer outstanding': 'Customer outstanding',
    'Supplier outstanding': 'Supplier outstanding',
    'Low stock alerts': 'Low stock alerts',
    'Recent transactions': 'Recent transactions',
    'New Purchase': 'New Purchase',
    'Add Expense': 'Add Expense',
    'Add Customer': 'Add Customer',
    'Add Stock': 'Add Stock',
    'View Reports': 'View Reports',
    'Language': 'Language',
    English: 'English',
    Nepali: 'Nepali',
    'No transactions': 'No transactions',
    'Logout': 'Log out',
  },
  ne: {
    Business: 'व्यवसाय',
    Management: 'व्यवस्थापन',
    Dashboard: 'ड्यासबोर्ड',
    Home: 'होम',
    Transactions: 'कारोबार',
    Parties: 'पार्टीहरू',
    Inventory: 'मालसूची',
    Sales: 'बिक्री',
    Purchase: 'खरीद',
    Expenses: 'खर्च',
    'Cash & Bank': 'नगद र बैंक',
    Reports: 'रिपोर्ट',
    'Manage Staff': 'कर्मचारी व्यवस्थापन',
    'Business Tools': 'व्यवसाय उपकरण',
    'Security findings': 'सुरक्षा फेला',
    'Review history': 'इतिहास हेर्नुहोस्',
    'My account': 'मेरो खाता',
    'Quick POS': 'द्रुत POS',
    'New Sale': 'नयाँ बिक्री',
    More: 'अझ',
    'Business profile': 'व्यवसाय प्रोफाइल',
    'No access': 'प्रवेश छैन',
    'Loading your workspace…': 'तपाईंको कार्यक्षेत्र लोड हुँदैछ…',
    'Quick actions': 'द्रुत कार्यहरू',
    'Approximate based on current ledger records': 'हालको लेजर रेकर्डमा आधारित अनुमान',
    'All business figures are approximate until the ledger is reconciled': 'लेजर मिलान नभएकोसम्म सबै व्यवसाय आंकडा अनुमानिक हुन्छन्',
    'No business linked yet': 'अझै व्यवसाय जोडिएको छैन',
    Welcome: 'स्वागत छ',
    Today: 'आज',
    This month: 'यो महिना',
    Daily: 'दैनिक',
    Monthly: 'मासिक',
    'Today sales': 'आजको बिक्री',
    'Today expenses': 'आजको खर्च',
    'Gross profit': 'कुल मुनाफा',
    'Not available': 'उपलब्ध छैन',
    'Gross profit is unavailable until cost of goods sold can be calculated from verified inventory costs.': 'प्रमाणित मौज्दात लागतका आधारमा बिक्री भएको सामानको लागत गणना नभएसम्म कुल मुनाफा उपलब्ध हुँदैन।',
    'Cash and bank balance': 'नगद र बैंक शेष',
    'Customer outstanding': 'ग्राहक बाकी',
    'Supplier outstanding': 'सप्लायर बाकी',
    'Low stock alerts': 'कम स्टक चेतावनी',
    'Recent transactions': 'भर्खरको कारोबार',
    'New Purchase': 'नयाँ खरीद',
    'Add Expense': 'खर्च थप्नुहोस्',
    'Add Customer': 'ग्राहक थप्नुहोस्',
    'Add Stock': 'स्टक थप्नुहोस्',
    'View Reports': 'रिपोर्ट हेर्नुहोस्',
    'Language': 'भाषा',
    English: 'अंग्रेजी',
    Nepali: 'नेपाली',
    'No transactions': 'कुनै कारोबार छैन',
    Logout: 'लग आउट',
  },
};

export function t(locale: Locale, key: string) {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}
