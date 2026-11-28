export function pageHead(title: string, description: string) {
  const fullTitle = `${title} | BizSathi by Auraluxe`;
  const brandDescription = description.replace(/BizSathi Nepal/gi, 'BizSathi by Auraluxe').replace(/BizSathi/gi, 'BizSathi');
  return { meta: [{ title: fullTitle }, { name: 'description', content: brandDescription }, { property: 'og:title', content: fullTitle }, { property: 'og:description', content: brandDescription }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}