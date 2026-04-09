# LuaShield — Roblox Lua Obfuscator (v7 Engine + Discord Bot)

## MISSION
Build the **best Lua/Luau obfuscator for Roblox** — surpass Luraph in every measurable dimension:
strength, unpredictability, anti-analysis, and coverage of Lua AST nodes.

> **RULE: NO WEB INTERFACE.** The user has explicitly said: focus ONLY on the obfuscation engine
> and the Discord bot. Do not create websites, React apps, or any UI beyond the bot.
> The artifact `artifacts/luashield` (React/Vite) was a mistake and should be ignored.

---

## KEY FILES

| File | Purpose |
|------|---------|
| `discord-bot/obfuscator.js` | **PRIMARY ENGINE (v7)** — 1655 lines, the obfuscator |
| `discord-bot/bot.js` | Discord bot — slash commands, DM support, EN/ES i18n |
| `discord-bot/package.json` | Bot dependencies: discord.js, dotenv, luaparse |
| `discord-bot/.env.example` | Copy to `.env` and add `DISCORD_BOT_TOKEN` |
| `discord-bot/REPORT.md` | Technical report from previous agent sessions |
| `artifacts/api-server/src/lib/obfuscator.js` | Mirror copy of engine (keep in sync with discord-bot/) |
| `attached_assets/` | Sample Lua scripts for testing the obfuscator |

---

## HOW TO RUN THE BOT

```bash
cd discord-bot
npm install
cp .env.example .env
# Set DISCORD_BOT_TOKEN in .env (get from Discord Developer Portal)
node bot.js
```

The bot registers slash commands globally on `ready` — takes up to 1h on Discord.
For instant dev registration: change `Routes.applicationCommands` to
`Routes.applicationGuildCommands(clientId, guildId)` in bot.js.

---

## ENGINE ARCHITECTURE — obfuscator.js (v7)

### Protection Layers (9 total)

#### LAYER A — VM Bytecode Compiler (v7)
The core innovation. Compiles Lua AST to a custom bytecode, then generates Lua
code that runs a **Dispatch Table VM**:

```lua
local _DT = {}
_DT[op_LOADK] = function(a,b,c) regs[a]=kst[b] end
-- ... one closure per opcode ...
while true do
  local ins = bc[_pc[1]]; _pc[1] = _pc[1]+1
  local h = _DT[ins[1]]
  if h then h(ins[2],ins[3],ins[4]) end
  if _rn ~= 0 then break end
end
```

Key properties:
- **35 opcodes** shuffled into a random permutation on EVERY obfuscation call
  → Two runs of the same script produce completely different bytecode
- **Dual-Key XOR** constant encryption: two independent rotating keys of different
  lengths — attacker must find both simultaneously. Keys in proto table, runtime-only.
- **Coroutine execution wrapper** (v7): root program runs inside `coroutine.create/resume`,
  making `debug.sethook` completely useless across coroutine boundaries
- **CONST_BASE = 2000**: constants referenced as `kst[2000+i]`, `isKR(x) = x >= 2000`
- **`_pc`** is a 1-element table `{1}` so all closures share the same program counter
- **`_rn` sentinel**: -1 = no-value return, >0 = N values stored in `_rv`

#### Supported Lua AST nodes (as of v7):
| Node | Status |
|------|--------|
| LocalStatement | ✅ |
| AssignmentStatement (multi-assign from single call) | ✅ |
| CallStatement / CallExpression | ✅ |
| IfStatement (if/elseif/else chains) | ✅ |
| WhileStatement | ✅ |
| RepeatStatement | ✅ |
| ForNumericStatement | ✅ |
| ForGenericStatement (pairs/ipairs/next) | ✅ |
| ReturnStatement (vararg returns) | ✅ |
| BreakStatement | ✅ |
| DoStatement | ✅ |
| FunctionDeclaration (local, global, a.b.c(), anon) | ✅ |
| VarargLiteral (...) | ✅ |
| GotoStatement / LabelStatement | ✅ (v7 — backpatching for forward gotos) |
| Upvalues 1 level deep (GETUPVAL/SETUPVAL) | ✅ |
| Deep transitive upvalues (2+ closure levels) | ✅ (v7 — recursive resolveUpval) |
| Multiple returns from single call | ✅ |

#### LAYER B — Token Passes
| Pass | Technique | Min level |
|------|-----------|-----------|
| L1 | Identifier renaming (scope-aware) | light |
| L2 | Strings → dual-XOR IIFE (two independent keys, no named decryptor) | light |
| L3 | Numbers → multi-step bit32 expressions (5 patterns) | medium |
| L4 | Globals broken at runtime (`_ENV["pr".."int"]`) | heavy |
| L5 | Junk code injection (**30 patterns v7**, up from 20 in v6) | medium |
| L6 | Opaque predicates (**10 math-guaranteed conditions v7**, up from 5) | heavy |

