# LuaShield — Roblox Lua Obfuscator (v12 Engine + Discord Bot)

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
| `discord-bot/obfuscator.js` | **PRIMARY ENGINE (v12)** — ~2590 lines, the obfuscator |
| `discord-bot/bot.js` | Discord bot — slash commands, DM support, EN/ES i18n |
| `discord-bot/package.json` | Bot dependencies: discord.js, dotenv, luaparse |
| `discord-bot/.env.example` | Copy to `.env` and add `DISCORD_BOT_TOKEN` |
| `discord-bot/REPORT.md` | Technical report from previous agent sessions |
| `artifacts/api-server/src/lib/obfuscator.js` | Mirror copy of engine (keep in sync with discord-bot/) |
| `attached_assets/` | Sample Lua scripts for testing the obfuscator |
| `thebutton.txt` | Sample obfuscated output for Roblox testing |

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

## ENGINE ARCHITECTURE — obfuscator.js (v12)

### Protection Layers (9+ total)

#### LAYER A — VM Bytecode Compiler (v12)
4 VM shapes randomly selected per run:
- Dispatch Table (original)
- Linked-List (instructions as linked table nodes)
- Tokenized String VM (encode bytecode as binary string)
- Stack VM

Key properties:
- **36 opcodes** shuffled into a random permutation on EVERY obfuscation call
- **Penta-Key XOR** constant encryption: five independent rotating keys
- **Rolling XOR cipher** on bytecode fields
- **Dead Bytecode Injection** with proper jump offset remapping (FIXED in this session)
- **NOP Padding** with proper jump offset remapping (FIXED in this session)
- **Self-Hash Integrity Verification** (multi-point runtime checks)
- **Constant Pool Interleaving** (fake constants mixed with real)
- **Polymorphic Opcode Handlers** (multiple equivalent implementations)
- **Fake Dispatch Table Entries** (20-35 dead branches)
- **VM Nesting** (Russian doll VMs for max/ultra levels)

#### LAYER B — Token Passes
| Pass | Technique | Min level |
|------|-----------|-----------|
| L1 | Identifier renaming (scope-aware) | light |
| L2 | Strings → 9-pattern polymorphic encryption | light |
| L2.5 | String Array Rotation (indexed lookup with multi-key decode) | medium |
| L3 | Numbers → 40-pattern multi-step bit32 expressions | medium |
| L4 | Globals broken at runtime (_ENV concat lookup) | heavy |
| L5 | 100 realistic junk code patterns | medium |
| L6 | 36 opaque predicates | heavy |
| L7 | Control flow flattening (state-machine dispatcher) | heavy |
| L8 | Dead code path injection (unreachable branches) | heavy |

#### LAYER C — Anti-Hook + Anti-Debug Wrapper (v12)
- `bit32.bxor(0x41, 0x00)` fingerprint check
- `string.char(72)` consistency check
- `pcall` debug library detection
- Robust `_ENV` type check (compatible with Roblox executors) — FIXED
- Multi-layer `pcall` depth validation
- Metatable traps and honeypot detection
- Upvalue introspection trap
- Closure identity verification
- Stack depth validation
- Fake bytecode signature
- Multi-point watermark verification

---

## PRESETS (obfuscator.js)

```javascript
PRESETS.light  — rename + strings
PRESETS.medium — + numbers + junk + antiHook + stringArrayRotate
PRESETS.heavy  — + vmCompile + breakGlobals + opaquePredicates + envFingerprint + deadCodePaths + controlFlowFlatten
PRESETS.max    — heavy + vmNesting (double VM)
PRESETS.ultra  — max + tripleNesting (triple VM)
```

---

## CRITICAL FIXES APPLIED (this session)

### 1. Dead Bytecode Injection — Jump Offset Remapping (CRITICAL)
**Root cause of Roblox crash.** `injectDeadBytecode()` was inserting JMP + dead instructions
into the bytecode array WITHOUT adjusting existing JMP/FORPREP/FORLOOP/TFORLOOP relative
offsets. This corrupted all control flow (loops, ifs, breaks) in obfuscated scripts.

