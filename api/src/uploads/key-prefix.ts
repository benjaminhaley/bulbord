// Production and local dev share one bucket (`uploads`), split by key prefix:
// production under `prod/`, local dev (and CI) under `dev/`. The prefix is
// required and checked against NODE_ENV (the api image sets `production`), so
// a deploy that loses the setting refuses to boot instead of silently reading
// the wrong folder — feedback #183, 2026-10-27: production had been reading
// `dev/` for months via a shipped .env, and images broke the day that stopped.
const PRODUCTION_PREFIX = 'prod/'
const DEV_PREFIX = 'dev/'

export function uploadsKeyPrefix(env: { UPLOADS_KEY_PREFIX?: string; NODE_ENV?: string }): string {
  const prefix = env.UPLOADS_KEY_PREFIX
  const production = env.NODE_ENV === 'production'
  const expected = production ? PRODUCTION_PREFIX : DEV_PREFIX
  if (prefix !== expected) {
    throw new Error(
      `UPLOADS_KEY_PREFIX must be "${expected}" ${production ? 'in production' : 'outside production (NODE_ENV is not "production")'}, ` +
        `got ${prefix === undefined ? 'nothing' : `"${prefix}"`}`,
    )
  }
  return prefix
}
