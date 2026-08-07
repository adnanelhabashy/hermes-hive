# Buzz-Hive 🐝

A **Buzz-style agent crew room** that runs natively inside the **Hermes desktop
app** as a plugin pane. Up to 10 of your Hermes agent profiles share one room
with you and the default agent, each running in its **own dedicated session**.
Tag anyone with `@name`, and agents coordinate with each other the same way —
no external server, no copying between windows.

Inspired by [Block's Buzz](https://github.com/block/buzz) (a Nostr workspace
where humans and AI agents share rooms and coordinate over mentions). Buzz-Hive
is the Hermes-native version: the **plugin is the relay**, built on Hermes'
native concurrent per-profile sockets.

## ✨ What it does

- **One room, many agents** — add up to 10 of your existing Hermes profiles.
  Each member mints a fresh `session.create` on its profile, so no two members
  (and no member) shares your main desktop chat's context.
- **Route by mention** — type `@builder check the email` or `[to @builder] …`
  to direct one member; no tag broadcasts to the room.
- **Agents coordinate with each other** — `[to @name]`, `[ask @name]`, `[all]`.
  A rolling **room digest** is injected into every turn so each agent stays
  aware of the whole room without shared memory.
- **Per-member identity** — deterministic color accent per profile; every
  member is glanceable at a glance.
- **Live feedback** — pulsing "answering…" rows stream a member's partial text
  as it writes, so you're never staring at silence.
- **Control deck** — stop a member mid-turn, mute a member, toggle
  agent-to-agent relays (swarm), fresh per-member context, reset the whole room,
  grant the browser role to exactly one member.
- **Create profiles inline** — "New profile…" in the Add menu, mirroring the
  app's own create dialog.

## 📦 Install

```bash
git clone https://github.com/0-CYBERDYNE-SYSTEMS-0/buzz-hive.git ~/.hermes/desktop-plugins/buzz-hive
```

Then in the Hermes desktop app: the pane appears on the right within ~10s
(fs-watch hot-reloads it). If it doesn't show, press `⌘K` → **Reload desktop
plugins**.

> ⚠️ The **browser-role member** needs the browser/web toolset enabled in that
> profile's Settings — the toggle assigns the role, but tool permissions live in
> the profile config.

## 🎮 Use in 30 seconds

1. Right pane **Hive** appears after install.
2. **Add** → pick a profile (or `default` auto-seeds). Click a member chip for
   the control menu.
3. Type `@<name> <message>` in the composer and hit Enter.
4. Watch the live "answering…" row, then the reply pins to the timeline.
5. Room menu (sliders icon, top-right): renamable title, **swarm toggle**
   (agents talk to each other or only to you), **Reset room**.

## 🗺️ Roadmap

- [x] Per-profile color accents
- [x] Live streaming feedback
- [x] Reset room · Stop member · Mute · Swarm toggle
- [x] Dedicated sessions per member (+ Open session)
- [x] Timeline persistence, timestamps, light markdown
- [x] Inline profile creation
- [ ] Room presets (named crews)
- [ ] Per-member token/cost meter
- [ ] Advanced markdown + message actions (copy / resend)

## 🧪 Dev + tests

The coordination parser and routing are pure functions sliced out between
`// ── create-CORE-BEGIN` / `// --CORE-END--` markers and verified in Node, no
SDK needed:

```bash
cd ~/.hermes/desktop-plugins/buzz-hive && node test.cjs
```

## 🔎 How it works (grounded in Hermes source)

- Concurrent sessions across profiles are native: `apps/desktop/src/store/gateway.ts:9-16`.
- Members are minted with `session.create` and driven with `prompt.submit`.
- Stream events (`message.start`/`delta`/`complete`) drive the live feedback;
  `assistant.completed` is a fallback surface.
- Events carry the owning `profile`, so the plugin maps every turn to its member.

## 📄 License

MIT © 2026 TD
