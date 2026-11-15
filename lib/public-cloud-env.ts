const publicCloudKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const;

// Only these public connection values may enter the browser bundle.
export function publicCloudDefines(env: Record<string, string | undefined>) {
  const missing = publicCloudKeys.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing public Cloud build configuration: ${missing.join(', ')}`);
  return Object.fromEntries(publicCloudKeys.map(key => [`import.meta.env.${key}`, JSON.stringify(env[key]) ]));
}