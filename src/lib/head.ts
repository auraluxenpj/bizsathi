export function pageHead(title: string, description: string) {
  const fullTitle = `${title} | Sutra by Auraluxe`;
  const brandDescription = description.replace(/BizSathi Nepal/gi, 'Sutra by Auraluxe').replace(/BizSathi/gi, 'Sutra');
  return { meta: [{ title: fullTitle }, { name: 'description', content: brandDescription }, { property: 'og:title', content: fullTitle }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}