# LuaShield — Roblox Lua Obfuscator (v14.0 Engine + Discord Bot)

## MISSION
Build the **best Lua/Luau obfuscator for Roblox** — surpass Luraph in every measurable dimension:
strength, unpredictability, anti-analysis, and coverage of Lua AST nodes.

> **RULE: NO WEB INTERFACE.** The user has explicitly said: focus ONLY on the obfuscation engine
> and the Discord bot. Do not create websites, React apps, or any UI beyond the bot.

---

## KEY FILES

| File | Purpose |
|------|---------|
| `discord-bot/obfuscator.js` | **PRIMARY ENGINE (v14.0)** — ~3125 lines, the obfuscator |
| `discord-bot/bot.js` | Discord bot — slash commands, DM support, EN/ES i18n |
| `discord-bot/package.json` | Bot dependencies: discord.js, dotenv, luaparse |
| `discord-bot/.env.example` | Copy to `.env` and add `DISCORD_BOT_TOKEN` |
| `discord-bot/REPORT.md` | Technical report — READ THIS BEFORE EDITING |
| `attached_assets/the button.lua` | **Primary test source** (474 lines, canonical Roblox executor script) |
| `thebutton.txt` | **Obfuscated output** — always regenerated to this file (workspace root) |

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

## ENGINE VERSION: v14.0 — CRITICAL MULTI-RETURN REGISTER FIX

### What Was Fixed in v14.0 (THIS SESSION)

**CRITICAL: compileCall() multi-return register misalignment → nested call results at wrong register**

**Root Cause:**
In `compileCall()`, when a call expression is used as the last argument of another call (multi-return context, `nret=0`), the compiler allocated a new `fnReg` register AFTER the caller's `dest` register. The CALL opcode puts results at `fnReg`, but the outer call expected them at `dest`. Since `fnReg !== dest`, the outer call read uninitialized/stale register values instead of the actual return values.

**Symptom in Roblox:**
`invalid argument #1 to 'httpget' (Instance expected, got string)` — The specific pattern `loadstring(game:HttpGet(url))()` was affected. The `loadstring` call received `nil` (uninitialized R4) instead of the HTTP response (which was at R5). This caused cascading failures: loadstring returned nil, then calling nil errored.

**How It Was Found:**
Traced the bytecode compilation of `loadstring(game:HttpGet(repo .. "Library.lua"))()` through the register allocator. Found that `compileCall(httpGetCall, dest=R4, nret=0)` allocated `fnReg=R5`, so CALL put results at R5 while the outer loadstring CALL (with b=0) expected them starting at R4.

**Fix (1 line):**
Added `if (nret === 0) proto.nextReg = dest;` before `const fnReg = proto.allocTemp();` in `compileCall()`. This ensures that for multi-return calls, `fnReg === dest`, matching the approach already used in `compileCallMultiRet()`.

**Affected patterns (all fixed):**
- `loadstring(game:HttpGet(url))()` — nested method call as arg
- `tostring(game:GetService("Players"):FindFirstChild("x"))` — chained method calls
- `print(tostring(game:HttpGet("url")))` — deep nesting
- Any pattern where a call expression is the last argument of another call

**Tested Results (v14.0):**
- All 6 presets (debug/light/medium/heavy/max/ultra) produce valid Lua — tested with 8 complex nested-call patterns
- `thebutton.txt` regenerated with `heavy` preset (342 KB, VM active)
- Synced to `artifacts/api-server/src/lib/obfuscator.js`

---

## ENGINE VERSION: v13.9 — DISPATCH TABLE FIX

### What Was Fixed in v13.9 (Previous Session)

**CRITICAL: Dispatch Table Never Initialized — `attempt to index nil with number` at Runtime**
- `dt_` variable was randomly named but never declared as `local dt_ = {}` before handler assignments.
- Fix: Added `local ${dt_}={}` in `buildVMCore()` before handler assignments.

---

## ENGINE ARCHITECTURE — obfuscator.js (v14.0)

### Protection Layers (9+ total)

#### LAYER A — VM Bytecode Compiler (v14.0)
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
- **Correct multi-return register placement** (v14.0 fix)

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
The engine lives in ONE place only: `discord-bot/obfuscator.js`. The bot loads it directly via `require('./obfuscator')`. A mirror copy exists at `artifacts/api-server/src/lib/obfuscator.js`.

After editing the engine, always sync:
```bash
cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js
```

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

- `cd discord-bot && node bot.js` — run Discord bot
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js` — sync engine

---

## INTERNAL NOTES FOR AGENTS

### Critical implementation details in obfuscator.js

- **Compiler class** (line ~100): `compile(ast)` → returns root `Proto`
- **Proto class**: holds `code[]`, `kst[]`, `upvals[]`, `subProtos[]`, `gotoList[]`, `labelMap{}`
- **`makeOpcodeMap()`**: creates a random permutation of 35 opcode names → integers
- **`buildVMCore(rootProto, ops)`**: generates Lua VM code from compiled proto
- **`encryptConstants(kst)`**: returns `{ encK[], k1[], k2[] }` with dual rotating keys
- **`wrapAntiHook(code)`**: wraps code in anti-debug shell with bit32 fingerprint
- **`injectJunk(code)`**: inserts random junk lines between existing lines
- **`obfuscate(code, opts)`**: main entry point, returns `{ code, stats }`
- **`PRESETS`**: exported object with debug/light/medium/heavy/max/ultra option sets
- **`module.exports = { obfuscate, PRESETS }`**: CommonJS export

### compileCall multi-return fix (v14.0)
When `nret === 0` (multi-return context), `proto.nextReg` is set to `dest` before allocating `fnReg`, ensuring `fnReg === dest`. This matches the approach in `compileCallMultiRet()`. Without this, nested calls as arguments would have results at the wrong register offset.

### Jump offset remapping (critical for correctness)
All functions that modify bytecode arrays MUST maintain an `oldToNew` index mapping
and remap JMP/FORPREP/FORLOOP/TFORLOOP `b` fields after insertion.

### Goto backpatching
- `proto.gotoList` = array of `{ instrIdx, label }` for forward gotos
- `proto.labelMap` = `{ labelName: instrIdx }` for defined labels
- After compiling a function body, `proto.resolveGotos()` patches jump offsets

### Upvalue chain (deep)
- `resolveUpval(name, proto)` recursively walks parent protos
- Returns `{ is: 1, ix: regIdx }` if in parent's registers (instack)
- Returns `{ is: 0, ix: parentUVidx }` if upval-of-upval (2+ levels)
- CLOSURE opcode passes `parent_upcells` to child VM functions


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
