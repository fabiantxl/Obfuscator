# LuaShield Obfuscator — State Report
**Version:** v13.4
**Engine:** 4-Shape VM + 9+ Protection Layers
**Files:** `bot.js`, `obfuscator.js`, `package.json`
**Dependencies:** `discord.js@^14`, `dotenv@^16`, `luaparse@^0.3`

---

## IMPORTANT: Instructions for Next Agents

**DO NOT DUPLICATE OR REPLACE EXISTING WORK.** The following rules are mandatory:

1. **Continue the work, do not substitute or restart it.** Read this report and replit.md fully before making changes.
2. **No duplicates.** Before adding any function, pattern, or feature, search the existing code to ensure it doesn't already exist.
3. **Sync rule.** After editing `discord-bot/obfuscator.js`, copy to `artifacts/api-server/src/lib/obfuscator.js`.
4. **Test after every change.** Run the test scripts (see Testing section below) to verify correctness.
5. **Update this REPORT.md** with what you changed, what you fixed, and what remains.
6. **Do not create web interfaces.** Focus only on the engine and Discord bot.
7. **Do not move to TypeScript.** The project is intentionally CommonJS/plain JS.
8. **Preserve the `module.exports = { obfuscate, PRESETS }` interface.**

---

## Current State (as of v13.2)

### What's Working
- All 5 preset levels (light/medium/heavy/max/ultra) produce **valid Lua syntax** output — tested 20/20 rounds each for heavy and max
- VM compiler handles all major Lua AST nodes (see list below)
- 4 VM shapes (DispatchTable, LinkedList, TokenizedString, StackVM)
- Dead bytecode injection WITH correct jump offset remapping
- NOP padding WITH correct jump offset remapping
- Penta-key XOR constant encryption
- Rolling XOR cipher on bytecode fields
- Polymorphic opcode handlers
- Self-hash integrity verification
- Roblox-compatible _ENV handling in anti-hook wrapper
- Roblox-compatible VM environment setup (no setmetatable proxy)
- All token-level passes (rename, strings, numbers, globals, junk, predicates)
- Control flow flattening (FIXED in v13.2 — see below)
- String array rotation
- Dead code path injection
- Environment fingerprinting
- Expanded ROBLOX_G with 20+ Roblox service globals
- Rate limiting in Discord bot
- Stats tracking in Discord bot
- Persistent language storage (EN/ES) in Discord bot

### What Was Fixed (v13.4 — This Session)
1. **CRITICAL: `unpack_` temporal dead zone crash** — In `buildVMCore()`, `const unpack_ = randName()` was declared at line 1683 but used at lines 1665-1671 (inside the `vmShape` dispatch block, BEFORE the `const` declaration). In JavaScript, accessing a `const`/`let` before its declaration throws `Cannot access 'unpack_' before initialization` — a temporal dead zone error. This crashed the VM compiler for EVERY script, causing `vmUsed` to stay `false`.

   **Consequence:** When `vmUsed = false`, `breakGlobals` ran (because of the `!vmUsed` guard), converting `loadstring(...)` into `_ENV["loadstri".."ng"](...)`. In Roblox executors, `loadstring` is injected at `getgenv()` level — NOT into the local script's `_ENV`. So `_ENV.loadstring` was `nil`, causing `attempt to index nil with 'loadstring'`.

   **Fix:** Moved `const unpack_ = randName()` to BEFORE the `vmShape` selection (line 1662). VM now compiles the_button.lua successfully — `vmUsed: true`, `vmShape: DispatchTable/LinkedList/etc`, 100% VM active for heavy/max.

2. **`loadstring` and `load` removed from BREAKABLE set** — Even when the VM compiler falls back for a future unknown reason, `_ENV["loadstring"]` would still crash in Roblox. Removed `loadstring` and `load` from `BREAKABLE` entirely as a defense-in-depth fix. These are executor-injected globals, not standard `_ENV` entries.

3. **Verified**: heavy/max both 20/20 valid Lua, 100% VM active on the_button.lua (474 lines). `loadstring` appears raw (not broken through `_ENV[...]`).

