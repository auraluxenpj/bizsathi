import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Search, ChevronsUpDown, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { dashboardItem, workspaceGroups, workspaceItemActive, workspaceItemSearch, type WorkspaceItem } from '@/lib/workspace-navigation';

export function WorkspaceSidebar({ pathname, search, compact = false, visible, onNavigate }: { pathname: string; search: Record<string, unknown>; compact?: boolean; visible: (to?: string) => boolean; onNavigate?: () => void }) {
 const [filter, setFilter] = useState('');
 const [expanded, setExpanded] = useState<Record<string, boolean>>({});
 const groups = workspaceGroups.map(g => ({ ...g, items: g.items.filter(i => visible(i.to)).filter(i => !filter || `${g.name} ${i.name}`.toLowerCase().includes(filter.toLowerCase())) })).filter(g => g.items.length);
 const allOpen = groups.every(g => expanded[g.name]);
 const toggleAll = () => setExpanded(Object.fromEntries(groups.map(g => [g.name, !allOpen])));
 function itemRow(item: WorkspaceItem) {
  const active = workspaceItemActive(item, pathname, search);
  const content = <><item.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1 text-left">{item.name}</span>{item.unavailable && <span className="text-[10px] text-muted-foreground">Not available</span>}</>;
  if (item.unavailable) return <div key={item.name} aria-disabled="true" title="Not available" className="flex min-h-9 items-center gap-2.5 px-3 text-xs text-muted-foreground/70">{content}</div>;
  if (!item.to) return null;
  return <Button asChild key={item.name} variant="ghost" className={`h-auto min-h-9 w-full justify-start gap-2.5 whitespace-normal px-3 text-xs font-medium ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80'}`}><Link to={item.to} search={() => workspaceItemSearch(item, pathname, search)} aria-current={active ? 'page' : undefined} title={item.note} onClick={onNavigate}>{content}</Link></Button>;
 }
 const compactLink = (item: WorkspaceItem, Icon: LucideIcon) => { if (!item.to) return null; return <Tooltip key={item.name}><TooltipTrigger asChild><Button asChild size="icon" variant="ghost" className={`size-10 ${workspaceItemActive(item, pathname, search) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground'}`}><Link to={item.to} search={() => workspaceItemSearch(item, pathname, search)} aria-label={item.name} onClick={onNavigate}><Icon className="size-5" /></Link></Button></TooltipTrigger><TooltipContent side="right">{item.name}</TooltipContent></Tooltip>; };
 return <TooltipProvider delayDuration={150}>
  {!compact && <div className="flex gap-1.5 px-3 pb-4"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label="Filter navigation menu" placeholder="Filter menu…" value={filter} onChange={e => setFilter(e.target.value)} className="h-9 bg-sidebar-accent/40 pl-8 text-xs" /></div><Button size="icon" variant="outline" className="size-9 shrink-0" aria-label={allOpen ? 'Collapse all sections' : 'Expand all sections'} title={allOpen ? 'Collapse all sections' : 'Expand all sections'} onClick={toggleAll}><ChevronsUpDown className="size-4" /></Button></div>}
  <nav aria-label="Main navigation" className={`min-h-0 flex-1 overflow-y-auto pb-6 ${compact ? 'space-y-3 px-3' : 'space-y-3 px-3'}`}>
   {compact ? compactLink(dashboardItem, dashboardItem.icon) : itemRow(dashboardItem)}
   {groups.map(group => {
    if (compact) { const first = group.items.find(i => i.to); return first ? compactLink({ ...first, name: group.name }, group.icon) : null; }
    const active = group.items.some(i => workspaceItemActive(i, pathname, search));
    const open = filter ? true : expanded[group.name] ?? active;
    return <div key={group.name}><Button variant="ghost" aria-expanded={open} onClick={() => setExpanded(prev => ({ ...prev, [group.name]: !open }))} className={`h-10 w-full justify-start gap-2.5 px-3 text-xs font-semibold ${active ? 'text-primary' : 'text-sidebar-foreground'}`}><group.icon className="size-4 shrink-0" /><span className="flex-1 text-left">{group.name}</span>{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Button>{open && <div className="ml-2 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">{group.items.map(itemRow)}</div>}</div>;
   })}
   {!groups.length && <p className="px-3 text-xs text-muted-foreground">No matching modules.</p>}
  </nav>
 </TooltipProvider>;
}