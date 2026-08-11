import { createMiddleware } from 'hono/factory';
import { getConnInfo } from 'hono/bun';
import { ipRestriction } from 'hono/ip-restriction';
import { env } from '../env';
import { Errors } from '../lib/errors';
import type { AppEnv } from '../types';

const OUTSIDE_NETWORK = 'دسترسی به این سامانه تنها از شبکهٔ داخلی دانشگاه ممکن است.';

/**
 * Refuses anything that did not come from the university network.
 *
 * Defence in depth, not the defence. nginx (M12) is the gate the whole platform
 * is built around, and it is the one that will actually see the traffic in
 * production. This exists because a gate is only worth what the wall around it
 * is worth: the API listens on a real port, and a published port, a firewall
 * rule someone loosened for an afternoon, or another container on the same
 * network is enough to reach it without passing nginx at all.
 *
 * Two things it deliberately does not cover:
 *
 * - **The socket path.** `index.ts` hands `/socket.io/` to the engine before
 *   Hono ever sees the request, so no Hono middleware can run on it. What
 *   guards the handshake is its cookie authentication, and in production the
 *   fact that nginx is the only route to the port at all.
 * - **A spoofed source.** This reads the peer address from the TCP connection,
 *   never from `X-Forwarded-For` — a header the client writes and can therefore
 *   set to anything. That means it is honest, but it also means that behind a
 *   proxy the address it sees is the proxy's, which is why the range list has
 *   to include wherever the proxy sits.
 */
export const ipRestrictionMiddleware = env.ALLOWED_IP_RANGES.length
  ? ipRestriction(
      // `getConnInfo` from `hono/bun` reaches for `c.env` as the Bun server —
      // which it is, because `index.ts` calls `app.fetch(request, server)` with
      // the server as the second argument. Drop that argument and this throws
      // rather than allowing everything, which is the right way round.
      getConnInfo,
      { allowList: env.ALLOWED_IP_RANGES },
      (_remote, c) => c.json(Errors.forbidden(OUTSIDE_NETWORK).toBody(), 403)
    )
  : // An empty `allowList` is not the same as no restriction: Hono still calls
    // `getConnInfo` before finding it has nothing to match against, so the
    // disabled case has to be a real passthrough. This matters for tests and
    // for any future caller of `app.fetch` that has no Bun server to hand.
    createMiddleware<AppEnv>(async (_c, next) => {
      await next();
    });