### What Was Fixed (v13.3 — Previous Session)
1. **CRITICAL: All 3 token-pass injection functions inserted statements inside table constructors** — causing `'}' expected near 'do'` and `'}' expected near 'if'` on any complex real-world Roblox script (the_button.lua, scripts with multi-field table args like `:AddToggle("x", { Text=..., Default=... })`).

   - Added `netBracesOnLine(line)` helper that counts net `{`/`}` outside strings/comments per line — used to track running brace depth across all three injection passes.
   - **`injectJunk`**: added running `braceDepth` counter; only injects after lines where `braceDepth === 0`. Also tracks `lastMeaningful` line — skips injection after `return`/`break`/`goto` (Lua block terminators).
   - **`injectOpaquePredicates`**: replaced naive random-splice-with-offset approach with safe candidates list (pre-scanned, brace-depth-aware), picked without replacement, inserted back-to-front (descending sort) so earlier insertions don't shift later positions. Also excludes `return`/`break`/`goto` lines.
   - **`injectDeadCodePaths`**: added running `deadBraceDepth` counter; only injects when `braceDepth === 0`. Removed `tr === 'end,'` trigger (closing `end,` of a function-value table field looks safe but is inside a table constructor).

2. **Tested 50/50 rounds for medium/heavy/max/ultra on the user's real 474-line Roblox script** — zero failures.
3. **Tested 40/40 basic test cases** — no regressions.

### What Was Fixed (v13.2 — Previous Session)
1. **CRITICAL: File corruption** — The obfuscator.js file had a duplicated `module.exports`, PRESETS block, and orphaned code fragment (`ntity, honeypot trap)');`) at the end of the file. This caused `SyntaxError: Unexpected identifier 'trap'` on startup, making the entire engine non-functional. Fixed by removing the duplicate section.

2. **CRITICAL: `encryptConstants` referenced undefined `insertPositions`** — The return value referenced `insertPositions.map(ip => ip.pos)` which doesn't exist anywhere in the code, causing a ReferenceError crash during any VM-mode obfuscation. Fixed by removing that unused field.

3. **CRITICAL: Control Flow Flattening produced invalid Lua — the `do` error** — The `flattenControlFlow()` function was generating `else\nif ${stateVar}==X then` for the shuffled cases. In Lua, `else\nif` is a NESTED `if` block inside `else` (not `elseif`), requiring an extra `end` for each case. Since all cases were only closed with a single `end`, the Lua parser got confused about block boundaries — leading to the exact error: `Expected identifier when parsing expression, got 'do'`. **Fixed by using `elseif` keyword** — all cases now form a flat if-elseif-...-else-end chain with exactly ONE matching `end`.

4. **Verified**: All presets pass Lua syntax validation via `luaparse.parse()` after obfuscation, 20/20 rounds for heavy and max levels.

### What Was Fixed (v13.1 — Previous Session)
1. **Control flow flattening nesting depth tracker** — Fixed by tracking full Lua nesting depth and only allowing chunk splits when all counters are zero.

### What Was Fixed (v13 — Previous Session)
1. SELF opcode: `kst[c]` → `rk_(c)`
2. VM _env setup: no more setmetatable proxy
3. Anti-hook pcall depth: soft check (>=1)
4. Anti-hook function check: type() instead of tostring()
5. CALL b==0: vararg call handling
6. ROBLOX_G expanded
7. VARARG handler safety

### What Was Fixed (v12 — Previous Session)
1. Dead bytecode injection jump corruption
2. NOP padding jump corruption
3. Roblox _ENV compatibility
4. File corruption cleanup

---

## Root Cause of "Expected identifier when parsing expression, got 'do'" (SOLVED in v13.2)

The error:
```
Load error: mBgbdNZDpQpKBgaPsCMytzWZN:77: Expected identifier when parsing expression, got 'do'
```

**Diagnosis:** Control flow flattening was generating `else\nif state==X then` instead of `elseif state==X then`. In Lua, `else if` creates a nested `if` block inside `else`, so each case added one extra nesting level that was never properly closed. The Lua parser would eventually hit a keyword (like `do`) in a position where the grammar expected an identifier, because it thought it was inside an expression context.

**Fix:** Changed the shuffled cases dispatcher to use a proper `if-elseif-else-end` chain:
```lua
if state==X then
  ... chunk ...
  state=Y
elseif state==Y then
  ... chunk ...
  state=Z
else
  running=false
end
```
This is a flat, single-level construct with exactly one `end`.

---

## Architecture

### VM Bytecode Compiler (Layer A)
- **Compiler class** (~line 231): Parses AST → emits bytecode instructions
- **Proto class** (~line 168): Stores bytecode, constants, sub-protos, upvalues
- **36 opcodes** shuffled randomly per obfuscation run
- **4 VM shapes** randomly selected: DispatchTable, LinkedList, TokenizedString, StackVM
- **Penta-key XOR** on constants (5 independent rotating keys)
- **Rolling XOR** on bytecode fields
- **Dead bytecode injection** with JMP-over and proper offset remapping
- **NOP padding** with proper offset remapping
- **Self-hash integrity check** at runtime
- **Fake dispatch table entries** (20-35 dead branches)
- **Constant Pool Interleaving** (fake constants mixed with real)
- **VM nesting** (max/ultra: re-obfuscate the VM code through a second/third VM)

