# LuaShield Obfuscator — State Report
**Version:** v6  
**Engine:** Dispatch Table VM + 9 Protection Layers  
**Files:** `bot.js`, `obfuscator.js`, `package.json`  
**Dependencies:** `discord.js@^14`, `dotenv@^16`, `luaparse@^0.3`

---

## Architecture

### LAYER A — VM Bytecode Compiler (v6)
**Key upgrade over v5:** Dispatch Table VM (replaces if-elseif chain)

Instead of:
```lua
if op == 1 then ... elseif op == 2 then ... end
```
Generates:
```lua
local _DT = {}
_DT[op_LOADK] = function(a,b,c) regs[a]=kst[b] end
...
while true do
  local ins = bc[_pc[1]]; _pc[1] = _pc[1]+1
  local h = _DT[ins[1]]
  if h then h(ins[2],ins[3],ins[4]) end
  if _rn ~= 0 then break end
end
```

**Why this beats static analysis tools:** Decompilers can't reconstruct the original code structure from a dispatch table VM. Each opcode is an independent closure. The sentinel-RETURN pattern (`_rn`) avoids returning from nested closures. This is Luraph's primary technique.

**Constant encryption:** Dual-Key XOR — two independent rotating keys (k1 and k2) of different lengths. To crack a constant, an attacker must find both keys simultaneously. The keys are embedded in the proto table and only accessible at runtime.

**Opcodes:** 35 unique opcodes, shuffled into a random permutation on every single obfuscation call. Two runs of the same script produce completely different bytecode.

**Supported Lua AST nodes:**
| Node | Status |
|------|--------|
| LocalStatement | ✅ |
| AssignmentStatement (multi-assign from single call) | ✅ |
| CallStatement | ✅ |
| IfStatement (if/elseif/else chains) | ✅ |
| WhileStatement | ✅ |
| RepeatStatement | ✅ |
| ForNumericStatement | ✅ |
| ForGenericStatement (pairs/ipairs/next) | ✅ |
| ReturnStatement (including vararg returns) | ✅ |
| BreakStatement | ✅ |
| DoStatement | ✅ |
| FunctionDeclaration (local, global, a.b(), anon) | ✅ |
| VarargLiteral (...) | ✅ |
| Upvalues (GETUPVAL/SETUPVAL, 1 level deep) | ✅ |
| Multiple returns from single call | ✅ |
| GotoStatement / LabelStatement | ❌ (fallback to Layer B) |
| Deep transitive upvalues (2+ levels) | ❌ (partial) |

### LAYER B — Token Passes (v6)

| Pass | Technique | Minimum level |
|------|-----------|--------------|
| L1 | Identifier renaming (scope-aware) | light |
| L2 | Strings → dual-XOR IIFE (two independent keys, no named decryptor) | light |
| L3 | Numbers → multi-step bit32 expressions (5 patterns) | medium |
| L4 | Globals broken at runtime (`_ENV["pr".."int"]`) | heavy |
| L5 | Junk code injection (**20 patterns**, up from 10 in v5) | medium |
| L6 | Opaque predicates (math-guaranteed conditions) | heavy |

### LAYER C — Anti-Hook + Anti-Debug Wrapper (v6)
- `bit32.bxor(0x41, 0x00)` fingerprint check
- `string.char(72)` consistency check
- `pcall` debug library detection (executor detection)
- `_ENV` type sanity check
- Multi-layer `pcall` wrapping
- Fake bytecode signature (random bytes in proto)
- Unique hex hash per obfuscation run

---

## Comparison with competitors

| Feature | LuaShield v6 | IronBrew v3 | Luraph | Moonsec v3 |
|---------|:-----------:|:-----------:|:------:|:----------:|
| VM bytecode | ✅ | ✅ | ✅ | ✅ |
| Dispatch table VM | ✅ | ❌ | ✅ | ❌ |
| Shuffled opcodes per run | ✅ | ✅ | ✅ | ✅ |
| Dual-key constant encryption | ✅ | ❌ | Partial | ❌ |
| Generic for (pairs/ipairs) | ✅ | ✅ | ✅ | ✅ |
| Repeat/until | ✅ | ✅ | ✅ | ✅ |
| Upvalues | ✅ partial | ✅ | ✅ | Partial |
| Vararg | ✅ | ✅ | ✅ | ✅ |
| Multiple returns | ✅ | ✅ | ✅ | ✅ |
| Opaque predicates | ✅ | ❌ | ✅ | ❌ |
| Anti-hook (bit32/string check) | ✅ | ❌ | Partial | ❌ |
| Anti-debug (executor detection) | ✅ | ❌ | ❌ | ❌ |
| Global name splitting | ✅ | ❌ | ❌ | ❌ |
| 20-pattern junk injection | ✅ | ❌ | ❌ | ❌ |
| No named decryptor function | ✅ | ❌ | ❌ | ❌ |
| Slash commands (/obf) | ✅ | — | — | — |
| DM support | ✅ | — | — | — |
| EN/ES language selector | ✅ | — | — | — |

---

## Bot commands (v6)

| Command | Description |
|---------|-------------|
| `/obfuscate [level] [file] [code]` | Main command. Attach .lua file OR paste code directly |
| `/help` | Shows help with all levels explained (EN/ES) |
| `/language` | Shows language picker buttons |

**First use flow:** On first use of `/obfuscate` or `/help`, bot sends a language picker (English 🇺🇸 / Español 🇪🇸) with buttons. All subsequent messages use the chosen language. Language is stored in memory (per bot session).

---

## Roadmap for v7

### Medium priority
1. **Deep transitive upvalues** — closures nested more than 1 level deep
2. **Multiple-result vararg** — `...` expanded across multiple return positions
3. **GotoStatement / LabelStatement** — needed for some Roblox patterns
4. **Persistent language storage** — write to a JSON file so language survives bot restarts

### Lower priority
5. **Bytecode compression** — LZ77 before encryption reduces output size ~30%
6. **Alternative VM shapes** — randomly choose between dispatch table, linked-list, and if-chain VMs per run
7. **Self-hash verification** — script computes a checksum of its own bytecode at runtime
8. **Coroutine-based VM** — makes the call stack opaque to analysis tools

---

## Setup (Termux / VPS)

```bash
pkg install nodejs   # or: apt install nodejs
cd discord-bot
npm install
cp .env.example .env
# Edit .env and set:
#   DISCORD_BOT_TOKEN=your_token_here
node bot.js
```

## Notes for the next agent

- VM Compiler is in `obfuscator.js`, `Compiler` class
- Dispatch table is generated in `generateVMCode()` — huge template string
- `_pc` is a 1-element table `{1}` so all closures can mutate it (Lua upvalue)
- `_rn` sentinel: -1 = no-value return, >0 = N values stored in `_rv`
- Opcodes defined in `OP_NAMES[]`, shuffled by `makeOpcodeMap()`
- Constants: `CONST_BASE = 2000`, `KR(i) = 2000+i`, `isKR(x) = x >= 2000`
- Sub-protos indexed from 1 in Lua: `subp[b+1]`
- `encryptConstants()` returns `{ encK, k1, k2 }` — dual rotating keys
- Language stored in `userLang` Map in `bot.js` — reset on bot restart
- Bot handles DMs via `Partials.Channel` and `Partials.Message`
- Slash commands registered globally on `ready` — takes up to 1 hour on Discord
- For instant registration during dev: use `Routes.applicationGuildCommands(clientId, guildId)`
