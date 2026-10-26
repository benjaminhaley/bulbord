import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

// Labs are small personal side projects (see CLAUDE.md's Labs section) that
// must never be able to affect the real app. Each one is mounted here under
// its own `/labs/<name>` prefix inside its own encapsulated Fastify scope, so
// its hooks/decorators can't leak out, and a lab that throws while loading is
// logged and skipped instead of failing the whole server's boot.
export interface Lab {
  name: string
  plugin: FastifyPluginAsync
}

export async function registerLabs(app: FastifyInstance, labs: Lab[]) {
  for (const lab of labs) {
    await app.register(async (parent) => {
      try {
        await lab.plugin(parent, {})
      } catch (err) {
        app.log.error({ err, lab: lab.name }, 'Lab failed to load; skipped')
      }
    }, { prefix: `/labs/${lab.name}` })
  }
}
