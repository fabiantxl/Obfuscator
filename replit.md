# LuaShield — Roblox Lua Obfuscator (v13.5 Engine + Discord Bot)

## MISSION
Build the **best Lua/Luau obfuscator for Roblox** — surpass Luraph in every measurable dimension:
strength, unpredictability, anti-analysis, and coverage of Lua AST nodes.

> **RULE: NO WEB INTERFACE.** The user has explicitly said: focus ONLY on the obfuscation engine
> and the Discord bot. Do not create websites, React apps, or any UI beyond the bot.

---

## KEY FILES

| File | Purpose |
|------|---------|
| `discord-bot/obfuscator.js` | **PRIMARY ENGINE (v13.5)** — ~3100 lines, the obfuscator |
| `discord-bot/bot.js` | Discord bot — slash commands, DM support, EN/ES i18n |
| `discord-bot/package.json` | Bot dependencies: discord.js, dotenv, luaparse |
| `discord-bot/.env.example` | Copy to `.env` and add `DISCORD_BOT_TOKEN` |
| `discord-bot/REPORT.md` | Technical report — READ THIS BEFORE EDITING |
| `discord-bot/attached_assets/` | Sample Lua scripts for testing |

---

## HOW TO RUN THE BOT

```bash
cd discord-bot
npm install
cp .env.example .env
# Set DISCORD_BOT_TOKEN in .env (get from Discord Developer Portal)
node bot.js
```

---

## ENGINE VERSION: v13.5 — CRITICAL RUNTIME FIXES

### What Was Fixed in v13.5 (THIS SESSION)

1. **CALL c=1 not resetting `top_` (Stack Overflow — Line 264)**
   - After CALL with c=1 (discard results), `top_` was stale, causing RETURN/CALL/SETLIST b=0 to iterate garbage
   - Fix: `top_ = a` after c=1, `top_ = a + c - 2` after c>1

2. **RETURN b=0 with stale top_ (Line 264)**
   - Added bounds guard: `if top_ < a then top_ = a-1 end`
   - Fixed return value indexing to be 1-based from register a

3. **VM dispatch loop nil-index (crash on bc[idx] = nil)**
   - Added `if idx_ > #bc then break end` + `if not ins_ then break end` guards in all VM shapes

4. **VARARG nil-guard (Line 8 crash)**
   - Added `local _np = proto.np or 0`, `local _van = van_ or 0`
   - Clears registers beyond vararg range to prevent stale data

5. **CALL fn type check**
   - Descriptive error when non-function is called instead of cryptic nil-index

### New Feature: Debug Mode
- `PRESETS.debug` — VM only, no obfuscation, prints opcode trace to Roblox console (F9)
- Use `debug` level in `/obfuscate` bot command to diagnose runtime issues
- `_VMDBG=true` global enables opcode tracing in DispatchTable VM

### HTTP API (api-server)
- `POST /api/obfuscate` body: `{ code: string, level: string }` → `{ obfuscated, stats }`
- `GET /api/presets` → `{ presets: string[] }`

---

## ENGINE ARCHITECTURE — obfuscator.js (v13.5)

### Protection Layers (9+ total)

#### LAYER A — VM Bytecode Compiler (v13.5)
4 VM shapes randomly selected per run:
- Dispatch Table (original)
- Linked-List (instructions as linked table nodes)
- Tokenized String VM (encode bytecode as binary string)
- Stack VM

Key properties:
- **36 opcodes** shuffled into a random permutation on EVERY obfuscation call
- **Penta-Key XOR** constant encryption: five independent rotating keys
- **Rolling XOR cipher** on bytecode fields
- **Dead Bytecode Injection** with proper jump offset remapping
- **NOP Padding** with proper jump offset remapping
- **Self-Hash Integrity Verification** (multi-point runtime checks)
- **Constant Pool Interleaving** (fake constants mixed with real)
- **Polymorphic Opcode Handlers** (multiple equivalent implementations)
- **Fake Dispatch Table Entries** (20-35 dead branches)
- **VM Nesting** (Russian doll VMs for max/ultra levels)
- **Bounds-checked VM loop** (no nil-index on past-end PC)
- **Stack integrity** (top_ reset after every CALL, VARARG nil-guarded)

