// A random, anonymous id for this browser (feedback #175: analytics now
// counts logged-out visitors too). It's generated locally and carries no
// personal information — it only lets the server tell "one visitor opened
// the app on three days" from "three visitors." Stored in localStorage (so
// it survives reloads); if storage is unavailable (private window) an
// in-memory id is used for the page's lifetime instead.
const STORAGE_KEY = 'bulbord_visitor_id'
let memoryId: string | null = null

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const created = randomId()
    localStorage.setItem(STORAGE_KEY, created)
    return created
  } catch {
    memoryId ??= randomId()
    return memoryId
  }
}