#### LAYER C — Anti-Hook + Anti-Debug Wrapper (v7)
- `bit32.bxor(0x41, 0x00)` fingerprint check
- `string.char(72)` consistency check
- `pcall` debug library detection (executor detection)
- `_ENV` type sanity check
- Multi-layer `pcall` wrapping
- Fake bytecode signature (random bytes in proto)
- Unique hex hash per obfuscation run
- **Coroutine boundary guard** (v7) — invalidates `debug.sethook`

---

## DISCORD BOT — bot.js (v7)

### Commands
| Command | Description |
|---------|-------------|
| `/obfuscate [level] [file] [code]` | Attach .lua/.luau file OR paste code. 4 levels: light/medium/heavy/max |
| `/help` | Shows all protection levels explained (EN/ES) |
| `/language` | Shows EN/ES language picker buttons |

### Features
- **First-use language picker**: EN/ES buttons on first `/obfuscate` or `/help`
- **DM support**: works in DMs (via `Partials.Channel` and `Partials.Message`)
- **File upload**: reads attached `.lua`/`.luau` files, returns obfuscated file
- **Size limit**: 500 KB per file
- **Error feedback**: friendly error messages in EN/ES if Lua is invalid

### i18n
Language stored in `userLang` Map (in-memory, resets on bot restart).
**TODO**: persist to a JSON file so language survives restarts.

---

## PRESETS (obfuscator.js)

```javascript
PRESETS.light  — rename + strings
PRESETS.medium — + numbers + junk + antiHook
PRESETS.heavy  — + vmCompile + breakGlobals + opaquePredicates
PRESETS.max    — heavy + antiHook: true explicitly
```

---

## COMPARISON vs COMPETITORS (v7 status)

| Feature | LuaShield v7 | Luraph | IronBrew v3 | Moonsec v3 |
|---------|:-----------:|:------:|:-----------:|:----------:|
| Dispatch table VM | ✅ | ✅ | ❌ | ❌ |
| Shuffled opcodes per run | ✅ | ✅ | ✅ | ✅ |
| Dual-key XOR constants | ✅ | Partial | ❌ | ❌ |
| GotoStatement support | ✅ | ✅ | ❌ | ❌ |
| Deep upvalues (2+ levels) | ✅ | ✅ | Partial | ❌ |
| Coroutine VM execution | ✅ | ❌ | ❌ | ❌ |
| 30-pattern junk injection | ✅ | ❌ | ❌ | ❌ |
| 10 opaque predicates | ✅ | ✅ | ❌ | ❌ |
| Anti-hook (bit32 check) | ✅ | Partial | ❌ | ❌ |
| Anti-debug executor detect | ✅ | ❌ | ❌ | ❌ |
| Global name splitting | ✅ | ❌ | ❌ | ❌ |
| No named decryptor fn | ✅ | ❌ | ❌ | ❌ |
| luaparse 5.2 (goto parse) | ✅ | — | — | — |

---

## V7 COMPLETED (this session)

1. ✅ GotoStatement / LabelStatement compiler support (backpatching)
2. ✅ Deep transitive upvalue resolution (2+ closure levels, `resolveUpval()`)
3. ✅ VM function signature upgraded: `(proto, env, parent_regs, parent_upcells, ...)`
4. ✅ Coroutine VM wrapper (root execution in `coroutine.create/resume`)
5. ✅ luaparse configured with `luaVersion: '5.2'` (enables goto parsing)
6. ✅ Junk patterns expanded: 20 → 30
7. ✅ Opaque predicates expanded: 5 → 10
8. ✅ Anti-hook label updated: v6 → v7
9. ✅ `luaparse` added as dependency in `artifacts/api-server/package.json`
10. ✅ bot.js updated: all v6 references → v7, help text reflects new features

---

## V8 ROADMAP (what to do next)

### HIGH PRIORITY (critical for beating Luraph)
1. **Rolling XOR cipher on bytecode fields** — after encoding each instruction's
   fields (op, a, b, c) through a rolling XOR cipher derived from a per-run seed,
   the VM's dispatch closures decode before executing. Adds a layer that decompilers
   see as random data.

2. **Alternative VM shapes** — randomly pick one of 3 VM shapes per run:
   - Dispatch table (current)
   - Linked-list (instructions as linked table nodes)
   - Tokenized string VM (encode bytecode as a binary string, decode at runtime)
   Having 3 shapes means static signatures for "LuaShield" don't work.

3. **Self-hash verification** — at runtime, the script computes a `bit32` checksum
   of its own serialized bytecode and errors if tampered with.

4. **Bytecode compression** — run LZ77 over the encoded bytecode before
   embedding it. Reduces output size ~30% and makes the bytecode opaque.

### MEDIUM PRIORITY
5. **Persistent language storage** — write `userLang` to a JSON file in bot.js
   so EN/ES preference survives bot restarts.

6. **Multiple VM dispatch keys** — instead of `_DT[op]`, use `_DT[op ^ runtime_key]`
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
