# LuaShield Obfuscator — State Report
**Version:** v12
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

## Current State (as of v12)

### What's Working
- All 5 preset levels (light/medium/heavy/max/ultra) produce valid output
- VM compiler handles all major Lua AST nodes (see list below)
- 4 VM shapes (DispatchTable, LinkedList, TokenizedString, StackVM)
- Dead bytecode injection WITH correct jump offset remapping
- NOP padding WITH correct jump offset remapping
- Penta-key XOR constant encryption
- Rolling XOR cipher on bytecode fields
- Polymorphic opcode handlers
- Self-hash integrity verification
- Roblox-compatible _ENV handling in anti-hook wrapper
- Roblox-compatible VM environment setup
- All token-level passes (rename, strings, numbers, globals, junk, predicates)
- Control flow flattening (non-VM mode only)
- String array rotation (non-VM mode only)
- Dead code path injection
- Environment fingerprinting

### What Was Fixed (Last Session)
1. **CRITICAL: Dead bytecode injection jump corruption** — `injectDeadBytecode()` was inserting instructions without remapping JMP/FORPREP/FORLOOP/TFORLOOP offsets. This was the root cause of the Roblox "Error occurred, no output from Luau" crash.
2. **CRITICAL: NOP padding jump corruption** — Same issue as above in `insertNopPadding()`.
3. **Roblox _ENV compatibility** — Anti-hook `_ENV` check was failing in executor contexts. Changed to pcall-wrapped detection.
4. **VM environment fallback** — More robust environment resolution chain.
5. **File corruption** — Removed duplicated PRESETS/module.exports at end of file.

---

## Architecture

### VM Bytecode Compiler (Layer A)
- **Compiler class** (~line 230): Parses AST → emits bytecode instructions
- **Proto class** (~line 168): Stores bytecode, constants, sub-protos, upvalues
- **36 opcodes** shuffled randomly per obfuscation run
- **4 VM shapes** randomly selected: DispatchTable, LinkedList, TokenizedString, StackVM
- **Penta-key XOR** on constants (5 independent rotating keys of different lengths)
- **Rolling XOR** on bytecode fields (per-instruction XOR with cycling key)
- **Dead bytecode injection** with JMP-over and proper offset remapping
- **NOP padding** with proper offset remapping
- **Self-hash integrity check** at runtime
- **Fake dispatch table entries** (20-35 dead branches)
- **Constant pool interleaving** (fake constants mixed with real)
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
| Self calls (colon syntax obj:method()) | OK |

### Token Passes (Layer B)
- L1: Identifier renaming (scope-aware)
- L2: String encryption (9 polymorphic patterns)
- L2.5: String array rotation
- L3: Number obfuscation (40 patterns)
- L4: Global name splitting
- L5: Junk code injection (100 patterns)
- L6: Opaque predicates (36 patterns)
- L7: Control flow flattening
- L8: Dead code path injection (10 patterns)

### Anti-Hook Wrapper (Layer C)
- bit32.bxor fingerprint
- string.char consistency
- pcall debug detection
- _ENV type check (Roblox-safe)
- pcall depth validation
- Upvalue introspection trap
- Closure identity check
- Metatable traps
- Honeypot detection
- Multi-point watermark verification

---

## Testing

```bash
node -e "
const { obfuscate, PRESETS } = require('./discord-bot/obfuscator.js');
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

## V13+ Roadmap

### HIGH
1. Integrate LZ77 bytecode compression into main path
2. VM dispatch key hardening (XOR'd opcode lookup)
3. Encrypted jump offsets
4. Register base shuffling

### MEDIUM
5. Persistent language storage in bot.js
6. Dynamic opcode remapping
7. Metamorphic VM shell
8. Encrypted upvalue cells

### LOW
9. Rate limiting
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
