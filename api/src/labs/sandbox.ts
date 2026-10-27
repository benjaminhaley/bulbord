import { createHmac } from 'node:crypto'

import type { FastifyInstance, FastifyRequest } from 'fastify'
import postgres from 'postgres'

import { tracker } from './tracker/lab.js'

// The one boundary between Bulbord and its labs (see labs/README.md at the
// repo root). A lab is an independent experiment: it imports nothing from the
// app, and the app knows nothing about it beyond the list below. Everything a
// lab gets from Bulbord comes through LabContext.
//
// scripts/check-lab-isolation.mjs enforces this in CI: a lab may import only
// its own folder, npm packages, and `import type` from this file; only
// app.ts may import from labs/, and only this file.
export interface LabContext {
  /** The signed-in, approved Bulbord member making this request, or null. */
  memberId(request: FastifyRequest): string | null
  /**
   * Postgres URL for this lab's own login (`lab_<name>`), which can use only
   * its own schema (`lab_<name>`) — no app table is visible to it. Set up on
   * first call (so labs add nothing to boot), and only for a lab that
   * declares `database: true`.
   */
  databaseUrl(): Promise<string>
  /** The lab's schema name, e.g. `lab_tracker`. */
  schema: string
}

export interface Lab {
  name: string
  database?: boolean
  plugin: (scope: FastifyInstance, ctx: LabContext) => Promise<void>
}

const LABS: Lab[] = [tracker]

export async function registerLabs(app: FastifyInstance, labs: Lab[] = LABS) {
  for (const lab of labs) {
    await app.register(async (scope) => {
      try {
        let url: Promise<string> | null = null
        const databaseUrl = () => {
          if (!lab.database) return Promise.reject(new Error(`Lab ${lab.name} didn't declare database: true`))
          url ??= provisionLabDatabase(lab.name).catch((err) => {
            url = null
            throw err
          })
          return url
        }
        await lab.plugin(scope, { memberId, databaseUrl, schema: labSchema(lab.name) })
      } catch (err) {
        app.log.error({ err, lab: lab.name }, 'Lab failed to load; skipped')
      }
    }, { prefix: `/labs/${lab.name}` })
  }
}

function memberId(request: FastifyRequest): string | null {
  // currentUser is set only for an approved member (auth/plugin.ts).
  return request.currentUser?.id ?? null
}

export function labSchema(name: string) {
  return `lab_${name.replace(/[^a-z0-9]/g, '_')}`
}

// Creates (or refreshes) the lab's own login and schema, using the app's own
// admin connection, and returns a URL for that login. The password is derived
// from SESSION_SECRET, so there's no extra secret to store anywhere; rotating
// SESSION_SECRET just re-sets it on the next boot. The login owns its schema
// and nothing else: Postgres's defaults give it no access to the app's tables
// in `public`, nor to any other lab's schema (sandbox.test.ts checks this).
export async function provisionLabDatabase(name: string): Promise<string> {
  const appUrl = process.env.DATABASE_URL
  const secret = process.env.SESSION_SECRET
  if (!appUrl || !secret) throw new Error('DATABASE_URL and SESSION_SECRET are required for a lab database')
  const role = labSchema(name)
  const password = createHmac('sha256', secret).update(`lab-database:${name}`).digest('hex')

  const admin = postgres(appUrl, { max: 1, onnotice: () => {} })
  try {
    const [{ exists }] = await admin<{ exists: boolean }[]>`select exists(select 1 from pg_roles where rolname = ${role})`
    // Role/schema names are derived from the lab name above (only [a-z0-9_]),
    // and the password is hex, so interpolating them is safe.
    await admin.unsafe(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`)
    await admin.unsafe(`CREATE SCHEMA IF NOT EXISTS ${role} AUTHORIZATION ${role}`)
    await admin.unsafe(`ALTER SCHEMA ${role} OWNER TO ${role}`)
  } finally {
    await admin.end()
  }

  const url = new URL(appUrl)
  url.username = role
  url.password = password
  return url.toString()
}
