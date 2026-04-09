# LuaShield — Roblox Lua/Luau Obfuscator (v14 Engine + Discord Bot)

## MISSION
Build the **best Lua/Luau obfuscator for Roblox** — surpass Luraph, IronBrew v3, and Moonsec in strength, unpredictability, anti-analysis, and coverage of Lua AST nodes.

> **RULE: NO WEB INTERFACE.** The user has explicitly said: focus ONLY on the obfuscation engine
> and the Discord bot. Do not create websites, React apps, or any UI beyond the bot.

---

## KEY FILES

| File | Purpose |
|------|---------|
| `discord-bot/obfuscator.js` | **PRIMARY ENGINE (v14)** — ~2680 lines, the obfuscator |
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

---

## ENGINE ARCHITECTURE — obfuscator.js (v14)

### Protection Layers (9+ total)

#### LAYER A — VM Bytecode Compiler (v14)
4 VM shapes randomly selected per run:
- Dispatch Table
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
- **SELF opcode FIXED** — `kst[c]` → `rk_(c)` for correct method calls

#### LAYER B — Token Passes
| Pass | Technique | Min level |
|------|-----------|-----------|
| L1 | Identifier renaming (scope-aware) | light |
| L2 | Strings → 9-pattern polymorphic encryption | light |
| L2.5 | String Array Rotation (indexed lookup with multi-key XOR decode) | medium |
| L3 | Numbers → 40-pattern multi-step bit32 expressions | medium |
| L4 | Globals broken at runtime (_ENV concat lookup) | heavy |
| L5 | 100+ realistic junk code patterns (Roblox-specific) | medium |
| L6 | 36 opaque predicates | heavy |
| L7 | Control flow flattening (elseif state-machine dispatcher) | heavy |
| L8 | Dead code path injection (unreachable branches) | heavy |

#### LAYER C — Anti-Hook + Anti-Debug Wrapper
- `bit32.bxor(0x41, 0x00)` fingerprint check
- `string.char(72)` consistency check
- `pcall` debug library detection
- Robust `_ENV` type check (compatible with Roblox executors: "table"|"nil"|"userdata")
- Multi-layer `pcall` depth validation (soft check: >=1)
- Metatable traps and honeypot detection
- Upvalue introspection trap
- Function type check (`type()` based)
- Stack depth validation
- Fake bytecode signature
- Multi-point watermark verification

---

## PRESETS

```javascript
PRESETS.light  — rename + strings
PRESETS.medium — + numbers + junk + antiHook + stringArrayRotate
PRESETS.heavy  — + vmCompile + breakGlobals + opaquePredicates + envFingerprint + deadCodePaths + controlFlowFlatten
PRESETS.max    — heavy + vmNesting (double VM)
PRESETS.ultra  — max + tripleNesting (triple VM)
```

---

## BUGS FIXED (HISTORY)

### v14 fixes (current session)
1. **controlFlowFlatten `end` count bug** — The old code joined cases with `\nelse` making deeply nested if-else blocks that needed N `end`s but only generated 2. FIXED: now uses `elseif` (one `if`/`end` pair for the whole chain). This was the root cause of Roblox error "Expected identifier when parsing expression, got 'do'".
2. **stringArrayRotate safety guard** — Skip rotation on scripts with any line > 50,000 chars (already minified/obfuscated scripts) to avoid luaparse failures on extremely long single-line code.
3. **Stress test results**: 0/400 failures across all presets on varied Roblox scripts.

### v13 fixes
- Fixed `insertPositions` undefined in `encryptConstants()`
- Fixed `unpack_` used before declaration in `buildVMCore()`
- Fixed injection passes (injectJunk, injectOpaquePredicates, injectDeadCodePaths) inserting at unsafe nesting depths — created `findSafeInsertionPoints()` helper
- Fixed SELF opcode: `kst[c]` → `rk_(c)`
- Fixed VM `_env` setup for Roblox userdata environments
- Fixed anti-hook pcall depth check (soft check)

---

## INTERNAL NOTES FOR AGENTS

### Key functions in obfuscator.js
- **`Compiler` class** (~line 230): `compile(ast)` → returns root `Proto`
- **`Proto` class** (~line 168): holds `bc[]`, `k[]`, `upvals[]`, `subProtos[]`, `gotoList[]`, `labelMap{}`
- **`makeOpcodeMap()`**: creates random permutation of 36 opcode names → integers
- **`buildVMCore(rootProto, ops)`**: orchestrates VM code generation
- **`encryptConstants(kst)`**: returns `{ encK, k1..k5 }` with penta rotating keys
- **`wrapAntiHook(code)`**: wraps code in anti-debug shell
- **`findSafeInsertionPoints(tokens, minDepth, maxDepth)`**: finds safe positions for injection
- **`rotateStringArray(toks)`**: string array encoding; returns `null` if unsafe (very long lines)
- **`flattenControlFlow(code)`**: uses elseif state-machine (requires only 2 `end`s total)
- **`obfuscate(code, opts)`**: main entry point, returns `{ code, stats }`
- **`PRESETS`**: exported object with light/medium/heavy/max/ultra option sets
- **`module.exports = { obfuscate, PRESETS }`**: CommonJS export

