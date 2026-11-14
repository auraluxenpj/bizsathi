export type CommandEntry = { label: string; to: string; search?: { new: '1' }; permission?: string };

/** Keep command-palette destinations and create actions aligned with the signed-in user's permissions. */
export function filterCommandEntries<T extends CommandEntry>(entries: readonly T[], visible: (to: string) => boolean, can: (permission: string) => boolean = () => true): T[] {
  return entries.filter(entry => visible(entry.to) && (!entry.permission || can(entry.permission)));
}