### Supported AST Nodes
| Node | Status |
|------|--------|
| LocalStatement | OK |
| AssignmentStatement (multi-assign from single call) | OK |
| CallStatement / CallExpression | OK |
| StringCallExpression / TableCallExpression | OK |
| IfStatement (if/elseif/else chains) | OK |
| WhileStatement | OK |
| RepeatStatement | OK |
| ForNumericStatement | OK |
| ForGenericStatement (pairs/ipairs/next) | OK |
| ReturnStatement (vararg returns) | OK |
| BreakStatement | OK |
| DoStatement | OK |
| FunctionDeclaration (local, global, a.b.c(), anon) | OK |
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
- L7: Control flow flattening (FIXED v13.2 — uses elseif chain)
- L8: Dead code path injection (10 patterns)

### Anti-Hook Wrapper (Layer C)
- bit32.bxor fingerprint
- string.char consistency
- pcall debug detection
- _ENV type check (Roblox-safe: allows "table", "nil", "userdata")
- pcall depth validation (soft check: pd_>=1)
- Upvalue introspection trap
- Function type check (uses type() not tostring())
- Metatable traps
- Honeypot detection
- Multi-point watermark verification

---

## Testing

### Primary integration test — the_button.lua (474 lines, complex Roblox executor script)
This is the canonical test for the engine. It must pass 20/20 rounds for heavy/max, vmUsed=true.
```bash
cd discord-bot
node -e "
const { obfuscate, PRESETS } = require('./obfuscator.js');
const luaparse = require('luaparse');
const fs = require('fs');
const code = fs.readFileSync('../attached_assets/the_button_1775775996255.lua', 'utf8');
for (const preset of ['light','medium','heavy','max']) {
  let ok = 0, fail = 0, vmCount = 0;
  const rounds = 20;
  for (let i = 0; i < rounds; i++) {
    const r = obfuscate(code, PRESETS[preset]);
    if (r.stats.vmUsed) vmCount++;
    try { luaparse.parse(r.code, { luaVersion: '5.2' }); ok++; }
    catch(e) { fail++; console.log('FAIL', preset, e.message.slice(0,80)); }
  }
  const ls = r2 = obfuscate(code, PRESETS[preset]);
  const hasLS = r2.code.includes('loadstri');
  console.log(preset + ': ' + ok + '/' + rounds + ' valid | VM: ' + vmCount + '/' + rounds + ' | loadstring-safe: ' + !hasLS);
}
"
```

### Syntax-only quick test (simpler scripts, all 5 presets)
```bash
cd discord-bot
node -e "
const { obfuscate, PRESETS } = require('./obfuscator.js');
const luaparse = require('luaparse');
const tests = [
  'print(\"Hello\")',
  'for i=1,10 do print(i) end',
  'local function f(a,b) return a+b end print(f(3,4))',
  'local t={1,2,3} for k,v in ipairs(t) do print(k,v) end',
  'local x=10 local function o() local y=20 local function i() return x+y end return i() end print(o())',
];
let ok = 0, total = 0;
for (const t of tests) {
  for (const l of ['light','medium','heavy','max','ultra']) {
    total++;
    try {
      const r = obfuscate(t, PRESETS[l]);
      luaparse.parse(r.code, {luaVersion:'5.2'});
      ok++;
    } catch(e) { console.log('FAIL', l, e.message.slice(0,80)); }
  }
}
console.log(ok + '/' + total + ' PASSED');
"
```

### Runtime checks to watch for in Roblox
- `loadstring(...)` must appear RAW — never as `_ENV["loadstr..."]`
- `require(...)` must appear raw or through standard global lookup
- VM should be active for heavy/max presets (check `r.stats.vmUsed === true`)

---

## V14+ Roadmap

### HIGH
1. Register base shuffling (randomize register index offsets in VM — needs ALL handler register accesses to use `regs[x+rb]`)
2. Dynamic opcode remapping (mid-execution mutation of opcode dispatch table)
3. Metamorphic VM shell (self-modifying dispatcher)
4. Encrypted upvalue cells (XOR'd upvalue storage with per-run key)

### MEDIUM
5. LZ77 bytecode compression (code exists in obfuscator.js but is not wired into the VM output path)
6. Variable-length instruction encoding
7. More VM shapes (Hash-map dispatch, tree-based, etc.)

### LOW
8. /status command for Discord bot
9. Better error messages when a Lua script fails to parse

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
