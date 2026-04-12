# LuaShield Obfuscator — Workspace

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
- `attached_assets/the button.lua` — Test source (474 lines)
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

## Bug Fixes Applied (v15.x — Current)

### CRITICAL FIX (v15.0) — SELF Opcode Never Emitted (root cause of httpget error)

**Error:** `invalid argument #1 to 'httpget' (Instance expected, got string)`

**Root Cause:** `luaparse` AST uses `node.indexer` (not `node.indexType`) for the `:` method call separator. The compiler checked `node.base.indexType === ':'` which is always `undefined` → always `false`. This meant:
- The SELF opcode path was **never taken** for any method call
- `game:HttpGet(url)` compiled as `GETTABLE` (gets method) + loads url into the same register as `game`
- Result: `HttpGet(url)` called with url as arg#1 instead of `game` as self

**Fix:** Changed `node.base.indexType === ':'` → `node.base.indexer === ':'` in two places:
- `compileCallMultiRet` (line ~347): `isSelf` variable
- `compileCall` (line ~948): direct if-check

**Affected patterns (all now fixed):**
- `game:HttpGet(url)` — basic method call
- `loadstring(game:HttpGet(url))()` — nested as argument
- `game:GetService("Players"):FindFirstChild("x")` — chained method calls
- ANY `obj:method(args)` pattern in the obfuscated VM

**Tested Results (v15.0):**
- All 6 presets (debug/light/medium/heavy/max/ultra) produce valid Lua for the 474-line button.lua
- All common Roblox patterns confirmed working

---

## Previous Bug Fixes (v14.x)

1. **Dead bytecode after comparisons** — `injectDeadBytecode` excludes EQ/LT/LE/TEST and LOADBOOL(c!=0) from dead code insertion
2. **NOP padding after comparisons** — `insertNopPadding` checks `prevIsComp` and `prevIsSkipBool` before inserting NOPs
3. **Multi-return nested call register alignment** — `if (nret === 0) proto.nextReg = dest` fix
4. **SELF opcode in compileCallMultiRet** — Method calls (`:`) now emit SELF correctly for multi-return contexts (was also using `indexType`, now fixed to `indexer`)

---

## INTERNAL NOTES FOR AGENTS

### Critical implementation details in obfuscator.js

- **Compiler class** (line ~100): `compile(ast)` → returns root `Proto`
- **Proto class**: holds `code[]`, `kst[]`, `upvals[]`, `subProtos[]`, `gotoList[]`, `labelMap{}`
- **`makeOpcodeMap()`**: creates a random permutation of 35 opcode names → integers
- **`generateVMCode(rootProto, ops)`**: the huge template string that emits Lua VM code
- **`encryptConstants(kst)`**: returns `{ encK[], k1[], k2[], k3[], k4[], k5[] }` with penta rotating keys
- **`wrapAntiHook(code)`**: wraps code in anti-debug shell with bit32 fingerprint
- **`injectJunk(code)`**: inserts random junk lines between existing lines (30 patterns)
- **`injectOpaquePredicates(code)`**: inserts one guaranteed-false `if` error at 20% mark (10 patterns)
- **`obfuscate(code, opts)`**: main entry point, returns `{ code, stats }`
- **`PRESETS`**: exported object with light/medium/heavy/max option sets
- **`module.exports = { obfuscate, PRESETS }`**: CommonJS export (both files use require())

### luaparse AST field names (CRITICAL)

- `MemberExpression.indexer` — the separator character: `'.'` or `':'`
- **NOT** `indexType` (that field does not exist in luaparse output)
- Always check `node.indexer === ':'` to detect method calls

### SELF opcode semantics

For `obj:method(args)`, the VM compiles:
1. `GETGLOBAL fnReg, "obj"` — or GETLOCAL, GETTABLE, etc.
2. `SELF fnReg, objReg, KR("method")` — sets `regs[fnReg]=obj.method`, `regs[fnReg+1]=obj`
3. args placed in `regs[fnReg+2]`, `regs[fnReg+3]`, etc.
4. `CALL fnReg, b, c` — reads from `fnReg+1` onwards (includes self)

The CALL handler: `for i=a+1,a+b-1 do args[#args+1]=regs[i] end`
- For method call with 1 explicit arg: `b = (1+1)+1 = 3`, reads `regs[fnReg+1..fnReg+2]`

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
```
e Discord bot's EN/ES behavior without keeping both languages
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