#### LAYER B — Token Passes
| Pass | Technique | Min level |
|------|-----------|-----------|
| L1 | Identifier renaming (scope-aware) | light |
| L2 | Strings → 9-pattern polymorphic encryption | light |
| L2.5 | String Array Rotation (indexed lookup with multi-key decode) | medium |
| L3 | Numbers → 40-pattern multi-step bit32 expressions | medium |
| L4 | Globals broken at runtime (_ENV concat lookup) | heavy |
| L5 | 100+ realistic junk code patterns (Roblox-specific) | medium |
| L6 | 36 opaque predicates | heavy |
| L7 | Control flow flattening (state-machine dispatcher) | heavy |
| L8 | Dead code path injection (unreachable branches) | heavy |

#### LAYER C — Anti-Hook + Anti-Debug Wrapper (v13)
- `bit32.bxor(0x41, 0x00)` fingerprint check
- `string.char(72)` consistency check
- `pcall` debug library detection
- Robust `_ENV` type check
- Multi-layer `pcall` depth validation
- Metatable traps and honeypot detection
- Upvalue introspection trap
- Stack depth validation

---

## PRESETS (obfuscator.js)

```javascript
PRESETS.debug  — VM only + opcode trace (for debugging in Roblox F9 console)
PRESETS.light  — rename + strings
PRESETS.medium — + numbers + junk + antiHook + stringArrayRotate
PRESETS.heavy  — + vmCompile + breakGlobals + opaquePredicates + envFingerprint + deadCodePaths + controlFlowFlatten + finalEncoding
PRESETS.max    — heavy + vmNesting (double VM)
PRESETS.ultra  — heavy + tripleNesting (triple VM)
```

---

## SYNC RULE
The engine lives in ONE place only: `discord-bot/obfuscator.js`. The bot loads it directly via `require('./obfuscator')`. Do not mirror it anywhere else.

---

