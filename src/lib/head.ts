export function pageHead(title: string, description: string) {
  const fullTitle = `${title} | Auralink by Auraluxe`;
  const brandDescription = description.replace(/Auralink/gi, 'Auralink by Auraluxe').replace(/Auralink/gi, 'Auralink');
  return { meta: [{ title: fullTitle }, { name: 'description', content: brandDescription }, { property: 'og:title', content: fullTitle }, { property: 'og:description', content: brandDescription }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}