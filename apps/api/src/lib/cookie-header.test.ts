import { describe, expect, it } from 'vitest';
import { parseCookieHeader } from './cookie-header';

/**
 * This parser exists because the Socket.io handshake has no Hono `Context` to
 * hand `getCookie`, and `hono/utils/cookie` is not in Hono's export map. It is
 * therefore the only thing standing between a raw header and the gateway's
 * authentication — so the cases below are mostly about what it does with input
 * that is *not* a well-formed cookie header.
 */

describe('parseCookieHeader', () => {
  it('returns nothing for a request that sent no cookies', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });

  it('reads the pair a single cookie gives it', () => {
    expect(parseCookieHeader('access_token=abc.def.ghi')).toEqual({ access_token: 'abc.def.ghi' });
  });

  it('reads the three cookies this server actually sets', () => {
    expect(parseCookieHeader('access_token=a.b.c; refresh_token=d.e.f; session_hint=1')).toEqual({
      access_token: 'a.b.c',
      refresh_token: 'd.e.f',
      session_hint: '1',
    });
  });

  it('tolerates missing and extra spacing around the separators', () => {
    expect(parseCookieHeader('a=1;b=2;   c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('keeps a value that contains "=" intact', () => {
    // Only the first `=` separates; base64 padding is the common case.
    expect(parseCookieHeader('token=YWJj==')).toEqual({ token: 'YWJj==' });
  });

  it('keeps an empty value rather than dropping the cookie', () => {
    // A cleared cookie arrives this way, and the caller wants to see it present
    // and empty rather than absent.
    expect(parseCookieHeader('access_token=')).toEqual({ access_token: '' });
  });

  it('skips fragments with no name', () => {
    // `eq < 1` covers both a bare flag and a leading `=`, neither of which
    // names anything.
    expect(parseCookieHeader('=orphan; ; valid=1')).toEqual({ valid: '1' });
    expect(parseCookieHeader('novalue')).toEqual({});
  });

  it('takes the first of a duplicated name', () => {
    // Two cookies of the same name mean one was set at `/` and one at a deeper
    // path, and the browser sends the more specific one first. Last-wins would
    // hand the gateway the stale token.
    expect(parseCookieHeader('access_token=fresh; access_token=stale')).toEqual({
      access_token: 'fresh',
    });
  });

  it('decodes percent-escapes, because that is what setCookie writes', () => {
    expect(parseCookieHeader('name=%D8%B9%D9%84%DB%8C')).toEqual({ name: 'علی' });
  });

  it('falls back to the raw value when the escapes are malformed', () => {
    // A broken escape is not worth failing a handshake over — the value either
    // verifies as a token or it does not.
    expect(parseCookieHeader('access_token=100%; other=1')).toEqual({
      access_token: '100%',
      other: '1',
    });
  });

  it('treats a name from Object.prototype as an ordinary name', () => {
    // The duplicate check is `Object.hasOwn`, not `in`. With `in`, a cookie
    // called `constructor` looks like a repeat of something never seen and is
    // silently dropped — harmless here, but the same mistake one layer over is
    // an allowlist bypass, so both are written the same way.
    expect(parseCookieHeader('constructor=evil; access_token=a.b.c')).toEqual({
      constructor: 'evil',
      access_token: 'a.b.c',
    });
  });
});
