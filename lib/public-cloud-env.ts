/** Only browser-safe configuration belongs in this allowlist. */
export function publicCloudDefines(env: Record<string, string | undefined>, requireConnection: boolean) {
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
  const missing = required.filter(key => !env[key]?.trim());
  if (requireConnection && missing.length) {
    throw new Error(`Cloud browser configuration is missing: ${missing.join(', ')}. Refresh the Lovable Cloud connection before publishing.`);
  }
  const definitions: Record<string, string> = {};
  for (const key of [...required, 'VITE_SUPABASE_PROJECT_ID']) {
    const value = env[key]?.trim();
    if (value) definitions[`import.meta.env.${key}`] = JSON.stringify(value);
  }
  return definitions;
}