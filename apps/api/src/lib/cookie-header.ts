/**
 * Reads a raw `Cookie:` header.
 *
 * Hono has this internally but does not export `hono/utils/cookie`, and its
 * `getCookie` needs a `Context` — which a Socket.io handshake does not have.
 * The handshake arrives as a plain header string on `socket.handshake.headers`,
 * so the parsing happens here.
 *
 * Deliberately minimal: this only ever reads back cookies this server set, and
 * those are JWTs and a `1` — no quoted values, no attributes, nothing that
 * needs the full RFC 6265 grammar. `decodeURIComponent` is still applied
 * because that is what `setCookie` does on the way out.
 */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;

    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name || name in cookies) continue;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // A malformed percent-escape is not worth failing a handshake over; the
      // raw value either verifies as a token or it does not.
      cookies[name] = value;
    }
  }

  return cookies;
}
