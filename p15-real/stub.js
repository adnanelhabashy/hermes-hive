/* SENTRY P1.5 real-DOM harness — module double.
 *
 * Served by p15-real.mjs behind an import map, so the plugin under test is
 * imported VERBATIM (no source edit, no rewrite): the harness substitutes only
 * its three dependencies — 'react', 'react/jsx-runtime' and '@hermes/plugin-sdk'
 * — exactly the way the desktop host supplies them.
 *
 * What is real here:
 *   - every Hive and Ts component, hook and event handler in plugin.js,
 *   - the plugin's own injected stylesheet (HIVE_TS_CSS goes into <head> from
 *     hiveInjectStyles(), unchanged),
 *   - the app's shipped stylesheet (linked by the harness page),
 *   - the plugin's real boot path: register(ctx) -> hiveBootHydrate() reads the
 *     seed blob from ctx.storage and sets the atoms the components read.
 *
 * What is a double (and is disclosed in the QA record):
 *   - the mini-React runtime below (hooks + DOM creation + events),
 *   - the SDK primitives (Button/Input/... are re-expressed with the app's own
 *     Tailwind utilities and the real app stylesheet, but they are not the
 *     app's React binaries),
 *   - host.request / window.hermesDesktop.api answers, which are seeded so the
 *     captured states are the intended ones.
 */

/* ── tiny reactive store ─────────────────────────────────────────────────── */
const live = () => !!(globalThis.__HIVE_RENDER__ && globalThis.__HIVE_RENDER__.mounted)

export function atom(v) {
  const a = {
    _v: v, _subs: new Set(),
    get() { return a._v },
    set(nv) {
      const next = typeof nv === 'function' ? nv(a._v) : nv
      if (Object.is(next, a._v)) return
      a._v = next
      a._subs.forEach((f) => { try { f(next) } catch (e) { console.warn('sub', e) } })
      if (live()) schedule()
    },
    subscribe(f) { a._subs.add(f); return () => a._subs.delete(f) }
  }
  return a
}

/* ── hooks runtime ───────────────────────────────────────────────────────── */
const Fragment = Symbol('Fragment')
export { Fragment }

let store = new Map()      // path -> instance (hooks persist here)
let cur = null             // frame of the component currently rendering
let rootCounter = 0
let pending = false
let effects = []           // queued after-commit effects
let container = null
let rootVNode = null

export function schedule() {
  if (pending) return
  pending = true
  queueMicrotask(() => { pending = false; commit() })
}

function frameFor(kind) {
  const parent = cur
  const idx = parent ? parent.n++ : rootCounter++
  const path = parent ? parent.path + '/' + idx : 'R' + idx
  const inst = store.get(path) || { hooks: [], effects: [] }
  store.set(path, inst)
  const frame = { path, n: 0, h: 0, inst, kind, parent }
  cur = frame
  return frame
}

function slot(init) {
  const f = cur
  const i = f.h++
  if (f.inst.hooks.length <= i || f.inst.hooks[i] === undefined) f.inst.hooks[i] = init()
  return { v: f.inst.hooks[i], i, f }
}

export function useState(init) {
  if (!cur) throw new Error('useState outside a component render')
  const s = slot(() => ({ v: typeof init === 'function' ? init() : init }))
  const frame = s.f
  const set = (nv) => {
    const next = typeof nv === 'function' ? nv(s.v.v) : nv
    if (Object.is(next, s.v.v)) return
    s.v.v = next
    schedule()
  }
  return [s.v.v, set]
}

export function useRef(init) {
  const s = slot(() => ({ current: init }))
  return s.v
}

export function useMemo(fn, deps) {
  const s = slot(() => ({ deps: undefined, v: undefined }))
  const same = s.v.deps && deps && s.v.deps.length === deps.length &&
    s.v.deps.every((d, i) => Object.is(d, deps[i]))
  if (!same) { s.v.deps = deps; s.v.v = fn() }
  return s.v.v
}

export function useCallback(fn, deps) { return useMemo(() => fn, deps) }

export function useEffect(fn, deps) {
  const s = slot(() => ({ deps: undefined, cleanup: undefined }))
  const same = s.v.deps && deps && s.v.deps.length === deps.length &&
    s.v.deps.every((d, i) => Object.is(d, deps[i]))
  if (same) return
  s.v.deps = deps
  effects.push(() => {
    if (s.v.cleanup) { try { s.v.cleanup() } catch {} }
    const c = fn()
    s.v.cleanup = typeof c === 'function' ? c : undefined
  })
}

