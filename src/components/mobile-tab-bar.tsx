import { Link } from '@tanstack/react-router';
import { Archive, Home, LayoutGrid, ShoppingCart, Users, type LucideIcon } from 'lucide-react';

const tabs: { to: string; label: string; icon: LucideIcon; match: string[] }[] = [
  { to: '/dashboard', label: 'Home', icon: Home, match: ['/dashboard'] },
  { to: '/pos', label: 'POS', icon: ShoppingCart, match: ['/pos'] },
  { to: '/parties', label: 'Parties', icon: Users, match: ['/parties', '/contacts'] },
  { to: '/inventory', label: 'Inventory', icon: Archive, match: ['/inventory', '/products', '/categories'] },
  { to: '/more', label: 'More', icon: LayoutGrid, match: ['/more'] },
];
export function MobileTabBar({ pathname }: { pathname: string }) {
  return <nav aria-label="Main" className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 grid min-h-16 grid-cols-5 items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)] font-[Inter,sans-serif] shadow-[0_-6px_24px_oklch(0.2_0.02_70_/_6%)] lg:hidden">
    {tabs.map(t => { const on = t.match.some(m => pathname === m || pathname.startsWith(`${m}/`)); return <Link key={t.to} to={t.to} aria-current={on ? 'page' : undefined} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold leading-tight ${on ? 'text-[#2347D9]' : 'text-[#55607A]'}`}>{on && <span className="absolute left-0 top-0 h-0.5 w-full bg-[#2F5BF0]" />}<t.icon className="size-[21px]" fill={on ? 'currentColor' : 'none'} />{t.label}</Link>; })}
  </nav>;
}
