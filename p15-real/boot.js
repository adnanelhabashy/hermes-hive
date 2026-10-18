/* SENTRY P1.5 real-DOM harness — boot.
 *
 * Imports the plugin under test verbatim, gives it the same ctx surface the
 * desktop host gives it, lets its own boot path hydrate the atoms from the seed
 * blob, then mounts the entry it registered at ROUTES_AREA. No plugin source is
 * edited or rewritten anywhere in this path.
 */
import { mount } from '/stub.js'
import plugin from '/plugin.js'

const H = globalThis.__HIVE_HARNESS__ || {}
/* closed Radix menus live in a portal the harness does not have; hidden unless
   the capture is the one that asks for them inline (contract row 9). */
globalThis.__HIVE_INLINE_MENUS__ = /agent-detail/.test(String(H.state || ''))
const errors = globalThis.__HIVE_ERRORS__ || (globalThis.__HIVE_ERRORS__ = [])
const store = Object.assign({}, H.storage || {})
let sets = 0

const ctx = {
  register (entry) { entries.push(entry); return () => {} },
  onDispose () { return () => {} },
  subscribe () { return () => {} },
  storage: {
    get (key, dflt) {
      if (Object.prototype.hasOwnProperty.call(store, key)) return JSON.parse(JSON.stringify(store[key]))
      return dflt
    },
    set (key, value) {
      store[key] = JSON.parse(JSON.stringify(value))
      sets++
      globalThis.__HIVE_SETS__ = sets
    }
  }
}
const entries = []

try { plugin.register(ctx) } catch (e) { errors.push('register: ' + e.message) }

const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)))
await settle()
await settle()

const page = entries.find((e) => e.area === 'routes' && typeof e.render === 'function')
if (!page) {
  errors.push('no ROUTES_AREA entry registered; entries=' + JSON.stringify(entries.map((e) => e.id)))
} else {
  try {
    mount(document.getElementById('surface'), page.render())
  } catch (e) {
    errors.push('mount: ' + e.message)
  }
}
await settle()
await settle()

globalThis.__HIVE_READY__ = {
  mounted: !!document.querySelector('.ts-workspace'),
  entries: entries.map((e) => e.id + '@' + e.area),
  sets
}
