import 'dotenv/config'

import { resourceActiveEventSources } from './resourcing.js'

// Invoked weekly by a dedicated Railway cron service (feedback #131: "Should
// be a weekly job"), same standalone-script shape as
// newsletter/send-weekly.ts and camp-reminders/send-due.ts. Runs the exact
// same pipeline as Dev Tools' "Re-run event sourcing" admin button (see
// resourcing.ts) — automating a pass an admin previously had to remember to
// trigger by hand. resourceActiveEventSources() itself writes the one
// `events_log` summary row Dev Tools reads back as "keep some summary in
// admin of what has changed."
async function main() {
  const report = await resourceActiveEventSources('system:event-sourcing-cron')
  console.log(
    `Event sourcing run: checked ${report.sourcesChecked} source(s), added ${report.totalAdded}, skipped ${report.totalSkipped}.`,
  )
  for (const result of report.results) {
    if (result.error) {
      console.error(`  ${result.name}: error — ${result.error}`)
    } else if (result.added > 0) {
      console.log(`  ${result.name}: added ${result.added}, skipped ${result.skipped}`)
    }
  }
}

await main()
process.exit(0)