export function useLayoutEffect(fn, deps) { return useEffect(fn, deps) }

/* useValue: atoms already schedule a re-render, so reading is enough — the same
   contract the SDK gives components (value read synchronously, re-render on set). */
export function useValue(a) {
  if (!cur) throw new Error('useValue outside a component render')
  cur.inst.hooks.length // keep the frame referenced for symmetry
  return a.get()
}

/* ── vnode + DOM ─────────────────────────────────────────────────────────── */
export function jsx(type, props, key) { return { type, props: props || {}, key: key === undefined ? (props && props.key) : key } }
export const jsxs = jsx

const NUMERIC_PX = new Set(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'fontSize', 'lineHeight', 'marginLeft', 'marginTop', 'marginRight', 'marginBottom',
  'paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'top', 'left', 'right', 'bottom',
  'gap', 'rowGap', 'columnGap', 'flexBasis', 'borderRadius', 'letterSpacing', 'textIndent'])

function applyStyle(el, style) {
  for (const [k, v] of Object.entries(style || {})) {
    if (v === null || v === undefined) continue
    const css = k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    el.style.setProperty(css, typeof v === 'number' && NUMERIC_PX.has(k) ? v + 'px' : String(v))
  }
}

const EVENTS = /^on[A-Z]/
function applyProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined) continue
    if (k === 'children' || k === 'key' || k === 'ref') continue
    if (k === 'style') { applyStyle(el, v); continue }
    if (EVENTS.test(k)) {
      const type = k.slice(2).toLowerCase()
      el.addEventListener(type, (ev) => {
        try { v(ev) } catch (e) { console.warn('handler ' + k, e) }
      })
      continue
    }
    if (k === 'value') { el.value = v; el.setAttribute('value', String(v)); continue }
    if (k === 'checked') { el.checked = !!v; continue }
    if (k === 'className' || k === 'class') { el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v)); continue }
    if (k === 'dangerouslySetInnerHTML') { el.innerHTML = (v && v.__html) || ''; continue }
    if (v === false || v === true) { if (v === true) el.setAttribute(k, ''); continue }
    el.setAttribute(k, String(v))
  }
}

function renderHost(type, props) {
  const el = document.createElement(type === 'svg' ? 'svg' : type)
  applyProps(el, props)
  if (props && props.ref) {
    const r = props.ref
    if (typeof r === 'function') r(el)
    else if (r && typeof r === 'object') r.current = el
  }
  const node = renderNode(props && props.children, el)
  void node
  return el
}

function errorNode(where, err) {
  console.warn('[harness] component threw:', where && where.name, err)
  const box = document.createElement('div')
  box.setAttribute('data-harness-error', String(where && where.name))
  box.style.cssText = 'font:11px monospace;color:#cf2d56;padding:4px'
  box.textContent = '⚠ ' + (where && where.name) + ': ' + (err && err.message)
  return box
}

function renderComponent(Comp, props) {
  const frame = frameFor(Comp.name || 'anon')
  let out
  try { out = Comp(props || {}) } catch (e) { out = errorNode(Comp, e) }
  cur = frame.parent
  return renderNode(out)
}

function renderNode(v, into) {
  if (v === null || v === undefined || v === false || v === true || v === '') {
    if (into) return into
    return null
  }
  if (Array.isArray(v)) {
    let last = null
    for (const c of v) last = renderNode(c, into) || last
    return into || last
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const t = document.createTextNode(String(v))
    if (into) { into.appendChild(t); return into }
    return t
  }
  if (typeof v === 'function') return renderComponent(v, {})
  if (v && v.type) {
    if (v.type === Fragment) return renderNode(v.props && v.props.children, into)
    const node = typeof v.type === 'function'
      ? renderComponent(v.type, v.props)
      : renderHost(v.type, v.props || {})
    if (into && node) { into.appendChild(node); return into }
    return node
  }
  console.warn('[harness] unknown vnode', v)
  return into || null
}

export function mount(el, vnode) {
  container = el
  rootVNode = vnode
  globalThis.__HIVE_RENDER__ = { mounted: true, rerenders: 0 }
  commit(true)
}

