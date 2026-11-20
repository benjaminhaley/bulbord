import postgres from 'postgres'

// Genie's data: the page everyone currently sees, and a record of every request
// that changed it (who asked, what they said). Lives in its own schema,
// `lab_genie`, reached only through the `lab_genie` login (GENIE_DATABASE_URL),
// which can't see any Bulbord table. Chatter the gate judged not to be a
// request is never stored anywhere.
//
// With no GENIE_DATABASE_URL (local dev, tests) it keeps state in memory.

export interface GeniePage {
  html: string
  title: string
  request: string
  createdAt: string
}

export interface GenieStore {
  currentPage(): Promise<GeniePage | null>
  savePage(page: { html: string; title: string; request: string; memberIds: string[] }): Promise<GeniePage>
  logRequest(entry: { memberId: string; text: string; outcome: string }): Promise<void>
}

export function memoryStore(): GenieStore {
  let page: GeniePage | null = null
  return {
    async currentPage() {
      return page
    },
    async savePage({ html, title, request }) {
      page = { html, title, request, createdAt: new Date().toISOString() }
      return page
    },
    async logRequest() {},
  }
}

const SCHEMA = 'lab_genie'

export function postgresStore(url: string): GenieStore {
  // Small pool, and the tables are created on first use, not at boot.
  const sql = postgres(url, { max: 2, onnotice: () => {} })
  let ready: Promise<void> | null = null
  const setup = () =>
    (ready ??= (async () => {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.genie_pages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          html text NOT NULL,
          title text NOT NULL DEFAULT '',
          request text NOT NULL DEFAULT '',
          member_ids uuid[] NOT NULL DEFAULT '{}',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        );
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.genie_requests (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          member_id uuid NOT NULL,
          text text NOT NULL,
          outcome text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        );
      `)
    })().catch((err) => {
      ready = null
      throw err
    }))

  return {
    async currentPage() {
      await setup()
      const rows = await sql<{ html: string; title: string; request: string; created_at: Date }[]>`
        select html, title, request, created_at from lab_genie.genie_pages
        where deleted_at is null order by created_at desc limit 1`
      const row = rows[0]
      return row ? { html: row.html, title: row.title, request: row.request, createdAt: row.created_at.toISOString() } : null
    },
    async savePage({ html, title, request, memberIds }) {
      await setup()
      const [row] = await sql<{ created_at: Date }[]>`
        insert into lab_genie.genie_pages (html, title, request, member_ids)
        values (${html}, ${title}, ${request}, ${sql.array(memberIds, 2950)}) returning created_at`
      return { html, title, request, createdAt: row.created_at.toISOString() }
    },
    async logRequest({ memberId, text, outcome }) {
      await setup()
      await sql`insert into lab_genie.genie_requests (member_id, text, outcome) values (${memberId}, ${text}, ${outcome})`
    },
  }
}
