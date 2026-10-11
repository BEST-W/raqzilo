// Index the stable public Vercel hostname; previews remain unindexed.
export const publicOrigin = "https://raqzilo.vercel.app";
export function isPublicHost(host: string | null): boolean {
  return host?.toLowerCase() === new URL(publicOrigin).host;
}
export function robotsText(host: string | null): string {
  // Crawlers must be able to read the homepage's noindex on the old hostname.
  const rules = "User-agent: *\nAllow: /$\nDisallow: /admin\nDisallow: /api/\nDisallow: /s/\nDisallow: /share\n";
  return rules + (isPublicHost(host) ? `Sitemap: ${publicOrigin}/sitemap.xml\n` : "");
}
