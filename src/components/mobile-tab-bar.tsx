import { Link } from '@tanstack/react-router';
import { Archive, Banknote, Home, LayoutGrid, Users, type LucideIcon } from 'lucide-react';

const tabs: { to: string; label: string; icon: LucideIcon; match: string[] }[] = [
  { to: '/dashboard', label: 'Home', icon: Home, match: ['/dashboard'] },
  { to: '/transactions', label: 'Transactions', icon: Banknote, match: ['/transactions', '/sales', '/purchases', '/expenses'] },
  { to: '/parties', label: 'Parties', icon: Users, match: ['/parties', '/contacts'] },
  { to: '/inventory', label: 'Inventory', icon: Archive, match: ['/inventory', '/products', '/categories'] },
  { to: '/more', label: 'More', icon: LayoutGrid, match: ['/more'] },
];
export function MobileTabBar({ pathname }: { pathname: string }) {
  return <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-white pb-[env(safe-area-inset-bottom)] font-[Roboto,sans-serif] lg:hidden">
    {tabs.map(t => { const on = t.match.some(m => pathname === m || pathname.startsWith(`${m}/`)); return <Link key={t.to} to={t.to} aria-current={on ? 'page' : undefined} className={`relative flex flex-col items-center gap-1 pb-3 pt-3 text-[15px] ${on ? 'text-[#2bb489]' : 'text-[#6b7280]'}`}>{on && <span className="absolute left-0 top-0 h-0.5 w-full bg-[#2bb489]" />}<t.icon className="size-7" fill={on ? 'currentColor' : 'none'} />{t.label}</Link>; })}
  </nav>;
}