function commit(first) {
  const saved = cur
  cur = null
  rootCounter = 0
  const tree = renderNode(rootVNode)
  cur = saved
  if (first) {
    container.textContent = ''
    if (tree) container.appendChild(tree)
  } else {
    // full re-render: keep the container, swap the subtree (deterministic, and
    // every capture is taken on a settled frame)
    container.textContent = ''
    const fresh = renderNode(rootVNode)
    if (fresh) container.appendChild(fresh)
    globalThis.__HIVE_RENDER__.rerenders++
  }
  const queued = effects
  effects = []
  for (const f of queued) { try { f() } catch (e) { console.warn('effect', e) } }
}

/* ── SDK double ──────────────────────────────────────────────────────────── */
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar-nav'
export const PALETTE_AREA = 'palette'

export function cn(...a) {
  return a.flat(Infinity).filter((x) => typeof x === 'string' && x).join(' ')
}
export function haptic() {}
export function profileColor(p) { return ACCENTS[hash(p) % ACCENTS.length] }
export function profileColorSoft(p) { return profileColor(p) }
const ACCENTS = ['hsl(208 72% 56%)', 'hsl(265 60% 55%)', 'hsl(150 55% 42%)', 'hsl(20 65% 52%)',
  'hsl(330 65% 52%)', 'hsl(45 70% 45%)', 'hsl(180 55% 42%)', 'hsl(280 50% 55%)', 'hsl(95 45% 40%)', 'hsl(0 60% 52%)']
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }

/* icons.* is a component factory: <Icon size={14} className="mr-1"/> */
const glyph = (name) => ({ size = 14, className = '', ...rest } = {}) =>
  jsx('span', {
    className: cn('inline-flex shrink-0 items-center justify-center', className),
    'data-icon': name, style: { width: size, height: size, fontSize: Math.round(size * 0.8), lineHeight: 1 },
    ...rest
  })
export const icons = new Proxy({}, {
  get(t, k) {
    if (k === 'then' || k === 'toJSON') return undefined
    if (!t[k]) t[k] = glyph(String(k))
    return t[k]
  }
})

const VARIANTS = {
  default: 'bg-[var(--ui-accent)] text-[var(--ui-bg-primary)] hover:opacity-90',
  outline: 'border border-[var(--ui-stroke-secondary)] bg-transparent hover:bg-[var(--ui-control-hover-background)]',
  ghost: 'bg-transparent hover:bg-[var(--ui-control-hover-background)]',
  destructive: 'bg-[var(--ui-danger,var(--ui-red))] text-[var(--ui-bg-primary)]',
  secondary: 'bg-[var(--ui-bg-tertiary)] hover:bg-[var(--ui-control-hover-background)]',
  link: 'underline text-[var(--ui-accent)]'
}
const SIZES = {
  xs: 'h-5 gap-1 px-1.5 text-[11px]',
  sm: 'h-6 gap-1 px-2 text-[12px]',
  md: 'h-7 gap-1.5 px-2.5 text-[13px]',
  lg: 'h-8 gap-2 px-3 text-[13px]',
  icon: 'h-7 w-7',
  'icon-micro': 'h-5 w-5'
}
const BASE = 'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium ' +
  'outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0'

export function Button({ variant = 'default', size = 'md', className, children, ...rest } = {}) {
  return jsx('button', {
    type: 'button', className: cn(BASE, VARIANTS[variant] || VARIANTS.default, SIZES[size] || SIZES.md, className),
    ...rest, children
  })
}
const FIELD = 'flex w-full rounded-md border border-[var(--ui-stroke-secondary)] bg-[var(--ui-bg-input,transparent)] ' +
  'px-2 text-[var(--ui-text-primary)] outline-none placeholder:text-[var(--ui-text-quaternary)]'
