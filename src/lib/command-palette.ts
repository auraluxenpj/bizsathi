export type CommandEntry = { label: string; to: string; search?: { new: '1' } };

/** Keep command-palette destinations aligned with the signed-in user's page permissions. */
export function filterCommandEntries<T extends CommandEntry>(entries: readonly T[], visible: (to: string) => boolean): T[] {
  return entries.filter(entry => visible(entry.to));
}
