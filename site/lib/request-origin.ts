/** Next's internal URL can use localhost behind a proxy. Browser Origin must match the actual request Host. */
export function isSameOrigin(request: Request) {
  const value = request.headers.get("origin");
  if (!value) return false;
  try {
    const origin = new URL(value), url = new URL(request.url);
    const host = request.headers.get("host") || url.host;
    const protocol = process.env.VERCEL ? "https:" : url.protocol;
    return origin.origin === value && origin.host.toLowerCase() === host.toLowerCase() && origin.protocol === protocol;
  } catch { return false; }
}