export function Input({ className, ...rest } = {}) { return jsx('input', { className: cn(FIELD, 'h-6 text-xs', className), ...rest }) }
export function Textarea({ className, ...rest } = {}) { return jsx('textarea', { className: cn(FIELD, 'py-1 text-xs', className), ...rest }) }
export function ScrollArea({ className, children, ...rest } = {}) {
  return jsx('div', { className: cn('overflow-y-auto overflow-x-hidden', className), ...rest, children })
}
export function Badge({ variant = 'muted', size = 'xs', className, children, ...rest } = {}) {
  const tones = {
    muted: 'bg-[var(--ui-bg-tertiary)] text-[var(--ui-text-secondary)]',
    warn: 'bg-[color-mix(in_srgb,var(--ui-yellow)_22%,transparent)] text-[var(--ui-yellow)]',
    danger: 'bg-[color-mix(in_srgb,var(--ui-red)_20%,transparent)] text-[var(--ui-red)]',
    good: 'bg-[color-mix(in_srgb,var(--ui-green)_20%,transparent)] text-[var(--ui-green)]'
  }
  return jsx('span', {
    className: cn('inline-flex items-center rounded border px-1 font-medium uppercase tracking-wide',
      size === 'xs' ? 'text-[10px] leading-[14px]' : 'text-[11px]', tones[variant] || tones.muted, className),
    ...rest, children
  })
}
export function StatusDot({ tone = 'neutral', className, ...rest } = {}) {
  const colours = { good: 'var(--ui-green)', warn: 'var(--ui-yellow)', bad: 'var(--ui-red)', busy: 'var(--ui-accent)', neutral: 'var(--ui-text-quaternary)' }
  return jsx('span', {
    className: cn('inline-block shrink-0 rounded-full', className),
    style: { width: 6, height: 6, background: colours[tone] || colours.neutral }, ...rest
  })
}
export function Switch({ checked, onCheckedChange, className, ...rest } = {}) {
  return jsx('button', {
    type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false',
    className: cn('relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border',
      checked ? 'bg-[var(--ui-accent)]' : 'bg-[var(--ui-bg-tertiary)]', className),
    onClick: () => onCheckedChange && onCheckedChange(!checked), ...rest,
    children: jsx('span', { className: cn('block h-3 w-3 rounded-full bg-white transition-transform', checked && 'translate-x-3') })
  })
}
export function SegmentedControl({ value, options = [], onValueChange, className, ...rest } = {}) {
  return jsx('div', {
    className: cn('inline-flex items-center gap-0.5 rounded-md bg-[var(--ui-bg-tertiary)] p-0.5', className), ...rest,
    children: (options || []).map((o) => jsx('button', {
      key: o.value || o, type: 'button', className: cn('rounded px-1.5 py-0.5 text-[11px]',
        (o.value || o) === value ? 'bg-[var(--ui-bg-elevated)] font-medium' : 'text-[var(--ui-text-secondary)]'),
      onClick: () => onValueChange && onValueChange(o.value || o), children: o.label || o.value || o
    }))
  })
}
export function Tabs({ value, onValueChange, children, className, ...rest } = {}) {
  return jsx('div', { className: cn(className), 'data-tabs': value, onValueChange, ...rest, children })
}
export function TabsList({ className, children, ...rest } = {}) {
  return jsx('div', { role: 'tablist', className: cn('inline-flex items-center', className), ...rest, children })
}
export function TabsTrigger({ value, className, children, style, ...rest } = {}) {
  return jsx('button', {
    type: 'button', role: 'tab', 'data-value': value, className: cn('inline-flex items-center justify-center rounded-sm',
      'data-[state=active]:bg-[var(--ui-bg-elevated)] data-[state=active]:font-medium', className),
    ...rest, style, children
  })
}
/* Dropdown/Select: the app renders these in a Radix portal, closed by default.
   The harness has no portal, so a closed menu's content is hidden here exactly
   as the portal hides it — otherwise a closed menu would paint inside the
   toolbar and be read as a layout defect. The single exception is the
   agent-detail state, whose contract row asks for the row's actions to be
   counted; __HIVE_INLINE_MENUS__ (set from the capture state in boot.js) forces
   that one case inline. */
export function DropdownMenu({ children }) { return jsx('div', { className: 'inline-flex', 'data-dropdown': true, children }) }
export function DropdownMenuTrigger({ children, ...rest }) { return jsx('span', { className: 'inline-flex', ...rest, children }) }
export function DropdownMenuContent({ children, className, ...rest } = {}) {
  if (!globalThis.__HIVE_INLINE_MENUS__) return null
  return jsx('div', { className: cn('absolute z-30 min-w-[8rem] rounded-md border border-[var(--ui-stroke-secondary)] bg-[var(--ui-bg-elevated)] p-1 shadow-lg', className), ...rest, children })
}
export function DropdownMenuItem({ children, onSelect, ...rest } = {}) {
  return jsx('button', { type: 'button', className: 'flex w-full items-center rounded-sm px-2 py-1 text-left text-xs hover:bg-[var(--ui-row-hover-background)]', onClick: onSelect, ...rest, children })
}
export function DropdownMenuSeparator() { return jsx('div', { className: 'my-1 h-px bg-[var(--ui-stroke-secondary)]' }) }
export function Select({ value, children }) { return jsx('div', { className: 'inline-flex flex-1', 'data-select': value, children }) }
export function SelectTrigger({ className, children, ...rest } = {}) { return jsx('button', { type: 'button', className: cn(FIELD, 'items-center justify-between', className), ...rest, children }) }
export function SelectValue({ placeholder = '', children }) { return jsx('span', { className: 'truncate text-[var(--ui-text-quaternary)]', children: children !== undefined ? children : placeholder }) }
export function SelectContent({ children, className, ...rest } = {}) {
  if (!globalThis.__HIVE_INLINE_MENUS__) return null
  return jsx('div', { className: cn('flex flex-col', className), ...rest, children })
}
export function SelectItem({ children, ...rest } = {}) { return jsx('div', { className: 'truncate px-1 py-0.5 text-xs', ...rest, children }) }

