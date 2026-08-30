import { createMiddleware } from 'hono/factory';
import { getConnInfo } from 'hono/bun';
import { ipRestriction } from 'hono/ip-restriction';
import { env } from '../env';
import { Errors } from '../lib/errors';
import type { AppEnv } from '../types';

const OUTSIDE_NETWORK = 'دسترسی به این سامانه تنها از شبکهٔ داخلی دانشگاه ممکن است.';

export const ipRestrictionMiddleware = env.ALLOWED_IP_RANGES.length
  ? ipRestriction(getConnInfo, { allowList: env.ALLOWED_IP_RANGES }, (_remote, c) =>
      c.json(Errors.forbidden(OUTSIDE_NETWORK).toBody(), 403)
    )
  : createMiddleware<AppEnv>(async (_c, next) => {
      await next();
    });
