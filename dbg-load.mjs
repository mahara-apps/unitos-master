import { createServer } from 'vite'
const s = await createServer({ configFile: '/dev-server/vite.config.ts', root: '/dev-server', server: { middlewareMode: true } })
const env = s.environments.ssr
for (const id of ['/src/lib/tasks.functions.ts?tss-serverfn-split','/src/lib/monthly-plans.functions.ts?tss-serverfn-split']) {
  try {
    const m = await env.runner.import(id)
    console.log(id, 'OK exports:', Object.keys(m).slice(0,50))
  } catch (e) {
    console.log(id, 'FAIL', e && (e.stack || e.message))
  }
}
await s.close()