**Fix:** Build oldToNew index mapping before insertion, then remap all jump-bearing opcodes
after insertion using the mapping.

### 2. NOP Padding — Jump Offset Remapping (CRITICAL)
Same issue as above. `insertNopPadding()` inserted NOP instructions before existing
instructions, shifting all indices without adjusting jumps.

**Fix:** Same approach — oldToNew mapping with post-insertion remapping.

### 3. _ENV Type Check — Roblox Executor Compatibility
The anti-hook `_ENV` check (`type(_ENV)=="table"`) was too strict for Roblox executors
where `_ENV` might be nil or have unusual type. Changed to pcall-wrapped detection that
accepts "table", "nil", or "userdata".

### 4. VM Environment Setup — Robust Fallback Chain
Changed from `_ENV or (getfenv and getfenv() or {})` to a proper fallback chain:
`(type(_ENV)=="table" and _ENV) or (getfenv and getfenv(0)) or _G-based fallback`

### 5. File Corruption Cleanup
Removed duplicated PRESETS/module.exports at end of file (lines 2558-2598 were garbage).

---

## V13+ ROADMAP (what to do next)

### HIGH PRIORITY
1. **Bytecode compression (LZ77)** — The lz77Compress function exists but isn't used in the
   main VM code path. Integrate it to compress the serialized proto before embedding.
2. **Alternative VM dispatch keys** — Use `_DT[op ^ runtime_key]` instead of `_DT[op]`.
3. **Anti-decompile: fake jump table** — Insert large fake dispatch tables with dead branches.
4. **Encrypted Jump Offsets** — XOR jump targets with a runtime key.
5. **Register Base Shuffling** — Add random offset to all register indices.

### MEDIUM PRIORITY
6. **Persistent language storage** — Write userLang to JSON in bot.js.
7. **Dynamic Opcode Remapping** — Mid-execution opcode mutation.
8. **Metamorphic VM Shell** — Self-modifying dispatcher.
9. **Encrypted Upvalue Cells** — XOR'd upvalue storage.

### LOWER PRIORITY
10. **Rate limiting** for `/obfuscate` command.
11. **Stats tracking** — Count total obfuscations.
12. **`/status` command** — Show engine version, uptime.

---

## INTERNAL NOTES FOR AGENTS

### DO NOT DO
- Do not create web interfaces, React apps, or any UI
- Do not move the project to TypeScript (it's intentionally CommonJS/plain JS)
- Do not add databases or user accounts
- Do not change the Discord bot's EN/ES behavior without keeping both languages
- Do not break the `module.exports = { obfuscate, PRESETS }` interface
- **Do not add duplicate code** — check existing functions before adding new ones
- **Do not replace existing work** — extend and improve, never rewrite from scratch

### SYNC RULE
The engine exists in TWO places:
1. `discord-bot/obfuscator.js` — **primary, what the bot uses**
2. `artifacts/api-server/src/lib/obfuscator.js` — mirror copy

After editing the engine, always copy to both locations.

### Critical implementation details
- **Compiler class** (line ~230): `compile(ast)` → returns root `Proto`
- **Proto class** (line ~168): holds `bc[]`, `k[]`, `upvals[]`, `subProtos[]`, `gotoList[]`, `labelMap{}`
- **`makeOpcodeMap()`**: creates random permutation of 36 opcode names → integers
- **`buildVMCore(rootProto, ops)`**: orchestrates VM code generation
- **`serializeProto(proto)`**: serializes Proto to Lua table string
- **`encryptConstants(kst)`**: returns `{ encK, k1..k5 }` with penta rotating keys
- **`wrapAntiHook(code)`**: wraps code in anti-debug shell
- **`injectDeadBytecode(proto, ops)`**: injects dead instructions WITH jump remapping
- **`insertNopPadding(proto, ops)`**: inserts NOPs WITH jump remapping
- **`obfuscate(code, opts)`**: main entry point, returns `{ code, stats }`
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
