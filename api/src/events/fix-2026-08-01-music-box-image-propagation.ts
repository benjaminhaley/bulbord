import 'dotenv/config'
import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'

// The Music Box Indoor Kids seed (seed-2026-08-01-music-box-family-series.ts)
// ran as a local script against DATABASE_PUBLIC_URL with UPLOADS_KEY_PREFIX
// unset, per the documented production-DB workflow. Its uploaded images hit
// the known propagation gap (CLAUDE.md, Images & object storage): visible to
// a direct SDK read but 404 through the deployed API's /uploads/* proxy for
// an extended period, and a redeploy didn't clear it this time either. Worked
// around it per the documented fix — re-uploaded the same 3 images through
// POST /uploads on the deployed API itself (immediately servable, confirmed)
// — and this script repoints the 3 events at those URLs instead.
const fixes: { title: string; startDate: string; imageUrl: string; thumbnailUrl: string }[] = [
  {
    title: 'Indoor Kids: Hercules',
    startDate: '2026-08-01',
    imageUrl: '/uploads/feedback/295219e4-6f76-43e6-9c54-380cc7fe0cda.jpeg',
    thumbnailUrl: '/uploads/feedback/295219e4-6f76-43e6-9c54-380cc7fe0cda-thumb.jpg',
  },
  {
    title: 'Indoor Kids: Hercules',
    startDate: '2026-08-02',
    imageUrl: '/uploads/feedback/295219e4-6f76-43e6-9c54-380cc7fe0cda.jpeg',
    thumbnailUrl: '/uploads/feedback/295219e4-6f76-43e6-9c54-380cc7fe0cda-thumb.jpg',
  },
  {
    title: 'Indoor Kids: Jason and the Argonauts',
    startDate: '2026-08-08',
    imageUrl: '/uploads/feedback/0a3dbf9a-a80a-4e9b-a732-b0612a249dc0.jpeg',
    thumbnailUrl: '/uploads/feedback/0a3dbf9a-a80a-4e9b-a732-b0612a249dc0-thumb.jpg',
  },
  {
    title: 'Indoor Kids: Jason and the Argonauts',
    startDate: '2026-08-09',
    imageUrl: '/uploads/feedback/0a3dbf9a-a80a-4e9b-a732-b0612a249dc0.jpeg',
    thumbnailUrl: '/uploads/feedback/0a3dbf9a-a80a-4e9b-a732-b0612a249dc0-thumb.jpg',
  },
  {
    title: 'Indoor Kids: The Secret World of Arrietty',
    startDate: '2026-08-29',
    imageUrl: '/uploads/feedback/91efa815-7975-4b52-9ecb-98d3d299aaeb.jpeg',
    thumbnailUrl: '/uploads/feedback/91efa815-7975-4b52-9ecb-98d3d299aaeb-thumb.jpg',
  },
  {
    title: 'Indoor Kids: The Secret World of Arrietty',
    startDate: '2026-08-30',
    imageUrl: '/uploads/feedback/91efa815-7975-4b52-9ecb-98d3d299aaeb.jpeg',
    thumbnailUrl: '/uploads/feedback/91efa815-7975-4b52-9ecb-98d3d299aaeb-thumb.jpg',
  },
]

async function main() {
  for (const fix of fixes) {
    await db
      .update(events)
      .set({ imageUrl: fix.imageUrl, thumbnailUrl: fix.thumbnailUrl, updatedAt: new Date() })
      .where(and(eq(events.title, fix.title), eq(events.startDate, fix.startDate)))
  }
  console.log(`Repointed ${fixes.length} rows.`)
}

await main()
process.exit(0)