## DO NOT DO
- Do not create web interfaces, React apps, or any UI
- Do not move the project to TypeScript (it's intentionally CommonJS/plain JS)
- Do not add databases or user accounts
- Do not change the Discord bot's EN/ES behavior without keeping both languages
- Do not break the `module.exports = { obfuscate, PRESETS }` interface
- Do not remove `loadstring` and `load` from the non-BREAKABLE set (they're executor-injected)

---

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9 (api-server only)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (api-server, not used by obfuscator)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `cd discord-bot && node bot.js` — run Discord bot
- `cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js` — sync engine

See REPORT.md for full technical details and history.
ts/api-server/src/lib/obfuscator.js` — mirror copy

After editing the engine, always copy to both locations:
```bash
cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js
```

### Last checkpoint (v13.4):
- Fixed `unpack_` temporal dead zone: `const unpack_ = randName()` was used before its declaration inside `buildVMCore()`. This crashed the VM compiler for EVERY script → `vmUsed` always false → `breakGlobals` ran → `_ENV["loadstring"]` nil crash in Roblox. Fixed by moving declaration above the vmShape selection.
- Fixed `loadstring`/`load` in BREAKABLE: removed from the set — these are executor-injected at getgenv() level, NOT available through `_ENV`. Would cause `attempt to index nil with 'loadstring'` in all executor contexts when VM falls back.
- Fixed all 3 injection passes (injectJunk, injectOpaquePredicates, injectDeadCodePaths): added brace depth tracking via `netBracesOnLine()` helper so no statements are injected inside `{ }` table constructors. Also exclude `return`/`break`/`goto` lines.
- Fixed flattenControlFlow: changed `else\nif` to `elseif` — flat if-elseif chain.
- Primary test: the_button.lua (474-line Roblox executor script) — 20/20 valid, 100% VM active for heavy/max, loadstring appears raw.
- Synced to artifacts/api-server/src/lib/obfuscator.js

### Jump offset remapping (critical for correctness)
All functions that modify bytecode arrays MUST maintain an `oldToNew` index mapping
and remap JMP/FORPREP/FORLOOP/TFORLOOP `b` fields after insertion. The formula is:
```
oldTarget = oldIdx + 1 + ins.b
newTarget = oldToNew[oldTarget]
newB = newTarget - newIdx - 1
```

- **`PRESETS`**: exported object with light/medium/heavy/max/ultra option sets
- **`module.exports = { obfuscate, PRESETS }`**: CommonJS export

### Jump offset remapping (critical for correctness)
All functions that modify bytecode arrays MUST maintain an `oldToNew` index mapping
and remap JMP/FORPREP/FORLOOP/TFORLOOP `b` fields after insertion. The formula is:
```
oldTarget = oldIdx + 1 + ins.b
newTarget = oldToNew[oldTarget]
newB = newTarget - newIdx - 1
```
 `_DT[op]`, use `_DT[op ^ runtime_key]`
   where `runtime_key` is computed from a hash of the environment.

7. **Anti-decompile: fake jump table** — insert a large fake dispatch table with
   dead branches that never execute but confuse decompiler heuristics.

### LOWER PRIORITY
8. **`/obfuscate` rate limiting** — per-user cooldown to prevent abuse.
9. **Stats tracking** — count total obfuscations, avg size increase, etc.
10. **`/status` command** — show engine version, uptime, total obfuscations.

---

## INTERNAL NOTES FOR AGENTS

### Critical implementation details in obfuscator.js

- **Compiler class** (line ~100): `compile(ast)` → returns root `Proto`
- **Proto class**: holds `code[]`, `kst[]`, `upvals[]`, `subProtos[]`, `gotoList[]`, `labelMap{}`
- **`makeOpcodeMap()`**: creates a random permutation of 35 opcode names → integers
- **`generateVMCode(rootProto, ops)`**: the huge template string that emits Lua VM code
- **`encryptConstants(kst)`**: returns `{ encK[], k1[], k2[] }` with dual rotating keys
- **`wrapAntiHook(code)`**: wraps code in anti-debug shell with bit32 fingerprint
- **`injectJunk(code)`**: inserts random junk lines between existing lines (30 patterns)
- **`injectOpaquePredicates(code)`**: inserts one guaranteed-false `if` error at 20% mark (10 patterns)
- **`obfuscate(code, opts)`**: main entry point, returns `{ code, stats }`
- **`PRESETS`**: exported object with light/medium/heavy/max option sets
- **`module.exports = { obfuscate, PRESETS }`**: CommonJS export (both files use require())

### Goto backpatching
- `proto.gotoList` = array of `{ instrIdx, label }` for forward gotos
- `proto.labelMap` = `{ labelName: instrIdx }` for defined labels
- After compiling a function body, `proto.resolveGotos()` patches jump offsets

### Upvalue chain (deep)
- `resolveUpval(name, proto)` recursively walks parent protos
- Returns `{ is: 1, ix: regIdx }` if in parent's registers (instack)
- Returns `{ is: 0, ix: parentUVidx }` if upval-of-upval (2+ levels)
- CLOSURE opcode passes `parent_upcells` to child VM functions

### DO NOT DO
- Do not create web interfaces, React apps, or any UI
- Do not move the project to TypeScript (it's intentionally CommonJS/plain JS)
- Do not add databases or user accounts
- Do not change the Discord bot's EN/ES behavior without keeping both languages
- Do not break the `module.exports = { obfuscate, PRESETS }` interface

### SYNC RULE
The engine exists in TWO places:
1. `discord-bot/obfuscator.js` — **primary, what the bot uses**
2. `artifacts/api-server/src/lib/obfuscator.js` — mirror copy

After editing the engine, always copy to both locations:
```bash
cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js
# or
cp artifacts/api-server/src/lib/obfuscator.js discord-bot/obfuscator.js
```
last checkpoint :
Let me check why VM nesting isn't producing significantly larger output (which it should):
