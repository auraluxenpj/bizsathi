const publicCloudKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const;

// Only these public connection values may enter the browser bundle.
// Missing values are left to Vite's own env handling, because platform preview
// builds supply them separately; never fail config loading over them.
export function publicCloudDefines(env: Record<string, string | undefined>) {
  return Object.fromEntries(publicCloudKeys
    .map(key => [key, (env[key] ?? process.env[key])?.trim()] as const)
    .filter((entry): entry is readonly [typeof publicCloudKeys[number], string] => Boolean(entry[1]))
    .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]));
}
