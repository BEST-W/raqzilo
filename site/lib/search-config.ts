// Index only the selected brand hostname, never the account-based hosting URL.
export const publicOrigin = "https://malafak.is-a.dev";
export function isPublicHost(host: string | null): boolean {
  return host?.toLowerCase() === new URL(publicOrigin).host;
}
export function robotsText(host: string | null): string {
  // Crawlers must be able to read the homepage's noindex on the old hostname.
  const rules = "User-agent: *\nAllow: /$\nDisallow: /admin\nDisallow: /api/\nDisallow: /s/\nDisallow: /share\nDisallow: /chatgpt-auth/\n";
  return rules + (isPublicHost(host) ? `Sitemap: ${publicOrigin}/sitemap.xml\n` : "");
}