/* useQuery: the plugin's read path through TanStack Query. Seeded per capture. */
export const queryClient = { invalidateQueries() {}, setQueryData() {} }
const H = () => globalThis.__HIVE_HARNESS__ || {}
export function useQuery({ queryKey, queryFn }) {
  const key = (queryKey || []).join(':')
  const seeded = (H().queries || {})[key]
  if (seeded && seeded.__error) return { error: new Error(seeded.__error), data: undefined, isLoading: false, refetch() {} }
  if (seeded !== undefined && seedOf(key) !== undefined) return { data: seeded, error: null, isLoading: false, refetch() {} }
  return { data: seedOf(key), error: null, isLoading: false, refetch() {} }
}
function seedOf(key) {
  const q = H().queries || {}
  if (q[key] !== undefined) return q[key]
  if (key.includes('workflows')) return q.workflows
  return undefined
}

/* host — the desktop bridge. Every answer is seeded so the captured state is
   the one under review; nothing here reaches the real app. */
export const host = {
  request(method, params) {
    const answers = H().host || {}
    const answer = answers[method]
    if (answer && answer.__error) return Promise.reject(new Error(answer.__error))
    return Promise.resolve(answer === undefined ? {} : answer)
  },
  navigate(url) { (globalThis.__HIVE_NAV__ = globalThis.__HIVE_NAV__ || []).push(url) },
  notify(m) { (globalThis.__HIVE_NOTIFY__ = globalThis.__HIVE_NOTIFY__ || []).push(m) },
  onEvent(name, cb) { (globalThis.__HIVE_EVENTS__ = globalThis.__HIVE_EVENTS__ || {})[name] = cb; return () => delete globalThis.__HIVE_EVENTS__[name] },
  open() {},
  close() {}
}

/* window.hermesDesktop.api — the desktop REST bridge. The plugin reads the
   profile list from it (`/api/profiles`, hiveFetchProfiles) and that surface was
   the one gap in this double: the add-agent popover therefore rendered
   'Every profile is already in the room.' with no candidate rows, so the P-22
   per-row pin toggle had no evidence. Seeded from H().api[path]; the host
   double's `profiles.list` answer is the fallback for /api/profiles so the two
   seed styles stay interchangeable. Reads are cloned, writes are recorded and
   answered, never performed. */
const apiCalls = (globalThis.__HIVE_API_CALLS__ = globalThis.__HIVE_API_CALLS__ || [])
if (!globalThis.hermesDesktop) {
  globalThis.hermesDesktop = {
    api (opts = {}) {
      const path = String(opts.path || '')
      const method = String(opts.method || 'GET').toUpperCase()
      apiCalls.push({ path, method, body: opts.body })
      if (method !== 'GET') return Promise.resolve({ ok: true, path, method })
      const seeded = (H().api || {})[path]
      const answer = seeded !== undefined
        ? seeded
        : (path === '/api/profiles' ? (H().host || {})['profiles.list'] : undefined)
      if (answer === undefined) return Promise.reject(new Error('no double for ' + path))
      return Promise.resolve(JSON.parse(JSON.stringify(answer)))
    }
  }
}

/* a default export keeps `import sdk from '@hermes/plugin-sdk'` shaped like the
   real module even though the plugin uses named imports */
export default { atom, useValue, host, Button, Input, Textarea, ScrollArea, Badge, StatusDot, Switch,
  SegmentedControl, Tabs, TabsList, TabsTrigger, useQuery, queryClient, icons, cn, profileColor, profileColorSoft,
  haptic, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA }

globalThis.__HIVE_JSX__ = { jsx, jsxs, mount, Fragment, schedule }