### Goto backpatching
- `proto.gotoList` = array of `{ instrIdx, label }` for forward gotos
- `proto.labelMap` = `{ labelName: instrIdx }` for defined labels
- After compiling a function body, `proto.resolveGotos()` patches jump offsets

### Upvalue chain (deep)
- `resolveUpval(name, proto)` recursively walks parent protos
- Returns `{ is: 1, ix: regIdx }` if in parent's registers (instack)
- Returns `{ is: 0, ix: parentUVidx }` if upval-of-upval (2+ levels)

### Jump offset remapping (critical for correctness)
All functions that modify bytecode arrays MUST maintain an `oldToNew` index mapping and remap JMP/FORPREP/FORLOOP/TFORLOOP `b` fields after insertion:
```
oldTarget = oldIdx + 1 + ins.b
newTarget = oldToNew[oldTarget]
newB = newTarget - newIdx - 1
```

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

After editing the engine, always run:
```bash
cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js
```
 anon) | OK |
| VarargLiteral (...) | OK |
| GotoStatement / LabelStatement | OK (backpatching) |
| Upvalues (1 level deep) | OK |
| Deep transitive upvalues (2+ closure levels) | OK (recursive resolveUpval) |
| Multiple returns from single call | OK |
| MemberExpression (dot access) | OK |
| IndexExpression (bracket access) | OK |
| BinaryExpression (all operators) | OK |
| LogicalExpression (and/or) | OK |
| UnaryExpression (-, not, #) | OK |
| TableConstructorExpression | OK |
| Self calls (colon syntax obj:method()) | OK (v13 SELF fix) |

### Token Passes (Layer B)
- L1: Identifier renaming (scope-aware)
- L2: String encryption (9 polymorphic patterns)
- L2.5: String array rotation
- L3: Number obfuscation (40 patterns)
- L4: Global name splitting
- L5: Junk code injection (100+ patterns with Roblox-specific patterns)
- L6: Opaque predicates (36 patterns)
- L7: Control flow flattening
- L8: Dead code path injection (10 patterns)

### Anti-Hook Wrapper (Layer C)
- bit32.bxor fingerprint
- string.char consistency
- pcall debug detection
- _ENV type check (Roblox-safe: allows "table", "nil", "userdata")
- pcall depth validation (soft check: pd_>=1 not ==3)
- Upvalue introspection trap
- Function type check (uses type() not tostring())
- Metatable traps
- Honeypot detection
- Multi-point watermark verification

---

## Testing

```bash
cd discord-bot
node -e "
const { obfuscate, PRESETS } = require('./obfuscator.js');
const tests = [
  'print(\"Hello\")',
  'for i=1,10 do print(i) end',
  'local function f(a,b) return a+b end print(f(3,4))',
  'local t={1,2,3} for k,v in ipairs(t) do print(k,v) end',
  'local x=10 local function o() local y=20 local function i() return x+y end return i() end print(o())',
];
for (const t of tests) {
  for (const l of ['light','medium','heavy','max']) {
    try { const r = obfuscate(t, PRESETS[l]); console.log('OK', l, r.code.length); }
    catch(e) { console.log('FAIL', l, e.message); process.exit(1); }
  }
}
console.log('ALL PASSED');
"
```

---

## V14+ Roadmap

### HIGH
1. Register base shuffling (randomize register index offsets in VM — needs ALL handler register accesses to use `regs[x+rb]`)
2. Dynamic opcode remapping (mid-execution mutation of opcode dispatch table)
3. Metamorphic VM shell (self-modifying dispatcher)
4. Encrypted upvalue cells (XOR'd upvalue storage with per-run key)

### MEDIUM
5. Persistent language storage in bot.js
6. LZ77 bytecode compression
7. Variable-length instruction encoding
8. More VM shapes (Hash-map dispatch, tree-based, etc.)

### LOW
9. Rate limiting for Discord bot
10. Stats tracking
11. /status command

---

## Jump Offset Remapping (Critical)
Any function modifying `proto.bc` MUST:
1. Build `oldToNew` mapping
2. Remap JMP/FORPREP/FORLOOP/TFORLOOP `b` fields using:
   `oldTarget = oldIdx + 1 + ins.b; newTarget = oldToNew[oldTarget]; newB = newTarget - newIdx - 1`

## Sync Rule
After editing `discord-bot/obfuscator.js`:
```bash
cp discord-bot/obfuscator.js artifacts/api-server/src/lib/obfuscator.js
```
