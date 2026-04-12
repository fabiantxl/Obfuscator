# LuaShield — Lua/Luau Obfuscator for Roblox

## Overview

LuaShield is a high-strength Lua/Luau obfuscator targeting Roblox and executor environments. It consists of an obfuscation engine (`discord-bot/obfuscator.js`) and a Discord bot (`discord-bot/bot.js`). No web interface.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Language**: CommonJS/plain JavaScript (intentionally NOT TypeScript)
- **Parser**: luaparse (Lua 5.1/Luau AST)
- **Discord**: discord.js v14

## Architecture

### Engine (`discord-bot/obfuscator.js`)
- Custom Lua 5.1 bytecode compiler (AST → bytecode)
- VM code generator (polymorphic dispatch table, opaque predicates, encrypted constants)
- Pipeline: vmCompile → renameVars → encryptStrings → injectJunk → opaquePredicates → deadCodePaths → envFingerprint → antiHook → finalEncoding
- Presets: debug, light, medium, heavy, max, ultra
- VM shapes: DispatchTable, SwitchCase, IfChain, TokenizedString

### Discord Bot (`discord-bot/bot.js`)
- Slash commands for obfuscation
- File upload support (`.lua`, `.luau`, `.txt`)
- Preset selection and output delivery

## Key Files

- `discord-bot/obfuscator.js` — Main obfuscation engine (3100+ lines)
- `discord-bot/bot.js` — Discord bot entry point
- `discord-bot/package.json` — Bot dependencies
- `attached_assets/the button.lua` — Test source (473 lines)
- `thebutton.txt` — Test output (heavy preset)

## Sync Rule

After editing `discord-bot/obfuscator.js`, always run:
```
cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js
```

## Important Runtime Rules

- `loadstring` and `load` must NEVER be in the BREAKABLE globals set (executor-injected via getgenv())
- `game`, `workspace`, `script` are in ROBLOX_G and must not be broken/renamed
- Comparison opcodes (EQ/LT/LE/TEST) must never have dead code or NOPs inserted after them (skip-next semantics)
- LOADBOOL with c!=0 has the same skip-next behavior — protected from NOP/dead code injection
- `compileCallMultiRet` handles SELF (method calls with `:`) via explicit SELF opcode emission

## Bug Fixes Applied (v14.x)

1. **Dead bytecode after comparisons** — `injectDeadBytecode` excludes EQ/LT/LE/TEST and LOADBOOL(c!=0) from dead code insertion
2. **NOP padding after comparisons** — `insertNopPadding` checks `prevIsComp` and `prevIsSkipBool` before inserting NOPs
3. **Multi-return nested call register alignment** — `if (nret === 0) proto.nextReg = dest` fix
4. **SELF opcode in compileCallMultiRet** — Method calls (`:`) now emit SELF correctly for multi-return contexts
 proto.nextReg = dest;` before `const fnReg = proto.allocTemp();` in `compileCall()`. This ensures that for multi-return calls, `fnReg === dest`, matching the approach already used in `compileCallMultiRet()`.

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
