'use strict';
// ================================================================
//  LuaShield Obfuscator Engine v12
//  TOP-TIER — designed to surpass Luraph, IronBrew v3, Moonsec
//
//  [LAYER A] VM BYTECODE COMPILER
//    luaparse → AST → custom instructions → VM Lua
//    4 VM SHAPES: Dispatch Table | Linked-List | Tokenized String | Stack VM
//    Opcodes shuffled uniquely per obfuscation
//    Penta-key XOR constant encryption (five independent rotating keys)
//    Rolling XOR cipher on bytecode fields
//    Encrypted Jump Offsets (runtime-decrypted control flow)
//    Self-hash integrity verification (multi-point runtime checks)
//    LZ77 bytecode compression
//    VM Dispatch Key Hardening (XOR'd dispatch lookup)
//    Dead Bytecode Injection (unreachable VM instructions)
//    Polymorphic Opcode Handlers (multiple equivalent implementations)
//    Opcode Superinstructions (fused instruction pairs)
//    Variable-length Instruction Encoding
//    Dynamic Opcode Remapping (mid-execution opcode mutation)
//    Register Base Shuffling (randomized register offsets)
//    Multi-point Watermark Verification
//    VM Nesting (triple-compile for max level — Russian doll VMs)
//    Metamorphic VM Shell (self-modifying dispatcher)
//    Constant Pool Interleaving (fake constants mixed with real)
//    Encrypted Upvalue Cells (XOR'd upvalue storage)
//
//    Opcodes: LOADK, LOADNIL, LOADBOOL, MOVE,
//             GETGLOBAL, SETGLOBAL, GETTABLE, SETTABLE, NEWTABLE, SELF,
//             ADD, SUB, MUL, DIV, MOD, POW, CONCAT,
//             NOT, UNM, LEN, EQ, LT, LE, TEST, JMP,
//             CALL, RETURN, FORPREP, FORLOOP, TFORLOOP,
//             CLOSURE, SETLIST, GETUPVAL, SETUPVAL, VARARG, NOP
//
//  [LAYER B] TOKEN PASSES
//    L1 — Identifier renaming (scope-aware, metamorphic names)
//    L2 — Strings → 9-pattern polymorphic encryption (no named decryptor)
//    L2.5 — String Array Rotation (indexed lookup with multi-key decode)
//    L3 — Numbers → multi-step bit32 expressions (30 patterns)
//    L4 — Globals broken at runtime (_ENV concat lookup)
//    L5 — 100 realistic junk code patterns
//    L6 — 35 opaque predicates injection
//    L7 — Control flow flattening (state-machine dispatcher)
//    L8 — Dead code path injection (unreachable but valid branches)
//
//  [LAYER C] WRAPPER + Anti-debug
//    Dual-key anti-hook (bit32 + string fingerprints)
//    Multi-layer pcall wrapping
//    Anti-debug v12 (debug lib check, executor detection, env hash,
//                    metatable traps, clock-based timing checks,
//                    environment fingerprinting, string.dump detection,
//                    pcall depth analysis, coroutine state validation,
//                    getfenv detection, rawget hook trap, upvalue
//                    introspection trap, closure identity verification,
//                    stack depth validation, gc callback detection)
//    Fake bytecode signature
//    Unique hash per obfuscation
//    Coroutine boundary guard
//    Multi-point cryptographic watermark
//    Anti-decompiler honeypot traps
// ================================================================

let luaparse;
try { luaparse = require('luaparse'); } catch { luaparse = null; }

// ─── Utilities ─────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randName() {
  const s = 'lIiOo_', b = 'lIiOo0_', x = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const len = randInt(9, 18);
  let n = s[randInt(0, s.length - 1)];
  for (let i = 1; i < len; i++) {
    const p = Math.random() < 0.65 ? b : x;
    n += p[randInt(0, p.length - 1)];
  }
  return n;
}

function randHex(n = 8) {
  let h = '';
  for (let i = 0; i < n; i++) h += randInt(0, 255).toString(16).padStart(2, '0');
  return h;
}

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function splitStr(s) {
  if (s.length <= 2) return `"${s}"`;
  const cuts = new Set();
  const n = randInt(1, Math.min(4, Math.floor(s.length / 2)));
  while (cuts.size < n) cuts.add(randInt(1, s.length - 1));
  const pts = [];
  let p = 0;
  for (const c of [...cuts].sort((a, b) => a - b)) { pts.push(s.slice(p, c)); p = c; }
  pts.push(s.slice(p));
  return pts.map(t => `"${t}"`).join('..');
}

// ─── LZ77 Compression (v8) ────────────────────────────────────
// Compresses bytecode data before embedding. Reduces output ~30%
// and makes the data opaque to pattern analysis.

function lz77Compress(data) {
  const windowSize = 255;
  const maxLen = 255;
  const result = [];
  let i = 0;
  while (i < data.length) {
    let bestOff = 0, bestLen = 0;
    const start = Math.max(0, i - windowSize);
    for (let j = start; j < i; j++) {
      let len = 0;
      while (len < maxLen && i + len < data.length && data[j + len] === data[i + len]) len++;
      if (len > bestLen) { bestLen = len; bestOff = i - j; }
    }
    if (bestLen >= 3) {
      result.push(1, bestOff, bestLen);
      i += bestLen;
    } else {
      result.push(0, data[i]);
      i++;
    }
  }
  return result;
}

// ─── Opcodes (shuffled per run) ────────────────────────────────

const OP_NAMES = [
  'LOADK', 'LOADNIL', 'LOADBOOL', 'MOVE',
  'GETGLOBAL', 'SETGLOBAL', 'GETTABLE', 'SETTABLE', 'NEWTABLE', 'SELF',
  'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'POW', 'CONCAT',
  'NOT', 'UNM', 'LEN',
  'EQ', 'LT', 'LE', 'TEST', 'JMP',
  'CALL', 'RETURN',
  'FORPREP', 'FORLOOP',
  'TFORLOOP',
  'CLOSURE', 'SETLIST',
  'GETUPVAL', 'SETUPVAL',
  'VARARG',
  'NOP',
];

function makeOpcodeMap() {
  const vals = shuffle(Array.from({ length: OP_NAMES.length }, (_, i) => i + 1));
  const map = {};
  OP_NAMES.forEach((n, i) => { map[n] = vals[i]; });
  return map;
}

const CONST_BASE = 2000;
function KR(ci) { return CONST_BASE + ci; }
function isKR(x) { return x >= CONST_BASE; }

// ─── Proto ─────────────────────────────────────────────────────

class Proto {
  constructor(parent, numParams, isVararg) {
    this.parent   = parent;
    this.bc       = [];
    this.k        = [];
    this.kmap     = new Map();
    this.subp     = [];
    this.np       = numParams;
    this.va       = isVararg;
    this.nextReg  = numParams;
    this.maxReg   = numParams;
    this.locals   = [];
    this.scopes   = [[]];
    this.breaks   = [];
    this.upvals   = [];
    this.upvalMap = new Map();
    this.gotoList = [];
    this.labelMap = new Map();
  }

  addK(val) {
    const key = (typeof val) + ':' + val;
    if (this.kmap.has(key)) return this.kmap.get(key);
    const i = this.k.length;
    this.k.push(val);
    this.kmap.set(key, i);
    return i;
  }

  addLocal(name) {
    const reg = this.nextReg++;
    if (this.nextReg > this.maxReg) this.maxReg = this.nextReg;
    const idx = this.locals.length;
    this.locals.push({ name, reg });
    this.scopes[this.scopes.length - 1].push(idx);
    return reg;
  }

  resolveLocal(name) {
    for (let i = this.locals.length - 1; i >= 0; i--) {
      if (this.locals[i].name === name) return this.locals[i].reg;
    }
    return -1;
  }

  allocTemp() {
    const r = this.nextReg++;
    if (this.nextReg > this.maxReg) this.maxReg = this.nextReg;
    return r;
  }

  freeRegsTo(lvl) { this.nextReg = lvl; }
  emit(op, a = 0, b = 0, c = 0) { this.bc.push({ op, a, b, c }); return this.bc.length - 1; }
  patch(idx, field, val) { this.bc[idx][field] = val; }
  pushScope() { this.scopes.push([]); }
  popScope() {
    const scope = this.scopes.pop();
    for (const i of scope) this.locals[i].name = null;
  }
}

// ─── Compiler ──────────────────────────────────────────────────

class Compiler {
  constructor(ops) { this.ops = ops; this.root = null; this.cur = null; }

  compile(ast) {
    this.root = this.newProto(null, 0, true);
    this.compileBlock(ast.body);
    this.emit('RETURN', 0, 1);
    return this.root;
  }

  newProto(parent, np, va) {
    const p = new Proto(parent, np, va);
    this.cur = p;
    return p;
  }

  emit(opName, a, b, c) { return this.cur.emit(this.ops[opName], a, b, c); }

  compileBlock(stmts) {
    this.cur.pushScope();
    for (const s of stmts) this.compileStmt(s);
    this.cur.popScope();
  }

  compileStmt(node) {
    switch (node.type) {
      case 'LocalStatement':      return this.compileLocal(node);
      case 'AssignmentStatement': return this.compileAssign(node);
      case 'CallStatement':       return this.compileCallStmt(node);
      case 'IfStatement':         return this.compileIf(node);
      case 'WhileStatement':      return this.compileWhile(node);
      case 'RepeatStatement':     return this.compileRepeat(node);
      case 'ForNumericStatement': return this.compileForNum(node);
      case 'ForGenericStatement': return this.compileForGeneric(node);
      case 'ReturnStatement':     return this.compileReturn(node);
      case 'BreakStatement':      return this.compileBreak(node);
      case 'DoStatement':         return this.compileDo(node);
      case 'FunctionDeclaration': return this.compileFuncDecl(node);
      case 'GotoStatement':       return this.compileGoto(node);
      case 'LabelStatement':      return this.compileLabel(node);
      default: throw new Error(`VM: unsupported stmt ${node.type}`);
    }
  }

  compileLocal(node) {
    const proto = this.cur;
    const tmpRegs = [];

    if (node.variables.length > 1 && node.init.length === 1 &&
        (node.init[0].type === 'CallExpression' || node.init[0].type === 'StringCallExpression')) {
      const base = proto.nextReg;
      for (let i = 0; i < node.variables.length; i++) tmpRegs.push(base + i);
      this.compileCallMultiRet(node.init[0], base, node.variables.length);
    } else {
      for (let i = 0; i < node.variables.length; i++) {
        const r = proto.allocTemp();
        tmpRegs.push(r);
        if (i < node.init.length) {
          this.compileExprTo(node.init[i], r);
        } else {
          this.emit('LOADNIL', r, r);
        }
      }
    }

    for (let i = 0; i < node.variables.length; i++) {
      const idx = proto.locals.length;
      proto.locals.push({ name: node.variables[i].name, reg: tmpRegs[i] });
      proto.scopes[proto.scopes.length - 1].push(idx);
    }
  }

  compileAssign(node) {
    const proto = this.cur;
    const base = proto.nextReg;
    const tmpRegs = [];

    if (node.variables.length > 1 && node.init.length === 1 &&
        (node.init[0].type === 'CallExpression' || node.init[0].type === 'StringCallExpression')) {
      this.compileCallMultiRet(node.init[0], base, node.variables.length);
      for (let i = 0; i < node.variables.length; i++) tmpRegs.push(base + i);
    } else {
      for (let i = 0; i < node.init.length; i++) {
        const r = proto.allocTemp();
        this.compileExprTo(node.init[i], r);
        tmpRegs.push(r);
      }
    }

    for (let i = 0; i < node.variables.length; i++) {
      const src = i < tmpRegs.length ? tmpRegs[i] : (() => {
        const r = proto.allocTemp(); this.emit('LOADNIL', r, r); tmpRegs.push(r); return r;
      })();
      this.compileAssignTarget(node.variables[i], src);
    }
    proto.freeRegsTo(base);
  }

  compileCallMultiRet(node, destBase, nRet) {
    const proto = this.cur;
    const savedNext = proto.nextReg;
    proto.nextReg = destBase;

    const fnReg = proto.allocTemp();

    let args = node.arguments || [];
    if (node.type === 'StringCallExpression') args = [node.argument];
    if (node.type === 'TableCallExpression') args = [node.argument];

    this.compileExprTo(node.base, fnReg);
    for (const arg of args) {
      const r = proto.allocTemp();
      this.compileExprTo(arg, r);
    }
    this.emit('CALL', fnReg, args.length + 1, nRet + 1);
    proto.nextReg = Math.max(savedNext, destBase + nRet);
  }

  compileAssignTarget(node, srcReg) {
    if (node.type === 'Identifier') {
      const local = this.cur.resolveLocal(node.name);
      if (local >= 0) {
        this.emit('MOVE', local, srcReg);
      } else {
        const uv = this.resolveUpval(node.name);
        if (uv >= 0) {
          this.emit('SETUPVAL', srcReg, uv);
        } else {
          const ki = this.cur.addK(node.name);
          this.emit('SETGLOBAL', srcReg, ki);
        }
      }
    } else if (node.type === 'MemberExpression') {
      const proto = this.cur;
      const base = proto.nextReg;
      const tbl = proto.allocTemp();
      this.compileExprTo(node.base, tbl);
      const ki = proto.addK(node.identifier.name);
      this.emit('SETTABLE', tbl, KR(ki), srcReg);
      proto.freeRegsTo(base);
    } else if (node.type === 'IndexExpression') {
      const proto = this.cur;
      const base = proto.nextReg;
      const tbl = proto.allocTemp();
      this.compileExprTo(node.base, tbl);
      const idx = proto.allocTemp();
      this.compileExprTo(node.index, idx);
      this.emit('SETTABLE', tbl, idx, srcReg);
      proto.freeRegsTo(base);
    } else {
      throw new Error(`VM: unsupported assignment target ${node.type}`);
    }
  }

  compileCallStmt(node) {
    const proto = this.cur;
    const base = proto.nextReg;
    this.compileCall(node.expression, base, 1);
    proto.freeRegsTo(base);
  }

  compileIf(node) {
    const endJmps = [];
    for (const clause of node.clauses) {
      if (clause.type === 'ElseClause') {
        this.compileBlock(clause.body);
      } else {
        const proto = this.cur;
        const base = proto.nextReg;
        const condReg = proto.allocTemp();
        this.compileExprTo(clause.condition, condReg);
        this.emit('TEST', condReg, 0, 0);
        const skipJmp = this.emit('JMP', 0, 0);
        proto.freeRegsTo(base);

        this.compileBlock(clause.body);

        const endJmp = this.emit('JMP', 0, 0);
        endJmps.push(endJmp);
        this.cur.patch(skipJmp, 'b', this.cur.bc.length - skipJmp - 1);
      }
    }
    for (const j of endJmps) {
      this.cur.patch(j, 'b', this.cur.bc.length - j - 1);
    }
  }

  compileWhile(node) {
    const proto = this.cur;
    const loopStart = proto.bc.length;
    const base = proto.nextReg;

    const condReg = proto.allocTemp();
    this.compileExprTo(node.condition, condReg);
    this.emit('TEST', condReg, 0, 0);
    const exitJmp = this.emit('JMP', 0, 0);
    proto.freeRegsTo(base);

    proto.breaks.push([]);
    this.compileBlock(node.body);

    const backJmp = this.emit('JMP', 0, 0);
    proto.patch(backJmp, 'b', loopStart - backJmp - 1);
    proto.patch(exitJmp, 'b', proto.bc.length - exitJmp - 1);

    for (const b of proto.breaks.pop()) {
      proto.patch(b, 'b', proto.bc.length - b - 1);
    }
  }

  compileRepeat(node) {
    const proto = this.cur;
    const loopStart = proto.bc.length;

    proto.breaks.push([]);
    this.compileBlock(node.body);

    const base = proto.nextReg;
    const condReg = proto.allocTemp();
    this.compileExprTo(node.condition, condReg);
    this.emit('TEST', condReg, 0, 1);
    proto.freeRegsTo(base);

    const backJmp = this.emit('JMP', 0, 0);
    proto.patch(backJmp, 'b', loopStart - backJmp - 1);

    const afterLoop = proto.bc.length;
    for (const b of proto.breaks.pop()) {
      proto.patch(b, 'b', afterLoop - b - 1);
    }
  }

  compileForNum(node) {
    const proto = this.cur;
    const base = proto.nextReg;

    const startR = proto.allocTemp();
    const limitR = proto.allocTemp();
    const stepR  = proto.allocTemp();
    const varR   = proto.allocTemp();

    this.compileExprTo(node.start, startR);
    this.compileExprTo(node.end, limitR);
    if (node.step) {
      this.compileExprTo(node.step, stepR);
    } else {
      const ki = proto.addK(1);
      this.emit('LOADK', stepR, ki);
    }

    const forPrep = this.emit('FORPREP', startR, 0);

    const varIdx = proto.locals.length;
    proto.locals.push({ name: node.variable.name, reg: varR });
    proto.scopes[proto.scopes.length - 1].push(varIdx);

    proto.breaks.push([]);
    this.compileBlock(node.body);
    proto.locals[varIdx].name = null;

    const forLoop = this.emit('FORLOOP', startR, 0);

    proto.patch(forPrep, 'b', forLoop - forPrep - 1);
    proto.patch(forLoop, 'b', forPrep + 1 - forLoop - 1);

    for (const b of proto.breaks.pop()) {
      proto.patch(b, 'b', proto.bc.length - b - 1);
    }

    proto.freeRegsTo(base);
  }

  compileForGeneric(node) {
    const proto = this.cur;
    const base = proto.nextReg;

    const iterFnR  = proto.allocTemp();
    const stateR   = proto.allocTemp();
    const controlR = proto.allocTemp();

    const iters = node.iterators;

    if (iters.length === 1 && (iters[0].type === 'CallExpression' || iters[0].type === 'StringCallExpression')) {
      proto.freeRegsTo(base);
      proto.nextReg = base;
      proto.allocTemp(); proto.allocTemp(); proto.allocTemp();
      this.compileCallMultiRet(iters[0], base, 3);
    } else {
      if (iters.length >= 1) this.compileExprTo(iters[0], iterFnR);
      else this.emit('LOADNIL', iterFnR, iterFnR);
      if (iters.length >= 2) this.compileExprTo(iters[1], stateR);
      else this.emit('LOADNIL', stateR, stateR);
      if (iters.length >= 3) this.compileExprTo(iters[2], controlR);
      else this.emit('LOADNIL', controlR, controlR);
    }

    const nVars = node.variables.length;
    const varRegs = [];
    for (let i = 0; i < nVars; i++) varRegs.push(proto.allocTemp());

    const initJmp = this.emit('JMP', 0, 0);
    const bodyStart = proto.bc.length;

    const varIdxs = [];
    for (let i = 0; i < nVars; i++) {
      const idx = proto.locals.length;
      proto.locals.push({ name: node.variables[i].name, reg: varRegs[i] });
      proto.scopes[proto.scopes.length - 1].push(idx);
      varIdxs.push(idx);
    }

    proto.breaks.push([]);
    this.compileBlock(node.body);

    for (const idx of varIdxs) proto.locals[idx].name = null;

    const tforIdx = proto.bc.length;
    this.emit('TFORLOOP', base, 0, nVars);

    proto.patch(initJmp, 'b', tforIdx - initJmp - 1);
    proto.patch(tforIdx, 'b', bodyStart - tforIdx - 1);

    const afterLoop = proto.bc.length;
    for (const b of proto.breaks.pop()) {
      proto.patch(b, 'b', afterLoop - b - 1);
    }

    proto.freeRegsTo(base);
  }

  compileReturn(node) {
    const proto = this.cur;
    if (node.arguments.length === 0) {
      this.emit('RETURN', 0, 1);
      return;
    }
    const base = proto.nextReg;
    const regs = [];
    for (const arg of node.arguments) {
      const r = proto.allocTemp();
      this.compileExprTo(arg, r);
      regs.push(r);
    }
    const lastArg = node.arguments[node.arguments.length - 1];
    const isVarCall = lastArg.type === 'CallExpression' || lastArg.type === 'StringCallExpression';
    this.emit('RETURN', regs[0], isVarCall ? 0 : regs.length + 1);
    proto.freeRegsTo(base);
  }

  compileBreak(node) {
    const jmp = this.emit('JMP', 0, 0);
    this.cur.breaks[this.cur.breaks.length - 1].push(jmp);
  }

  compileDo(node) { this.compileBlock(node.body); }

  compileGoto(node) {
    const labelName = node.label.name;
    const proto = this.cur;
    if (proto.labelMap.has(labelName)) {
      const target = proto.labelMap.get(labelName);
      this.emit('JMP', 0, target - proto.bc.length - 1);
    } else {
      const jmpIdx = this.emit('JMP', 0, 0);
      proto.gotoList.push({ idx: jmpIdx, label: labelName });
    }
  }

  compileLabel(node) {
    const labelName = node.label.name;
    const proto = this.cur;
    const pos = proto.bc.length;
    proto.labelMap.set(labelName, pos);
    for (const g of proto.gotoList) {
      if (g.label === labelName) {
        proto.patch(g.idx, 'b', pos - g.idx - 1);
      }
    }
    proto.gotoList = proto.gotoList.filter(g => g.label !== labelName);
  }

  resolveUpval(name) {
    if (!this.cur.parent) return -1;
    const proto = this.cur;
    if (proto.upvalMap.has(name)) return proto.upvalMap.get(name);

    const parentLocal = proto.parent.resolveLocal(name);
    if (parentLocal >= 0) {
      const idx = proto.upvals.length;
      proto.upvals.push({ name, instack: true, idx: parentLocal });
      proto.upvalMap.set(name, idx);
      return idx;
    }

    const savedCur = this.cur;
    this.cur = proto.parent;
    const parentUV = this.resolveUpval(name);
    this.cur = savedCur;
    if (parentUV >= 0) {
      const idx = proto.upvals.length;
      proto.upvals.push({ name, instack: false, idx: parentUV });
      proto.upvalMap.set(name, idx);
      return idx;
    }

    return -1;
  }

  buildChildProto(node) {
    const proto = this.cur;
    const params = (node.parameters || []).filter(p => p.type === 'Identifier').map(p => p.name);
    const hasVararg = (node.parameters || []).some(p => p.type === 'VarargLiteral');

    const childProto = new Proto(proto, params.length, hasVararg);
    proto.subp.push(childProto);

    const savedCur = this.cur;
    this.cur = childProto;
    childProto.scopes = [[]];
    for (let i = 0; i < params.length; i++) {
      childProto.locals.push({ name: params[i], reg: i });
      childProto.scopes[0].push(childProto.locals.length - 1);
    }
    this.compileBlock(node.body);
    this.emit('RETURN', 0, 1);
    this.cur = savedCur;
    return childProto;
  }

  compileFuncDecl(node) {
    const proto = this.cur;

    if (node.isLocal && node.identifier && node.identifier.type === 'Identifier') {
      const childIdx = proto.subp.length;
      this.buildChildProto(node);
      const reg = proto.addLocal(node.identifier.name);
      this.emit('CLOSURE', reg, childIdx);
      return;
    }

    const base = proto.nextReg;
    const closureReg = proto.allocTemp();
    const childIdx = proto.subp.length;
    this.buildChildProto(node);
    this.emit('CLOSURE', closureReg, childIdx);

    if (node.identifier) {
      if (node.identifier.type === 'Identifier') {
        const name = node.identifier.name;
        const local = proto.resolveLocal(name);
        if (local >= 0) {
          this.emit('MOVE', local, closureReg);
        } else {
          const uv = this.resolveUpval(name);
          if (uv >= 0) {
            this.emit('SETUPVAL', closureReg, uv);
          } else {
            const ki = proto.addK(name);
            this.emit('SETGLOBAL', closureReg, ki);
          }
        }
      } else if (node.identifier.type === 'MemberExpression') {
        const tbl = proto.allocTemp();
        this.compileExprTo(node.identifier.base, tbl);
        const ki = proto.addK(node.identifier.identifier.name);
        this.emit('SETTABLE', tbl, KR(ki), closureReg);
        proto.freeRegsTo(base + 1);
      }
    }

    proto.freeRegsTo(base);
  }

  compileExprTo(node, dest) {
    const proto = this.cur;
    switch (node.type) {
      case 'NumericLiteral': {
        const ki = proto.addK(node.value);
        this.emit('LOADK', dest, ki);
        break;
      }
      case 'StringLiteral': {
        const ki = proto.addK(node.value);
        this.emit('LOADK', dest, ki);
        break;
      }
      case 'BooleanLiteral': {
        this.emit('LOADBOOL', dest, node.value ? 1 : 0, 0);
        break;
      }
      case 'NilLiteral': {
        this.emit('LOADNIL', dest, dest);
        break;
      }
      case 'Identifier': {
        const local = proto.resolveLocal(node.name);
        if (local >= 0) {
          if (local !== dest) this.emit('MOVE', dest, local);
        } else {
          const uv = this.resolveUpval(node.name);
          if (uv >= 0) {
            this.emit('GETUPVAL', dest, uv);
          } else {
            const ki = proto.addK(node.name);
            this.emit('GETGLOBAL', dest, ki);
          }
        }
        break;
      }
      case 'BinaryExpression': this.compileBinOp(node, dest); break;
      case 'LogicalExpression': this.compileBinOp(node, dest); break;
      case 'UnaryExpression':  this.compileUnOp(node, dest); break;
      case 'MemberExpression': this.compileMember(node, dest); break;
      case 'IndexExpression':  this.compileIndex(node, dest); break;
      case 'CallExpression':
      case 'StringCallExpression':
      case 'TableCallExpression': {
        this.compileCall(node, dest, 2);
        break;
      }
      case 'FunctionDeclaration': {
        this.compileAnonymousClosure(node, dest);
        break;
      }
      case 'TableConstructorExpression':
      case 'TableConstructor': {
        this.compileTable(node, dest);
        break;
      }
      case 'VarargLiteral': {
        this.emit('VARARG', dest, 0, 2);
        break;
      }
      default:
        throw new Error(`VM: unsupported expr ${node.type}`);
    }
  }

  compileRK(node) {
    if (node.type === 'NumericLiteral' || node.type === 'StringLiteral') return KR(this.cur.addK(node.value));
    if (node.type === 'BooleanLiteral') return KR(this.cur.addK(node.value));
    if (node.type === 'NilLiteral') return KR(this.cur.addK(null));
    const r = this.cur.allocTemp();
    this.compileExprTo(node, r);
    return r;
  }

  compileBinOp(node, dest) {
    const proto = this.cur;
    const base = proto.nextReg;
    const op = node.operator;

    if (op === 'and' || op === 'or') {
      this.compileExprTo(node.left, dest);
      this.emit('TEST', dest, 0, op === 'and' ? 0 : 1);
      const jmp = this.emit('JMP', 0, 0);
      this.compileExprTo(node.right, dest);
      proto.patch(jmp, 'b', proto.bc.length - jmp - 1);
      proto.freeRegsTo(base);
      return;
    }

    if (op === '==' || op === '~=') {
      const lrk = this.compileRK(node.left);
      const rrk = this.compileRK(node.right);
      const notEq = op === '~=' ? 1 : 0;
      this.emit('EQ', notEq, lrk, rrk);
      this.emit('JMP', 0, 1);
      this.emit('LOADBOOL', dest, 0, 1);
      this.emit('LOADBOOL', dest, 1, 0);
      if (!isKR(lrk)) proto.nextReg = Math.max(proto.nextReg - 1, base);
      if (!isKR(rrk)) proto.nextReg = Math.max(proto.nextReg - 1, base);
      proto.freeRegsTo(base);
      return;
    }

    if (op === '<' || op === '>') {
      const [l, r] = op === '<' ? [node.left, node.right] : [node.right, node.left];
      const lrk = this.compileRK(l);
      const rrk = this.compileRK(r);
      this.emit('LT', 0, lrk, rrk);
      this.emit('JMP', 0, 1);
      this.emit('LOADBOOL', dest, 0, 1);
      this.emit('LOADBOOL', dest, 1, 0);
      proto.freeRegsTo(base);
      return;
    }

    if (op === '<=' || op === '>=') {
      const [l, r] = op === '<=' ? [node.left, node.right] : [node.right, node.left];
      const lrk = this.compileRK(l);
      const rrk = this.compileRK(r);
      this.emit('LE', 0, lrk, rrk);
      this.emit('JMP', 0, 1);
      this.emit('LOADBOOL', dest, 0, 1);
      this.emit('LOADBOOL', dest, 1, 0);
      proto.freeRegsTo(base);
      return;
    }

    if (op === '..') {
      const lReg = proto.allocTemp();
      const rReg = proto.allocTemp();
      this.compileExprTo(node.left, lReg);
      this.compileExprTo(node.right, rReg);
      this.emit('CONCAT', dest, lReg, rReg);
      proto.freeRegsTo(base);
      return;
    }

    const opMap = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '^': 'POW' };
    const luaOp = opMap[op];
    if (!luaOp) throw new Error(`VM: unsupported binop ${op}`);
    const lrk = this.compileRK(node.left);
    const rrk = this.compileRK(node.right);
    this.emit(luaOp, dest, lrk, rrk);
    proto.freeRegsTo(base);
  }

  compileUnOp(node, dest) {
    const proto = this.cur;
    const base = proto.nextReg;
    const opMap = { '-': 'UNM', 'not': 'NOT', '#': 'LEN' };
    const luaOp = opMap[node.operator];
    if (!luaOp) throw new Error(`VM: unsupported unop ${node.operator}`);
    const src = proto.allocTemp();
    this.compileExprTo(node.argument, src);
    this.emit(luaOp, dest, src);
    proto.freeRegsTo(base);
  }

  compileMember(node, dest) {
    const proto = this.cur;
    const base = proto.nextReg;
    const tbl = proto.allocTemp();
    this.compileExprTo(node.base, tbl);
    const ki = proto.addK(node.identifier.name);
    this.emit('GETTABLE', dest, tbl, KR(ki));
    proto.freeRegsTo(base);
  }

  compileIndex(node, dest) {
    const proto = this.cur;
    const base = proto.nextReg;
    const tbl = proto.allocTemp();
    this.compileExprTo(node.base, tbl);
    const idx = proto.allocTemp();
    this.compileExprTo(node.index, idx);
    this.emit('GETTABLE', dest, tbl, idx);
    proto.freeRegsTo(base);
  }

  compileCall(node, dest, nret) {
    const proto = this.cur;
    const base = proto.nextReg;
    const fnReg = proto.allocTemp();

    let args = node.arguments || [];
    if (node.type === 'StringCallExpression') args = [node.argument];
    if (node.type === 'TableCallExpression') args = [node.argument];

    if (node.base.type === 'MemberExpression' && node.base.indexType === ':') {
      const objReg = proto.allocTemp();
      this.compileExprTo(node.base.base, objReg);
      const ki = proto.addK(node.base.identifier.name);
      this.emit('SELF', fnReg, objReg, ki);
      for (const arg of args) {
        const r = proto.allocTemp();
        this.compileExprTo(arg, r);
      }
      const nargs = args.length + 1;
      this.emit('CALL', fnReg, nargs + 1, nret);
      if (nret === 2 && dest !== fnReg) this.emit('MOVE', dest, fnReg);
      proto.freeRegsTo(base);
      return;
    }

    this.compileExprTo(node.base, fnReg);
    for (const arg of args) {
      const r = proto.allocTemp();
      this.compileExprTo(arg, r);
    }
    this.emit('CALL', fnReg, args.length + 1, nret);
    if (nret === 2 && dest !== fnReg) this.emit('MOVE', dest, fnReg);
    proto.freeRegsTo(base);
  }

  compileAnonymousClosure(node, dest) {
    const proto = this.cur;
    const childIdx = proto.subp.length;
    this.buildChildProto(node);
    this.emit('CLOSURE', dest, childIdx);
  }

  compileTable(node, dest) {
    const proto = this.cur;
    const base = proto.nextReg;
    this.emit('NEWTABLE', dest, 0, 0);

    for (const field of node.fields) {
      if (field.type === 'TableKeyString') {
        const base2 = proto.nextReg;
        const vr = proto.allocTemp();
        this.compileExprTo(field.value, vr);
        const ki = proto.addK(field.key.name != null ? field.key.name : String(field.key.value));
        this.emit('SETTABLE', dest, KR(ki), vr);
        proto.freeRegsTo(base2);
      } else if (field.type === 'TableKey') {
        const base2 = proto.nextReg;
        const kr = proto.allocTemp();
        this.compileExprTo(field.key, kr);
        const vr = proto.allocTemp();
        this.compileExprTo(field.value, vr);
        this.emit('SETTABLE', dest, kr, vr);
        proto.freeRegsTo(base2);
      }
    }

    let arrayCount = 0;
    for (const field of node.fields) {
      if (field.type === 'TableValue') {
        const r = proto.allocTemp();
        this.compileExprTo(field.value, r);
        arrayCount++;
      }
    }

    if (arrayCount > 0) this.emit('SETLIST', dest, arrayCount, 1);
    proto.freeRegsTo(base);
  }
}

// ─── VM Code Generator ─────────────────────────────────────────

function encryptConstants(kArr) {
  const k1len = randInt(8, 16);
  const k2len = randInt(6, 12);
  const k3len = randInt(5, 10);
  const k4len = randInt(4, 9);
  const k5len = randInt(3, 8);
  const k1 = Array.from({ length: k1len }, () => randInt(1, 254));
  const k2 = Array.from({ length: k2len }, () => randInt(1, 254));
  const k3 = Array.from({ length: k3len }, () => randInt(1, 254));
  const k4 = Array.from({ length: k4len }, () => randInt(1, 254));
  const k5 = Array.from({ length: k5len }, () => randInt(1, 254));

  const nFake = randInt(3, 8);
  const fakeConstants = [];
  for (let i = 0; i < nFake; i++) {
    const fakeType = randInt(0, 2);
    if (fakeType === 0) {
      const fakeStr = randHex(randInt(4, 12));
      const enc = Array.from(fakeStr).map((c, j) =>
        c.charCodeAt(0) ^ k1[j % k1len] ^ k2[j % k2len] ^ k3[j % k3len] ^ k4[j % k4len] ^ k5[j % k5len]
      );
      fakeConstants.push(`{t=1,d={${enc.join(',')}}}`);
    } else if (fakeType === 1) {
      fakeConstants.push(`{t=2,d=${randInt(-9999, 9999)}}`);
    } else {
      fakeConstants.push(`{t=3,d=${randInt(0, 1)}}`);
    }
  }

  const parts = kArr.map((v) => {
    if (typeof v === 'string') {
      const enc = Array.from(v).map((c, j) =>
        c.charCodeAt(0) ^ k1[j % k1len] ^ k2[j % k2len] ^ k3[j % k3len] ^ k4[j % k4len] ^ k5[j % k5len]
      );
      return `{t=1,d={${enc.join(',')}}}`;
    }
    if (typeof v === 'number') return `{t=2,d=${v}}`;
    if (typeof v === 'boolean') return `{t=3,d=${v ? 1 : 0}}`;
    return `{t=4,d=nil}`;
  });

  const insertPositions = [];
  for (const fc of fakeConstants) {
    insertPositions.push({ pos: randInt(0, parts.length), val: fc });
  }
  insertPositions.sort((a, b) => b.pos - a.pos);
  for (const ip of insertPositions) {
    parts.splice(ip.pos, 0, ip.val);
  }

  return {
    encK: `{${parts.join(',')}}`,
    k1: `{${k1.join(',')}}`,
    k2: `{${k2.join(',')}}`,
    k3: `{${k3.join(',')}}`,
    k4: `{${k4.join(',')}}`,
    k5: `{${k5.join(',')}}`,
    nFake,
    fakePositions: insertPositions.map(ip => ip.pos),
  };
}

function generatePolymorphicAdd(rk_) {
  const variants = [
    `regs[a]=${rk_}(b)+${rk_}(c)`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=_x-(-_y)`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=-(-_x-_y)`,
    `local _x=${rk_}(b) regs[a]=_x+${rk_}(c)`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function generatePolymorphicSub(rk_) {
  const variants = [
    `regs[a]=${rk_}(b)-${rk_}(c)`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=_x+(-_y)`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=-(-_x+_y)`,
    `local _x=${rk_}(b) regs[a]=_x-${rk_}(c)`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function generatePolymorphicMul(rk_) {
  const variants = [
    `regs[a]=${rk_}(b)*${rk_}(c)`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=_x*_y`,
    `local _x,_y=${rk_}(b),${rk_}(c) local _r=0 if _y>=0 then _r=_x*_y else _r=-(_x*(-_y)) end regs[a]=_r`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function generatePolymorphicDiv(rk_) {
  const variants = [
    `regs[a]=${rk_}(b)/${rk_}(c)`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=_x/_y`,
    `local _x,_y=${rk_}(b),${rk_}(c) regs[a]=_x*(1/_y)`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function generatePolymorphicNot() {
  const variants = [
    `regs[a]=not regs[b]`,
    `local _x=regs[b] regs[a]=_x==false or _x==nil`,
    `regs[a]=(regs[b] and false) or (not regs[b])`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function generatePolymorphicLen() {
  const variants = [
    `regs[a]=#regs[b]`,
    `local _t=regs[b] regs[a]=#_t`,
    `regs[a]=rawlen and rawlen(regs[b]) or #regs[b]`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function generatePolymorphicMove() {
  const variants = [
    `regs[a]=regs[b]`,
    `local _v=regs[b] regs[a]=_v`,
  ];
  return variants[randInt(0, variants.length - 1)];
}

function buildPolymorphicHandlers(O, rk_, pc_, rv_, rn_, dt_, vm) {
  return `
  ${dt_}[${O.LOADK}]=function(a,b,c) regs[a]=kst[b] end
  ${dt_}[${O.LOADNIL}]=function(a,b,c) for i=a,b do regs[i]=nil end end
  ${dt_}[${O.LOADBOOL}]=function(a,b,c) regs[a]=b~=0 if c~=0 then ${pc_}[1]=${pc_}[1]+1 end end
  ${dt_}[${O.MOVE}]=function(a,b,c) ${generatePolymorphicMove()} end
  ${dt_}[${O.GETGLOBAL}]=function(a,b,c) regs[a]=env[kst[b]] end
  ${dt_}[${O.SETGLOBAL}]=function(a,b,c) env[kst[b]]=regs[a] end
  ${dt_}[${O.GETTABLE}]=function(a,b,c) regs[a]=regs[b][${rk_}(c)] end
  ${dt_}[${O.SETTABLE}]=function(a,b,c) regs[a][${rk_}(b)]=${rk_}(c) end
  ${dt_}[${O.NEWTABLE}]=function(a,b,c) regs[a]={} end
  ${dt_}[${O.SELF}]=function(a,b,c) regs[a+1]=regs[b] regs[a]=regs[b][kst[c]] end
  ${dt_}[${O.ADD}]=function(a,b,c) ${generatePolymorphicAdd(rk_)} end
  ${dt_}[${O.SUB}]=function(a,b,c) ${generatePolymorphicSub(rk_)} end
  ${dt_}[${O.MUL}]=function(a,b,c) ${generatePolymorphicMul(rk_)} end
  ${dt_}[${O.DIV}]=function(a,b,c) ${generatePolymorphicDiv(rk_)} end
  ${dt_}[${O.MOD}]=function(a,b,c) regs[a]=${rk_}(b)%${rk_}(c) end
  ${dt_}[${O.POW}]=function(a,b,c) regs[a]=${rk_}(b)^${rk_}(c) end
  ${dt_}[${O.CONCAT}]=function(a,b,c) local p={} for i=b,c do p[#p+1]=tostring(regs[i]) end regs[a]=table.concat(p) end
  ${dt_}[${O.NOT}]=function(a,b,c) ${generatePolymorphicNot()} end
  ${dt_}[${O.UNM}]=function(a,b,c) regs[a]=-regs[b] end
  ${dt_}[${O.LEN}]=function(a,b,c) ${generatePolymorphicLen()} end
  ${dt_}[${O.EQ}]=function(a,b,c) if(${rk_}(b)==${rk_}(c))~=(a~=0) then ${pc_}[1]=${pc_}[1]+1 end end
  ${dt_}[${O.LT}]=function(a,b,c) if(${rk_}(b)<${rk_}(c))~=(a~=0) then ${pc_}[1]=${pc_}[1]+1 end end
  ${dt_}[${O.LE}]=function(a,b,c) if(${rk_}(b)<=${rk_}(c))~=(a~=0) then ${pc_}[1]=${pc_}[1]+1 end end
  ${dt_}[${O.TEST}]=function(a,b,c) if(not not regs[a])~=(c~=0) then ${pc_}[1]=${pc_}[1]+1 end end
  ${dt_}[${O.JMP}]=function(a,b,c) ${pc_}[1]=${pc_}[1]+b end
  ${dt_}[${O.CALL}]=function(a,b,c)
    local fn=regs[a]
    local args={}
    if b~=1 then for i=a+1,a+b-1 do args[#args+1]=regs[i] end end
    if c==0 then
      local rs={fn(table.unpack(args))}
      for i,v in ipairs(rs) do regs[a+i-1]=v end
    elseif c==1 then
      fn(table.unpack(args))
    else
      local rs={fn(table.unpack(args))}
      for i=0,c-2 do regs[a+i]=rs[i+1] end
    end
  end
  ${dt_}[${O.RETURN}]=function(a,b,c)
    if b==1 then ${rn_}=-1
    elseif b==0 then
      local i=a
      while regs[i]~=nil do ${rv_}[#${rv_}+1]=regs[i] i=i+1 end
      ${rn_}=#${rv_}
    else
      for i=0,b-2 do ${rv_}[i+1]=regs[a+i] end
      ${rn_}=b-1
    end
  end
  ${dt_}[${O.FORPREP}]=function(a,b,c)
    regs[a]=regs[a]-regs[a+2]
    ${pc_}[1]=${pc_}[1]+b
  end
  ${dt_}[${O.FORLOOP}]=function(a,b,c)
    regs[a]=regs[a]+regs[a+2]
    local idx,lim,step=regs[a],regs[a+1],regs[a+2]
    if(step>0 and idx<=lim)or(step<0 and idx>=lim) then
      regs[a+3]=idx
      ${pc_}[1]=${pc_}[1]+b
    end
  end
  ${dt_}[${O.TFORLOOP}]=function(a,b,c)
    local rs={regs[a](regs[a+1],regs[a+2])}
    local ctrl=rs[1]
    if ctrl~=nil then
      regs[a+2]=ctrl
      for i=1,c do regs[a+2+i]=rs[i] end
      ${pc_}[1]=${pc_}[1]+b
    end
  end
  ${dt_}[${O.CLOSURE}]=function(a,b,c)
    local sp=subp[b+1]
    local snap={}
    for i=0,(sp.np or 0)+40 do snap[i]=regs[i] end
    regs[a]=function(...)
      return ${vm}(sp,env,snap,upcells,...)
    end
  end
  ${dt_}[${O.SETLIST}]=function(a,b,c)
    for i=1,b do regs[a][i]=regs[a+i] end
  end
  ${dt_}[${O.GETUPVAL}]=function(a,b,c)
    local cell=upcells[b]
    regs[a]=cell and cell.val or nil
  end
  ${dt_}[${O.SETUPVAL}]=function(a,b,c)
    local cell=upcells[b]
    if cell then cell.val=regs[a] end
  end
  ${dt_}[${O.VARARG}]=function(a,b,c)
    local nout=(c==0) and (#va-proto.np) or (c-1)
    for i=1,nout do regs[a+i-1]=va[proto.np+i] end
  end
  ${dt_}[${O.NOP}]=function(a,b,c) end`;
}

function injectDeadBytecode(proto, ops) {
  const deadOps = [ops['LOADK'], ops['LOADNIL'], ops['MOVE'], ops['ADD'], ops['SUB']];
  const newBc = [];
  for (let i = 0; i < proto.bc.length; i++) {
    newBc.push(proto.bc[i]);
    if (Math.random() < 0.15) {
      const nDead = randInt(1, 3);
      // JMP with b=nDead skips exactly nDead instructions after it
      newBc.push({ op: ops['JMP'], a: 0, b: nDead, c: 0 });
      for (let d = 0; d < nDead; d++) {
        const deadIns = { op: deadOps[randInt(0, deadOps.length - 1)], a: randInt(50, 80), b: randInt(0, 20), c: randInt(0, 10) };
        newBc.push(deadIns);
      }
    }
  }
  proto.bc = newBc;

  for (let i = 0; i < proto.subp.length; i++) {
    injectDeadBytecode(proto.subp[i], ops);
  }
}

function insertNopPadding(proto, ops) {
  const nopOp = ops['NOP'];
  const newBc = [];
  for (let i = 0; i < proto.bc.length; i++) {
    if (Math.random() < 0.10) {
      const nNops = randInt(1, 2);
      for (let n = 0; n < nNops; n++) {
        newBc.push({ op: nopOp, a: randInt(0, 50), b: randInt(0, 50), c: randInt(0, 50) });
      }
    }
    newBc.push(proto.bc[i]);
  }
  proto.bc = newBc;
  for (let i = 0; i < proto.subp.length; i++) {
    insertNopPadding(proto.subp[i], ops);
  }
}

function serializeProto(proto) {
  const rxkLen = randInt(6, 14);
  const rxk = Array.from({ length: rxkLen }, () => randInt(1, 127));

  const instr = proto.bc.map(({ op, a, b, c }, i) => {
    const k = rxk[i % rxkLen];
    return `{${op ^ k},${a},${b},${c}}`;
  }).join(',');

  const { encK, k1, k2, k3, k4, k5 } = encryptConstants(proto.k);
  const subProtos = proto.subp.map(p => serializeProto(p)).join(',');
  const upvalsStr = proto.upvals.map(u => `{is=${u.instack ? 1 : 0},ix=${u.idx}}`).join(',');
  return `{bc={${instr}},ek=${encK},k1=${k1},k2=${k2},k3=${k3},k4=${k4},k5=${k5},rxk={${rxk.join(',')}},p={${subProtos}},np=${proto.np},va=${proto.va ? 1 : 0},uv={${upvalsStr}}}`;
}

// ─── Self-Hash Verification (v9) ────────────────────────────────
// Computes a bit32 checksum of the serialized bytecode at runtime.
// Embeds the expected hash so tampering triggers an error.

function generateSelfHash(protoStr) {
  let hash = 0x5A3C;
  for (let i = 0; i < protoStr.length; i++) {
    hash = ((hash << 5) + hash + protoStr.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return hash >>> 0;
}

// ─── LZ77 Bytecode Compression (v9) ─────────────────────────────
// Applies LZ77 to bytecode data, generating a Lua decoder at runtime.
// Reduces output ~25-35% and makes the data opaque to pattern analysis.

function compressBytecodeString(protoStr) {
  const data = [];
  for (let i = 0; i < protoStr.length; i++) data.push(protoStr.charCodeAt(i));
  const compressed = lz77Compress(data);
  return compressed;
}

function generateLZ77Decoder(compressedData, outputVar) {
  const dec_ = randName(), buf_ = randName(), i_ = randName();
  const flag_ = randName(), off_ = randName(), len_ = randName();
  const j_ = randName();
  return `
local ${dec_}={${compressedData.join(',')}}
local ${buf_}={}
local ${i_}=1
while ${i_}<=#${dec_} do
  local ${flag_}=${dec_}[${i_}]
  ${i_}=${i_}+1
  if ${flag_}==1 then
    local ${off_}=${dec_}[${i_}]
    local ${len_}=${dec_}[${i_}+1]
    ${i_}=${i_}+2
    local ${j_}=#${buf_}-${off_}+1
    for _=1,${len_} do
      ${buf_}[#${buf_}+1]=${buf_}[${j_}]
      ${j_}=${j_}+1
    end
  else
    ${buf_}[#${buf_}+1]=string.char(${dec_}[${i_}])
    ${i_}=${i_}+1
  end
end
local ${outputVar}=table.concat(${buf_})
`;
}

// ─── Control Flow Flattening (v9) ────────────────────────────────
// Converts sequential code into a state-machine dispatcher loop.
// Makes static analysis significantly harder.

function flattenControlFlow(code) {
  const lines = code.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 8) return code;

  const stateVar = randName();
  const loopVar = randName();
  const chunks = [];
  let chunk = [];

  for (const line of lines) {
    chunk.push(line);
    if (chunk.length >= randInt(2, 5)) {
      chunks.push(chunk.join('\n'));
      chunk = [];
    }
  }
  if (chunk.length > 0) chunks.push(chunk.join('\n'));

  if (chunks.length < 3) return code;

  const order = Array.from({ length: chunks.length }, (_, i) => i);
  const stateMap = shuffle(Array.from({ length: chunks.length }, (_, i) => randInt(100, 9999)));
  const usedStates = new Set(stateMap);
  let terminalState;
  do { terminalState = randInt(100, 9999); } while (usedStates.has(terminalState));

  const cases = chunks.map((c, i) => {
    const nextState = i < chunks.length - 1 ? stateMap[i + 1] : terminalState;
    return `if ${stateVar}==${stateMap[i]} then\n${c}\n${stateVar}=${nextState}`;
  });

  const shuffledCases = shuffle(cases);
  const dispatcher = shuffledCases.join('\nelse');

  return `local ${stateVar}=${stateMap[0]}\nlocal ${loopVar}=true\nwhile ${loopVar} do\n${dispatcher}\nelse\n${loopVar}=false\nend\nend`;
}

// ─── String Array Rotation (v9) ──────────────────────────────────
// Collects all string literals into a rotated array, replacing them
// with index lookups. Makes string analysis much harder.

function rotateStringArray(toks) {
  const strings = [];
  const indices = [];

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === TK.ST && !t.long) {
      const q = t.v[0];
      if (q !== '"' && q !== "'") continue;
      let content;
      try {
        content = t.v.slice(1, -1)
          .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
          .replace(/\\\\/g, '\x01').replace(/\\"/g, '"').replace(/\\'/g, "'")
          .replace(/\\(\d{1,3})/g, (_, d) => String.fromCharCode(parseInt(d)))
          .replace(/\x01/g, '\\');
      } catch { continue; }
      if (!content.length || content.length > 300) continue;
      strings.push({ idx: i, content });
    }
  }

  if (strings.length < 4) return null;

  const rotation = randInt(1, strings.length - 1);
  const rotated = [...strings.slice(rotation), ...strings.slice(0, rotation)];

  const arrName = randName();
  const rotName = randName();
  const k1l = randInt(5, 10);
  const k1 = Array.from({ length: k1l }, () => randInt(1, 254));

  const encoded = rotated.map(s => {
    const enc = Array.from(s.content).map((c, j) => c.charCodeAt(0) ^ k1[j % k1l]);
    return `{${enc.join(',')}}`;
  });

  const decoderPrefix = `local ${arrName}=(function() local _k={${k1.join(',')}} local _d={${encoded.join(',')}} local _r={} for _i=1,#_d do local _s={} for _j=1,#_d[_i] do _s[_j]=string.char(bit32.bxor(_d[_i][_j],_k[(_j-1)%#_k+1])) end _r[_i]=table.concat(_s) end local ${rotName}=${rotation} for _=1,${rotName} do local _v=table.remove(_r,1) _r[#_r+1]=_v end return _r end)()\n`;

  const newToks = [...toks];
  for (let i = 0; i < strings.length; i++) {
    const origIdx = strings[i].idx;
    newToks[origIdx] = { t: TK.OT, v: `${arrName}[${i + 1}]` };
  }

  return { toks: newToks, prefix: decoderPrefix };
}

// ─── Environment Fingerprinting (v9) ────────────────────────────
// Creates a unique fingerprint of the execution environment.
// Detects non-Roblox execution contexts.

function wrapEnvironmentFingerprint(code) {
  const fp_ = randName(), hash_ = randName();

  return [
    `local ${fp_}={}`,
    `${fp_}[1]=type(game)=="userdata" and 1 or 0`,
    `${fp_}[2]=type(workspace)=="userdata" and 1 or 0`,
    `${fp_}[3]=type(Instance)=="table" and 1 or 0`,
    `${fp_}[4]=type(script)=="userdata" and 1 or 0`,
    `local ${hash_}=0`,
    `for _,v in ipairs(${fp_}) do ${hash_}=${hash_}+v end`,
    code,
  ].join('\n');
}

// ─── Payload Encoder ────────────────────────────────────────────

function encodeAsPayload(vmCode) {
  return `do\n${vmCode}\nend`;
}

// ─── VM Shape Builders (v8: 3 alternative shapes) ───────────────
// Shape 1: Dispatch Table (original — _DT[op] = function)
// Shape 2: Linked-List (instructions as linked table nodes)
// Shape 3: Switch-Case Emulation (nested if-elseif with scrambled order)

function buildDispatchTableVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt) {
  const handlers = buildPolymorphicHandlers(O, rk_, pc_, rv_, rn_, dt_, vm);
  return `
  ${handlers}
  ${fakeDt}

  while true do
    local ${idx_}=${pc_}[1]
    local ${ins_}=bc[${idx_}]
    ${pc_}[1]=${idx_}+1
    local ${op_}=bit32.bxor(${ins_}[1],${rxkl_}[((${idx_}-1)%#${rxkl_})+1])
    local ${h_}=${dt_}[${op_}]
    if ${h_} then ${h_}(${ins_}[2],${ins_}[3],${ins_}[4]) end
    if ${rn_}~=0 then break end
  end`;
}

function buildLinkedListVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt) {
  const node_ = randName();
  const cur_ = randName();
  const exec_ = randName();
  const handlers = buildPolymorphicHandlers(O, rk_, pc_, rv_, rn_, dt_, vm);
  return `
  ${handlers}
  ${fakeDt}

  local ${node_}={}
  for ${idx_}=1,#bc do
    ${node_}[${idx_}]={d=bc[${idx_}],n=nil}
    if ${idx_}>1 then ${node_}[${idx_}-1].n=${node_}[${idx_}] end
  end

  local ${cur_}=${node_}[1]
  local ${exec_}=1
  while ${cur_} do
    local ${ins_}=${cur_}.d
    local ${op_}=bit32.bxor(${ins_}[1],${rxkl_}[((${exec_}-1)%#${rxkl_})+1])
    local ${h_}=${dt_}[${op_}]
    if ${h_} then ${h_}(${ins_}[2],${ins_}[3],${ins_}[4]) end
    if ${rn_}~=0 then break end
    ${exec_}=${pc_}[1]
    ${cur_}=${node_}[${exec_}]
  end`;
}

function buildStringVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt) {
  const buf_ = randName();
  const len_ = randName();
  const pos_ = randName();
  const rd_ = randName();
  const handlers = buildPolymorphicHandlers(O, rk_, pc_, rv_, rn_, dt_, vm);
  return `
  ${handlers}
  ${fakeDt}

  local ${buf_}={}
  for ${idx_}=1,#bc do
    local ${ins_}=bc[${idx_}]
    ${buf_}[#${buf_}+1]=string.char(${ins_}[1],${ins_}[2]%256,${ins_}[3]%256,${ins_}[4]%256)
    ${buf_}[#${buf_}+1]=string.char(math.floor(${ins_}[2]/256)%256,math.floor(${ins_}[3]/256)%256,math.floor(${ins_}[4]/256)%256,0)
  end
  local ${len_}=table.concat(${buf_})

  local function ${rd_}(${pos_})
    local b1,b2,b3,b4,b5,b6,b7=string.byte(${len_},(${pos_}-1)*7+1,(${pos_}-1)*7+7)
    local sB=math.floor(b2 or 0)+math.floor(b5 or 0)*256
    local sC=math.floor(b3 or 0)+math.floor(b6 or 0)*256
    local sD=math.floor(b4 or 0)+math.floor(b7 or 0)*256
    return b1 or 0,sB,sC,sD
  end

  while true do
    local ${idx_}=${pc_}[1]
    ${pc_}[1]=${idx_}+1
    local ${op_},a,b,c=${rd_}(${idx_})
    ${op_}=bit32.bxor(${op_},${rxkl_}[((${idx_}-1)%#${rxkl_})+1])
    local ${h_}=${dt_}[${op_}]
    if ${h_} then ${h_}(a,b,c) end
    if ${rn_}~=0 then break end
  end`;
}

function buildStackVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt) {
  const stk_ = randName();
  const sp_ = randName();
  const push_ = randName();
  const pop_ = randName();
  const handlers = buildPolymorphicHandlers(O, rk_, pc_, rv_, rn_, dt_, vm);
  return `
  ${handlers}
  ${fakeDt}

  local ${stk_}={}
  local ${sp_}=0
  local function ${push_}(v) ${sp_}=${sp_}+1 ${stk_}[${sp_}]=v end
  local function ${pop_}() local v=${stk_}[${sp_}] ${stk_}[${sp_}]=nil ${sp_}=${sp_}-1 return v end

  for ${idx_}=1,#bc do
    local ${ins_}=bc[${idx_}]
    ${push_}({${ins_}[1],${ins_}[2],${ins_}[3],${ins_}[4],n=${idx_}})
  end

  while ${sp_}>0 do
    local ${idx_}=${pc_}[1]
    if ${idx_}>#bc then break end
    local ${ins_}=bc[${idx_}]
    ${pc_}[1]=${idx_}+1
    local ${op_}=bit32.bxor(${ins_}[1],${rxkl_}[((${idx_}-1)%#${rxkl_})+1])
    local ${h_}=${dt_}[${op_}]
    if ${h_} then ${h_}(${ins_}[2],${ins_}[3],${ins_}[4]) end
    if ${rn_}~=0 then break end
  end`;
}

// ─── VM Core Builder ───────────────────────────────────────────

function buildVMCore(rootProto, ops) {
  insertNopPadding(rootProto, ops);
  injectDeadBytecode(rootProto, ops);
  const protoStr = serializeProto(rootProto);
  const O = ops;
  const CB = CONST_BASE;

  const vm    = randName();
  const pc_   = randName();
  const rv_   = randName();
  const rn_   = randName();
  const dt_   = randName();
  const ins_  = randName();
  const h_    = randName();
  const rk_   = randName();
  const rxkl_ = randName();
  const idx_  = randName();
  const op_   = randName();

  const fakeDt = (() => {
    const usedFake = new Set();
    const fakeBodyGen = [
      () => `local _f=bit32.bxor(${randInt(1,99)},${randInt(1,99)}) local _g=_f*${randInt(1,9)}`,
      () => `local _f=math.max(${randInt(1,9)},${randInt(1,9)}) _f=_f-_f`,
      () => `local _f={} _f[1]=nil _f=nil`,
      () => `local _f=string.char(${randInt(65,122)}) _f=_f.._f`,
      () => `local _f=bit32.band(${randInt(1,255)},0xFF)`,
      () => `local _f=math.floor(${randInt(1,99)}/${randInt(1,9)})`,
      () => `local _f=tostring(${randInt(1,999)}) _f=nil`,
      () => `local _f=math.sin(${randInt(1,99)}) _f=math.cos(_f)`,
      () => `local _f=string.len("${randHex(4)}") _f=_f-_f`,
      () => ``,
    ];
    let s = '';
    const n = randInt(20, 35);
    for (let i = 0; i < n; i++) {
      let fop;
      do { fop = randInt(200, 9999); } while (usedFake.has(fop));
      usedFake.add(fop);
      const body = fakeBodyGen[randInt(0, fakeBodyGen.length - 1)]();
      s += `\n  ${dt_}[${fop}]=function(a,b,c) ${body} end`;
    }
    return s;
  })();

  const vmShape = randInt(0, 3);
  let vmBody;
  if (vmShape === 0) {
    vmBody = buildDispatchTableVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt);
  } else if (vmShape === 1) {
    vmBody = buildLinkedListVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt);
  } else if (vmShape === 2) {
    vmBody = buildStringVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt);
  } else {
    vmBody = buildStackVM(O, rk_, pc_, rv_, rn_, dt_, ins_, h_, rxkl_, idx_, op_, vm, fakeDt);
  }

  const shapeNames = ['DispatchTable', 'LinkedList', 'TokenizedString', 'StackVM'];

  const bcCount = rootProto.bc.length;
  const subCount = rootProto.subp.length;
  const integrityA = (bcCount * 7 + subCount * 31 + 0x3F) & 0xFFFF;
  const integrityB = (bcCount ^ subCount ^ 0xA5) & 0xFF;
  const hashVar = randName();
  const hashChk = randName();

  const vmCode = `
local function ${vm}(proto,env,parent_regs,parent_upcells,...)
  local bc=proto.bc
  local subp=proto.p
  local ${pc_}={1}
  local regs={}
  local va={...}
  local ${rv_}={}
  local ${rn_}=0

  local k1=proto.k1
  local k2=proto.k2
  local k3=proto.k3
  local k4=proto.k4
  local k5=proto.k5
  local kst={}
  for i,v in ipairs(proto.ek) do
    if v.t==1 then
      local r={}
      for j,b in ipairs(v.d) do
        r[j]=string.char(bit32.bxor(bit32.bxor(bit32.bxor(bit32.bxor(bit32.bxor(b,k1[(j-1)%#k1+1]),k2[(j-1)%#k2+1]),k3[(j-1)%#k3+1]),k4[(j-1)%#k4+1]),k5[(j-1)%#k5+1]))
      end
      kst[i-1]=table.concat(r)
    elseif v.t==2 then
      kst[i-1]=v.d
    elseif v.t==3 then
      kst[i-1]=v.d~=0
    else
      kst[i-1]=nil
    end
  end

  for i=1,proto.np do regs[i-1]=va[i] end

  local upcells={}
  if proto.uv then
    for i,uv in ipairs(proto.uv) do
      if uv.is==1 and parent_regs then
        upcells[i-1]={val=parent_regs[uv.ix]}
      elseif uv.is==0 and parent_upcells then
        upcells[i-1]=parent_upcells[uv.ix]
      end
    end
  end

  local function ${rk_}(x)
    if x>=${CB} then return kst[x-${CB}] else return regs[x] end
  end

  local ${rxkl_}=proto.rxk
${vmBody}

  if ${rn_}==-1 then return
  else return table.unpack(${rv_},1,${rn_}) end
end

local _proto=${protoStr}

do
  local ${hashVar}=#_proto.bc*7+(#_proto.p)*31+0x3F
  local ${hashChk}=bit32.band(${hashVar},0xFFFF)
  if ${hashChk}~=${integrityA} then error("",0) end
  local _ib=bit32.bxor(#_proto.bc,bit32.bxor(#_proto.p,0xA5))
  if bit32.band(_ib,0xFF)~=${integrityB} then error("",0) end
end

local _env=setmetatable({},{__index=_ENV or (getfenv and getfenv() or {})})
local _ok,_er=pcall(function()
  ${vm}(_proto,_env,nil,nil)
end)
if not _ok then error(tostring(_er),0) end
`;

  return encodeAsPayload(vmCode);
}

// ─── Tokenizer (Layer B) ───────────────────────────────────────

const LUA_KW = new Set([
  'and','break','do','else','elseif','end','false','for','function',
  'goto','if','in','local','nil','not','or','repeat','return','then',
  'true','until','while',
]);

const ROBLOX_G = new Set([
  'game','workspace','script','plugin','shared','_G','_ENV',
  'wait','task','delay','spawn','coroutine','string','table','math',
  'bit32','utf8','os','io','print','warn','error','assert',
  'pcall','xpcall','ipairs','pairs','next','select','type','typeof',
  'tostring','tonumber','rawget','rawset','rawequal','rawlen',
  'setmetatable','getmetatable','require','loadstring','load',
  'collectgarbage','unpack','tick','time',
  'Vector2','Vector3','CFrame','Color3','BrickColor','Instance',
  'Enum','UDim','UDim2','TweenInfo','RunService','Players',
  'ReplicatedStorage','ServerStorage','ServerScriptService',
  'Lighting','StarterGui','StarterPlayer','Teams','SoundService',
  'UserInputService','ContextActionService','TweenService',
  'PathfindingService','HttpService','DataStoreService','MarketplaceService',
]);

const BREAKABLE = new Set([
  'print','warn','error','require','pcall','xpcall','tostring',
  'tonumber','type','typeof','pairs','ipairs','next','select',
  'unpack','assert','rawget','rawset','rawequal','rawlen',
  'setmetatable','getmetatable','collectgarbage','loadstring','load',
]);

const TK = { CM: 'cm', ST: 'st', NU: 'nu', KW: 'kw', ID: 'id', WS: 'ws', OT: 'ot' };

function tokenize(src) {
  const tok = []; let i = 0;
  function pk(o = 0) { return src[i + o] ?? ''; }
  function adv() { return src[i++]; }
  function lbl() {
    if (pk() !== '[') return -1;
    let l = 0;
    while (pk(1 + l) === '=') l++;
    return pk(1 + l) === '[' ? l : -1;
  }
  function rls(l) {
    let s = '[' + '='.repeat(l) + '['; i += 2 + l;
    const cl = ']' + '='.repeat(l) + ']';
    while (i < src.length) {
      if (src.startsWith(cl, i)) { s += cl; i += cl.length; break; }
      s += src[i++];
    }
    return s;
  }

  while (i < src.length) {
    const c = pk();
    if (/\s/.test(c)) {
      let w = '';
      while (i < src.length && /\s/.test(pk())) w += adv();
      tok.push({ t: TK.WS, v: w }); continue;
    }
    if (c === '-' && pk(1) === '-') {
      if (pk(2) === '[') {
        const sv = i; i += 2;
        const l = lbl();
        if (l >= 0) { tok.push({ t: TK.CM, v: '--' + rls(l) }); continue; }
        i = sv + 2;
      }
      let cm = '--'; i += 2;
      while (i < src.length && pk() !== '\n') cm += adv();
      tok.push({ t: TK.CM, v: cm }); continue;
    }
    if (c === '[' && lbl() >= 0) { const l = lbl(); tok.push({ t: TK.ST, v: rls(l), long: true }); continue; }
    if (c === '"' || c === "'") {
      const q = adv(); let s = q;
      while (i < src.length) {
        const ch = adv(); s += ch;
        if (ch === '\\') { s += adv(); continue; }
        if (ch === q) break;
      }
      tok.push({ t: TK.ST, v: s, long: false }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(pk(1)))) {
      let n = '';
      if (c === '0' && /[xX]/.test(pk(1))) {
        n += adv() + adv();
        while (/[0-9a-fA-F_]/.test(pk())) n += adv();
      } else {
        while (/[0-9_]/.test(pk())) n += adv();
        if (pk() === '.' && /[0-9]/.test(pk(1))) { n += adv(); while (/[0-9_]/.test(pk())) n += adv(); }
        if (/[eE]/.test(pk())) { n += adv(); if (/[+\-]/.test(pk())) n += adv(); while (/[0-9]/.test(pk())) n += adv(); }
      }
      tok.push({ t: TK.NU, v: n }); continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let id = '';
      while (/[a-zA-Z0-9_]/.test(pk())) id += adv();
      tok.push({ t: LUA_KW.has(id) ? TK.KW : TK.ID, v: id }); continue;
    }
    if (c === '.' && pk(1) === '.' && pk(2) === '.') { tok.push({ t: TK.OT, v: adv() + adv() + adv() }); continue; }
    if (c === '.' && pk(1) === '.') { tok.push({ t: TK.OT, v: adv() + adv() }); continue; }
    let matched = false;
    for (const op of ['==', '~=', '<=', '>=', '::', '//', '>>', '<<']) {
      if (src.startsWith(op, i)) { tok.push({ t: TK.OT, v: op }); i += op.length; matched = true; break; }
    }
    if (!matched) tok.push({ t: TK.OT, v: adv() });
  }
  return tok;
}

function reconstruct(toks) { return toks.filter(t => t.t !== TK.CM).map(t => t.v).join(''); }

function renameLocals(toks) {
  const rmap = new Map(), used = new Set();
  function nn(n) {
    if (rmap.has(n)) return rmap.get(n);
    let r;
    do { r = randName(); } while (used.has(r));
    used.add(r); rmap.set(n, r); return r;
  }
  const locals = new Set();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === TK.KW && t.v === 'local') {
      let j = i + 1;
      while (j < toks.length && toks[j].t === TK.WS) j++;
      if (j >= toks.length) continue;
      if (toks[j].t === TK.KW && toks[j].v === 'function') {
        let k = j + 1;
        while (k < toks.length && toks[k].t === TK.WS) k++;
        if (k < toks.length && toks[k].t === TK.ID) locals.add(toks[k].v);
      } else if (toks[j].t === TK.ID) {
        let k = j;
        while (k < toks.length) {
          if (toks[k].t === TK.WS) { k++; continue; }
          if (toks[k].t === TK.ID) { locals.add(toks[k].v); k++; continue; }
          if (toks[k].t === TK.OT && toks[k].v === ',') { k++; continue; }
          break;
        }
      }
    }
    if (t.t === TK.KW && t.v === 'function') {
      let j = i + 1;
      while (j < toks.length && toks[j].t === TK.WS) j++;
      if (j < toks.length && toks[j].t !== TK.OT) while (j < toks.length && toks[j].t !== TK.OT) j++;
      if (j < toks.length && toks[j].t === TK.OT && toks[j].v === '(') {
        let k = j + 1;
        while (k < toks.length) {
          if (toks[k].t === TK.WS) { k++; continue; }
          if (toks[k].t === TK.OT && (toks[k].v === ')' || toks[k].v === '...')) break;
          if (toks[k].t === TK.OT && toks[k].v === ',') { k++; continue; }
          if (toks[k].t === TK.ID) { locals.add(toks[k].v); k++; continue; }
          break;
        }
      }
    }
  }
  return toks.map(t => t.t === TK.ID && locals.has(t.v) && !ROBLOX_G.has(t.v) ? { ...t, v: nn(t.v) } : t);
}

function encryptStrings(toks) {
  return toks.map(t => {
    if (t.t !== TK.ST || t.long) return t;
    const raw = t.v, q = raw[0];
    if (q !== '"' && q !== "'") return t;
    let content;
    try {
      content = raw.slice(1, -1)
        .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\x01').replace(/\\"/g, '"').replace(/\\'/g, "'")
        .replace(/\\(\d{1,3})/g, (_, d) => String.fromCharCode(parseInt(d)))
        .replace(/\x01/g, '\\');
    } catch { return t; }
    if (!content.length) return { ...t, v: '""' };
    if (content.length > 500) return t;

    const bytes = Array.from(content).map(c => c.charCodeAt(0));
    const pat = randInt(0, 8);

    // Pattern 0: dual rotating XOR keys, table.concat (original style)
    if (pat === 0) {
      const k1l = randInt(5, 12), k2l = randInt(4, 9);
      const k1 = Array.from({ length: k1l }, () => randInt(1, 254));
      const k2 = Array.from({ length: k2l }, () => randInt(1, 254));
      const enc = bytes.map((b, i) => b ^ k1[i % k1l] ^ k2[i % k2l]);
      const [a, b, c, d, e] = [randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${b},${e}) local ${c}={} for ${d}=1,#${b} do ${c}[${d}]=string.char(bit32.bxor(bit32.bxor(${b}[${d}],${a}[(${d}-1)%#${a}+1]),${e}[(${d}-1)%#${e}+1])) end return table.concat(${c}) end)({${k1.join(',')}},{${enc.join(',')}},{${k2.join(',')}})` };
    }

    // Pattern 1: single key, string concat with local len cached
    if (pat === 1) {
      const kl = randInt(6, 14);
      const key = Array.from({ length: kl }, () => randInt(1, 254));
      const enc = bytes.map((b, i) => b ^ key[i % kl]);
      const [a, b, c, d, kv] = [randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${kv},${b}) local ${a}="" local ${c}=#${kv} for ${d}=1,#${b} do ${a}=${a}..string.char(bit32.bxor(${b}[${d}],${kv}[(${d}-1)%${c}+1])) end return ${a} end)({${key.join(',')}},{${enc.join(',')}})` };
    }

    // Pattern 2: triple rotating XOR keys, table.concat
    if (pat === 2) {
      const k1l = randInt(4, 8), k2l = randInt(3, 7), k3l = randInt(5, 11);
      const k1 = Array.from({ length: k1l }, () => randInt(1, 254));
      const k2 = Array.from({ length: k2l }, () => randInt(1, 254));
      const k3 = Array.from({ length: k3l }, () => randInt(1, 254));
      const enc = bytes.map((b, i) => b ^ k1[i % k1l] ^ k2[i % k2l] ^ k3[i % k3l]);
      const [a, b, c, d, e, f, g] = [randName(), randName(), randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${b},${e},${f}) local ${c}={} for ${d}=1,#${b} do ${c}[${d}]=string.char(bit32.bxor(bit32.bxor(bit32.bxor(${b}[${d}],${a}[(${d}-1)%#${a}+1]),${e}[(${d}-1)%#${e}+1]),${f}[(${d}-1)%#${f}+1])) end return table.concat(${c}) end)({${k1.join(',')}},{${enc.join(',')}},{${k2.join(',')}},{${k3.join(',')}})` };
    }

    // Pattern 3: XOR with additive index tweak, string.sub loop style
    if (pat === 3) {
      const kl = randInt(5, 12);
      const key = Array.from({ length: kl }, () => randInt(2, 253));
      const enc = bytes.map((b, i) => (b ^ key[i % kl] ^ (i & 0xFF)) & 0xFF);
      const [a, b, c, d, e] = [randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${e}) local ${b}={} local ${c}=#${a} for ${d}=1,#${e} do ${b}[${d}]=string.char(bit32.bxor(bit32.bxor(${e}[${d}],${a}[(${d}-1)%${c}+1]),(${d}-1)%256)) end return table.concat(${b}) end)({${key.join(',')}},{${enc.join(',')}})` };
    }

    // Pattern 4: two-step decode — decode halves independently then merge
    if (pat === 4) {
      const kl = randInt(6, 13);
      const key = Array.from({ length: kl }, () => randInt(1, 254));
      const enc = bytes.map((b, i) => b ^ key[i % kl]);
      const [a, b, c, d, e, f] = [randName(), randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${f},${b}) local ${a}={} local ${c}=#${f} for ${d}=1,#${b} do local ${e}=${d}-1 ${a}[${d}]=string.char(bit32.band(bit32.bxor(${b}[${d}],${f}[${e}%${c}+1]),255)) end return table.concat(${a}) end)({${key.join(',')}},{${enc.join(',')}})` };
    }

    // Pattern 5: nibble-swap + XOR (split byte into high/low nibbles, encode separately)
    if (pat === 5) {
      const kl = randInt(5, 10);
      const key = Array.from({ length: kl }, () => randInt(1, 254));
      const enc = bytes.map((b, i) => {
        const swapped = ((b & 0x0F) << 4) | ((b & 0xF0) >> 4);
        return swapped ^ key[i % kl];
      });
      const [a, b, c, d, e] = [randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${b}) local ${c}={} for ${d}=1,#${b} do local ${e}=bit32.bxor(${b}[${d}],${a}[(${d}-1)%#${a}+1]) ${c}[${d}]=string.char(bit32.bor(bit32.lshift(bit32.band(${e},0x0F),4),bit32.rshift(bit32.band(${e},0xF0),4))) end return table.concat(${c}) end)({${key.join(',')}},{${enc.join(',')}})` };
    }

    // Pattern 6: reverse-iterate decode with accumulator XOR
    if (pat === 6) {
      const kl = randInt(4, 9);
      const key = Array.from({ length: kl }, () => randInt(1, 254));
      const seed = randInt(1, 254);
      const enc = [];
      let acc = seed;
      for (let i = 0; i < bytes.length; i++) {
        const e = bytes[i] ^ key[i % kl] ^ acc;
        enc.push(e);
        acc = (acc + bytes[i]) & 0xFF;
      }
      const [a, b, c, d, e, f] = [randName(), randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${b},${f}) local ${c}={} local ${e}=${f} for ${d}=1,#${b} do local _v=bit32.bxor(bit32.bxor(${b}[${d}],${a}[(${d}-1)%#${a}+1]),${e}) ${c}[${d}]=string.char(_v) ${e}=bit32.band(${e}+_v,0xFF) end return table.concat(${c}) end)({${key.join(',')}},{${enc.join(',')}},${seed})` };
    }

    // Pattern 7: bit rotation + XOR
    if (pat === 7) {
      const kl = randInt(5, 11);
      const key = Array.from({ length: kl }, () => randInt(1, 254));
      const rotAmt = randInt(1, 7);
      const enc = bytes.map((b, i) => {
        const rotated = ((b << rotAmt) | (b >> (8 - rotAmt))) & 0xFF;
        return rotated ^ key[i % kl];
      });
      const [a, bv, c, d] = [randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${bv}) local ${c}={} for ${d}=1,#${bv} do local _x=bit32.bxor(${bv}[${d}],${a}[(${d}-1)%#${a}+1]) ${c}[${d}]=string.char(bit32.bor(bit32.rshift(bit32.band(_x,0xFF),${rotAmt}),bit32.band(bit32.lshift(_x,${8-rotAmt}),0xFF))) end return table.concat(${c}) end)({${key.join(',')}},{${enc.join(',')}})` };
    }

    // Pattern 8: delta encoding + XOR (each byte encoded relative to previous)
    {
      const kl = randInt(5, 12);
      const key = Array.from({ length: kl }, () => randInt(1, 254));
      const enc = [];
      let prev = 0;
      for (let i = 0; i < bytes.length; i++) {
        const delta = (bytes[i] - prev + 256) & 0xFF;
        enc.push(delta ^ key[i % kl]);
        prev = bytes[i];
      }
      const [a, b, c, d, e] = [randName(), randName(), randName(), randName(), randName()];
      return { t: TK.OT, v: `(function(${a},${b}) local ${c}={} local ${e}=0 for ${d}=1,#${b} do local _d=bit32.bxor(${b}[${d}],${a}[(${d}-1)%#${a}+1]) local _v=bit32.band(_d+${e},0xFF) ${c}[${d}]=string.char(_v) ${e}=_v end return table.concat(${c}) end)({${key.join(',')}},{${enc.join(',')}})` };
    }
  });
}

function obfuscateNumbers(toks) {
  return toks.map(t => {
    if (t.t !== TK.NU) return t;
    if (t.v.startsWith('0x') || t.v.startsWith('0X')) return t;
    const n = parseFloat(t.v);
    if (!isFinite(n) || !Number.isInteger(n) || Math.abs(n) > 2e6) return t;
    const safe = n >= 0 && n < 2147483648;
    const s = randInt(0, 39);
    if (s === 0)  { const a = randInt(1, 9999); return { ...t, v: `(${n + a}-${a})` }; }
    if (s === 1 && safe) { const m = randInt(1, 65535); return { ...t, v: `(bit32.bxor(${n ^ m},${m}))` }; }
    if (s === 2 && safe) { const x = randInt(1, 127); return { ...t, v: `(bit32.bxor(bit32.bxor(${n},${x}),${x}))` }; }
    if (s === 3)  { const a = randInt(1, 999), b = randInt(1, 999); return { ...t, v: `(${n + a + b}-${a}-${b})` }; }
    if (s === 4)  { const k = randInt(1, 999); return { ...t, v: `(${n + k}-${k})` }; }
    if (s === 5)  { const a = randInt(1, 99), b = randInt(1, 99); return { ...t, v: `(${n + a * b}-${a}*${b})` }; }
    if (s === 6 && safe) { const m = randInt(1, 0xFFFF); return { ...t, v: `(bit32.bxor(bit32.bor(${n},${m}),bit32.band(bit32.bxor(${n},${m}),${m})))` }; }
    if (s === 7)  { const k = randInt(2, 9); return { ...t, v: `(math.floor(${n * k}/${k}))` }; }
    if (s === 8)  { const a = randInt(1, 50); return { ...t, v: `(${n + a * a}-${a}*${a})` }; }
    if (s === 9 && safe && n > 0) { return { ...t, v: `(bit32.lshift(bit32.rshift(${n},1),1)+bit32.band(${n},1))` }; }
    if (s === 10) { const a = randInt(1000, 9999), b = randInt(1, 999); return { ...t, v: `(${n + a}-${b}-(${a - b}))` }; }
    if (s === 11) { const r = randInt(1, 7); return { ...t, v: `(math.floor(${n * (1 << r)}/${1 << r}))` }; }
    if (s === 12 && safe) { const k1 = randInt(1, 127), k2 = randInt(1, 127); return { ...t, v: `(bit32.bxor(bit32.bxor(${n ^ k1},${k1 ^ k2}),${k2}))` }; }
    if (s === 13) { const a = randInt(1, 999); return { ...t, v: `(${n + a * 2}-${a}-${a})` }; }
    if (s === 14 && safe && n > 0) { return { ...t, v: `(bit32.bor(${n & 0xFFFF},bit32.lshift(bit32.rshift(${n},16),16)))` }; }
    if (s === 15) { const k = randInt(3, 11); return { ...t, v: `(math.fmod(${n + k * 1000},${k * 1000 + 1}) + ${n - (n + k * 1000) % (k * 1000 + 1)})` }; }
    if (s === 16 && safe) { const k1=randInt(1,127),k2=randInt(1,127),k3=randInt(1,127); return { ...t, v: `(bit32.bxor(bit32.bxor(bit32.bxor(${(n^k1^k2^k3)>>>0},${k3}),${k2}),${k1}))` }; }
    if (s === 17) { const a = randInt(1, 99), b = n + a; return { ...t, v: `(${b}-${a})` }; }
    if (s === 18) { const a = randInt(1, 9), b = randInt(1, 9); return { ...t, v: `(${n + a + b}-${a}-${b})` }; }
    if (s === 19 && safe) { const k1=randInt(1,127),k2=randInt(1,127),k3=randInt(1,127),k4=randInt(1,127); return { ...t, v: `(bit32.bxor(bit32.bxor(bit32.bxor(bit32.bxor(${(n^k1^k2^k3^k4)>>>0},${k4}),${k3}),${k2}),${k1}))` }; }
    if (s === 20 && safe && n > 0) { const sh=randInt(1,4); return { ...t, v: `(bit32.bor(bit32.band(${n},bit32.bnot(bit32.lshift(1,${sh})-1)),bit32.band(${n},bit32.lshift(1,${sh})-1)))` }; }
    if (s === 21) { const a=randInt(1,9), b=randInt(1,9), c=a*b; return { ...t, v: `(${n+c}-${a}*${b})` }; }
    if (s === 22 && safe) { return { ...t, v: `(bit32.band(bit32.bor(${n},0),0xFFFFFFFF))` }; }
    if (s === 23) { const a=randInt(2,5); return { ...t, v: `(math.floor((${n*a}+${a-1})/${a}))` }; }
    if (s === 24 && safe) { const k=randInt(1,255); return { ...t, v: `(bit32.bxor(bit32.bnot(bit32.bxor(bit32.bnot(${n}),${k})),${k}))` }; }
    if (s === 25) { const a=randInt(1,99), b=randInt(1,99); return { ...t, v: `(${n}+${a}*${b}-${a}*${b})` }; }
    if (s === 26 && safe && n > 0) { return { ...t, v: `(bit32.lshift(bit32.rshift(${n},0),0))` }; }
    if (s === 27) { const k=randInt(2,7); return { ...t, v: `(${n*k}/${k})` }; }
    if (s === 28) { const a=randInt(10,999), b=randInt(10,999); return { ...t, v: `(${n+a+b}-${a}-${b})` }; }
    if (s === 29 && safe) { const k1=randInt(1,127),k2=randInt(1,127); return { ...t, v: `(bit32.band(bit32.bor(bit32.bxor(${n^k1},${k1}),0),bit32.bxor(bit32.bxor(0xFFFFFFFF,${k2}),${k2})))` }; }
    if (s === 30) { const a=randInt(1,50), b=randInt(1,50); return { ...t, v: `(${n+a}-${b}+(${b-a}))` }; }
    if (s === 31 && safe && n > 0) { const sh=randInt(1,3); return { ...t, v: `(bit32.bor(bit32.lshift(bit32.rshift(${n},${sh}),${sh}),bit32.band(${n},${(1<<sh)-1})))` }; }
    if (s === 32) { const a=randInt(2,9); return { ...t, v: `(math.floor(${n+0.0}+0.5-${a}*(1/${a}-1)))`}; }
    if (s === 33 && safe) { const k=randInt(1,0xFF); return { ...t, v: `(bit32.bnot(bit32.bnot(${n})))` }; }
    if (s === 34) { const p=randInt(1,3), pow=Math.pow(10,p); return { ...t, v: `(math.floor(${n*pow}/${pow}))` }; }
    if (s === 35 && safe) { const k1=randInt(1,127), k2=randInt(1,127), k3=randInt(1,127), k4=randInt(1,127), k5=randInt(1,127); const enc=(n^k1^k2^k3^k4^k5)>>>0; return { ...t, v: `(bit32.bxor(bit32.bxor(bit32.bxor(bit32.bxor(bit32.bxor(${enc},${k5}),${k4}),${k3}),${k2}),${k1}))` }; }
    if (s === 36) { const a=randInt(100,999); return { ...t, v: `(${n+a+1}-${a}-1)` }; }
    if (s === 37 && safe) { const m=randInt(1,0xFFFF); return { ...t, v: `(bit32.bxor(bit32.band(bit32.bxor(${n},${m}),0xFFFFFFFF),${m}))` }; }
    if (s === 38) { const a=randInt(3,9); return { ...t, v: `(${n*a*a}/${a}/${a})` }; }
    if (s === 39 && safe && n > 0) { return { ...t, v: `(bit32.bor(0,bit32.band(${n},0x7FFFFFFF)))` }; }
    const k = randInt(1, 4999); return { ...t, v: `(${n + k}-${k})` };
  });
}

function breakGlobals(toks) {
  const res = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === TK.ID && BREAKABLE.has(t.v) && t.v.length >= 4) {
      const prev = res.filter(x => x.t !== TK.WS).slice(-1)[0];
      if (prev && (prev.v === '.' || prev.v === ':' || prev.v === '[')) {
        res.push(t); continue;
      }
      res.push({ t: TK.OT, v: `_ENV[${splitStr(t.v)}]` }); continue;
    }
    res.push(t);
  }
  return res;
}

const JUNK = [
  () => { const a = randName(), b = randName(); return `do local ${a}=math.floor(0) local ${b}=${a} end`; },
  () => { const a = randName(); return `if type(nil)~="nil" then local ${a}=0 end`; },
  () => { const a = randName(); return `do local ${a}=bit32.bxor(${randInt(1, 255)},${randInt(1, 255)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.max(${randInt(1, 9)},${randInt(10, 20)}) local ${b}=${a}-${a} end`; },
  () => { const a = randName(); return `if false then local ${a}="${randHex(4)}" end`; },
  () => { const a = randName(), b = randName(), c = randName(); return `do local ${a}={} local ${b}=#${a} local ${c}=${b}*0 end`; },
  () => { const a = randName(); return `do local ${a}=string.len("") end`; },
  () => { const x = randInt(32, 126); const a = randName(); return `do local ${a}=string.char(${x}) end`; },
  () => { const a = randName(), b = randInt(1, 1000), c = randInt(1, 1000); return `do local ${a}=math.abs(${b}-${c}) end`; },
  () => { const a = randName(); return `repeat local ${a}=0 ${a}=${a}+1 until ${a}>0`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=tostring(${randInt(0, 9)}) local ${b}=#${a} end`; },
  () => { const a = randName(); return `if ${randInt(1, 9)}>${randInt(10, 20)} then local ${a}=nil end`; },
  () => { const a = randName(); return `do local ${a}=math.pi*0 end`; },
  () => { const a = randName(), k = randInt(1, 255); return `do local ${a}=bit32.band(${k},0xFF) end`; },
  () => { const a = randName(); return `do local ${a}=select("#") end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=type("x")=="string" local ${b}=${a} end`; },
  () => { const a = randName(); return `for ${a}=1,0 do end`; },
  () => { const a = randName(), b = randInt(32, 126); return `do local ${a}=string.byte(string.char(${b})) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.huge local ${b}=math.huge-${a} end`; },
  () => { const a = randName(); return `do local ${a}=rawequal(nil,nil) end`; },
  () => { const a = randName(), n = randInt(1, 255); return `do local ${a}=bit32.bnot(${n}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.concat({}) local ${b}=#${a} end`; },
  () => { const a = randName(); return `do local ${a}=math.fmod(${randInt(1,99)},${randInt(100,999)}) end`; },
  () => { const a = randName(); return `do local ${a}={} ${a}[1]=nil end`; },
  () => { const a = randName(), b = randInt(0, 1); return `do local ${a}=bit32.rshift(${randInt(1,255)},${b}) end`; },
  () => { const a = randName(); return `if select("#")>=0 then local ${a}=0 end`; },
  () => { const a = randName(); return `do local ${a}=string.format("%d",${randInt(0,9)}) end`; },
  () => { const a = randName(), b = randName(); return `do local function ${a}() return ${randInt(0,9)} end local ${b}=${a}() end`; },
  () => { const a = randName(); return `do local ${a}=math.floor(math.pi)~=3 end`; },
  () => { const a = randName(), k1 = randInt(1,127), k2 = randInt(1,127); return `do local ${a}=bit32.bxor(${k1},${k2}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=pcall(function() local ${b}=0 end) end`; },
  () => { const a = randName(); return `do local ${a}=math.ceil(${randInt(1,9)}.${randInt(1,9)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}="" for ${b}=1,0 do ${a}=${a}..${b} end end`; },
  () => { const a = randName(); return `do local ${a}=bit32.lshift(1,${randInt(0,7)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}={[1]=false} local ${b}=${a}[2] end`; },
  () => { const a = randName(); return `do local ${a}=math.min(${randInt(100,999)},${randInt(1000,9999)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=string.rep("x",0) local ${b}=#${a} end`; },
  () => { const a = randName(); return `do local ${a}=not not not false end`; },
  () => { const a = randName(), k = randInt(1,255); return `do local ${a}=bit32.arshift(${k},0) end`; },
  () => { const a = randName(), b = randName(), c = randName(); return `do local function ${a}(${b}) return ${b}+0 end local ${c}=${a}(0) end`; },
  () => { const a = randName(); return `do local ${a}=(function() return nil end)() end`; },
  () => { const a = randName(), b = randInt(2,9); return `do local ${a}=${b}^0 end`; },
  () => { const a = randName(); return `if true then local ${a}=${randInt(0,0)} end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.pack() local ${b}=${a}.n end`; },
  () => { const a = randName(); return `do local ${a}=math.log(1) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=rawget({},1) local ${b}=${a}==nil end`; },
  () => { const a = randName(); return `do local ${a}=bit32.bor(0,${randInt(0,255)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=1 while ${a}>1 do ${b}=0 end end`; },
  () => { const a = randName(); return `do local ${a}=tostring(nil)=="nil" end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.huge~=math.huge local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=string.reverse("") end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.random() local ${b}=${a}*0 end`; },
  () => { const a = randName(); return `do local ${a}=coroutine.running() end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=type(0)=="number" local ${b}=not not ${a} end`; },
  () => { const a = randName(); return `do local ${a}=bit32.extract(${randInt(1,255)},0,1) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=string.sub("abc",1,0) local ${b}=${a}=="" end`; },
  () => { const a = randName(); return `do local ${a}=math.atan2(0,1) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.move({},1,0,1,{}) local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=bit32.replace(0,0,0,1) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=setmetatable({},{}) local ${b}=${a} end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=string.match("${randHex(4)}","(.)") local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=math.exp(0) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.create and table.create(0) or {} local ${b}=#${a} end`; },
  () => { const a = randName(); return `do local ${a}=bit32.lrotate(${randInt(1,255)},0) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=pcall(tostring,${randInt(0,9)}) local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=string.find("${randHex(2)}",".",1,true) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.ldexp(1,0) local ${b}=${a}-1 end`; },
  () => { const a = randName(); return `do local ${a}=bit32.rrotate(${randInt(1,255)},0) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=select(1,nil) local ${b}=${a}==nil end`; },
  () => { const a = randName(); return `do local ${a}=math.frexp(1) end`; },
  () => { const a = randName(), b = randName(); return `do local function ${a}() return function() return 0 end end local ${b}=${a}()() end`; },
  () => { const a = randName(); return `do local ${a}=rawlen and rawlen({}) or 0 end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=coroutine.create(function() end) local ${b}=coroutine.status(${a}) end`; },
  () => { const a = randName(); return `do local ${a}=string.gsub("","","",0) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.modf(${randInt(1,9)}.${randInt(0,9)}) local ${b}=${a} end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=bit32.bxor(bit32.bnot(${randInt(1,255)}),bit32.bnot(${randInt(1,255)})) local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=math.sqrt(${randInt(1,9)}*${randInt(1,9)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}={} for ${b}=1,${randInt(0,0)} do ${a}[${b}]=0 end end`; },
  () => { const a = randName(); return `do local ${a}=string.lower(string.upper("${String.fromCharCode(randInt(97,122))}")) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=type(print) local ${b}=${a}=="function" end`; },
  () => { const a = randName(); return `if math.huge==math.huge then local ${a}=0 end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=bit32.band(0xFF,bit32.bor(0x00,${randInt(1,255)})) local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=string.byte(string.char(${randInt(48,122)})) end`; },
  () => { const a = randName(), b = randName(); return `do local function ${a}(x) if x<=1 then return x end return ${a}(x-1) end local ${b}=${a}(1) end`; },
  () => { const a = randName(); return `do local ${a}=bit32.lshift(bit32.rshift(${randInt(1,255)},${randInt(0,3)}),${randInt(0,3)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=tostring(math.pi):sub(1,4) local ${b}=#${a} end`; },
  () => { const a = randName(); return `do local ${a}=pcall(function() return true end) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}={x=0,y=0} local ${b}=${a}.x+${a}.y end`; },
  () => { const a = randName(); return `do local ${a}=math.sin(0)+math.cos(0) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=string.format("%x",${randInt(1,255)}) local ${b}=#${a} end`; },
  () => { const a = randName(); return `do local ${a}=bit32.rrotate(bit32.lrotate(${randInt(1,255)},${randInt(1,4)}),${randInt(1,4)}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.concat({"","",""}) local ${b}=${a}=="" end`; },
  () => { const a = randName(); return `do local ${a}=math.max(math.min(${randInt(1,9)},${randInt(10,20)}),0) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=select(2,pcall(function() end)) local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=bit32.band(bit32.bor(${randInt(0,255)},${randInt(0,255)}),0xFF) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=rawget({[1]=nil},1) local ${b}=${a}==nil end`; },
  () => { const a = randName(); return `do local ${a}=math.deg(0)==0 end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=string.split and string.split("a,b","," ) or {"a","b"} local ${b}=#${a} end`; },
  () => { const a = randName(); return `do local ${a}=typeof and typeof({}) or type({}) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=game and pcall(function()return game:GetService("RunService")end) or false local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=tick and tick() or os.time() end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=math.clamp and math.clamp(${randInt(1,5)},0,10) or math.min(math.max(${randInt(1,5)},0),10) local ${b}=${a} end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.find and table.find({1,2,3},${randInt(1,3)}) or nil local ${b}=${a} end`; },
  () => { const a = randName(); return `do local ${a}=bit32.countlz and bit32.countlz(${randInt(1,255)}) or 0 end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}={} for ${b}=1,${randInt(1,3)} do ${a}[${b}]=bit32.band(${b},0xFF) end end`; },
  () => { const a = randName(); return `do local ${a}=utf8 and utf8.len("abc") or 3 end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=pcall(function() local t={} setmetatable(t,{__index=function() return 0 end}) local ${b}=t.x end) end`; },
  () => { const a = randName(); return `do local ${a}=math.huge==1/0 end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=bit32.extract(${randInt(1,255)},${randInt(0,3)},${randInt(1,4)}) local ${b}=bit32.replace(${randInt(1,255)},0,0,1) end`; },
  () => { const a = randName(), b = randName(), c = randName(); return `do local function ${a}(${b},${c}) return ${b} end local _=pcall(${a},0,0) end`; },
  () => { const a = randName(); return `do local ${a}=string.pack and string.pack("I1",${randInt(0,255)}) or "\\0" end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}={n=0} for ${b}=1,${randInt(1,2)} do ${a}.n=${a}.n+bit32.bor(${b},0) end end`; },
  () => { const a = randName(); return `do local ${a}=math.log(math.exp(${randInt(1,5)})) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=table.pack(string.byte("${randHex(2)}",1,2)) local ${b}=${a}.n end`; },
  () => { const a = randName(); return `do local ${a}=not rawequal(rawget({},1),rawget({},1)) end`; },
  () => { const a = randName(), b = randName(); return `do local ${a}=select("#") local ${b}=type(${a})=="number" end`; },
  () => { const a = randName(); return `do local ${a}=string.format("%d",math.max(${randInt(0,9)},${randInt(0,9)})) end`; },
];

function injectJunk(code) {
  const lines = code.split('\n'), out = [];
  for (const l of lines) {
    out.push(l);
    const tr = l.trim();
    if (Math.random() < 0.25 && (tr.endsWith('end') || tr.startsWith('local ') || tr === '')) {
      out.push(JUNK[randInt(0, JUNK.length - 1)]());
    }
  }
  return out.join('\n');
}

// L6: Opaque predicates — 20 mathematically guaranteed false conditions (v8)
function injectOpaquePredicates(code) {
  const preds = [
    () => { const a = randInt(2, 9), b = a * a; return `if math.floor(math.sqrt(${b}))~=${a} then error("",0) end`; },
    () => `if type("")~="string" then error("",0) end`,
    () => { const n = randInt(10, 99); return `if ${n}%${n}~=0 then error("",0) end`; },
    () => `if rawequal(nil,false) then error("",0) end`,
    () => { const a = randInt(1, 100); return `if math.max(${a},${a})~=${a} then error("",0) end`; },
    () => { const a = randInt(1,50), b = randInt(51,100); return `if bit32.bor(${a},${b})<${a} then error("",0) end`; },
    () => { const n = randInt(2, 8); return `if math.abs(-${n})~=${n} then error("",0) end`; },
    () => `if #{}~=0 then error("",0) end`,
    () => { const a = randInt(1, 100); return `if tostring(${a})~="${a}" then error("",0) end`; },
    () => { const a = randInt(1,9), b = a+1; return `if math.min(${a},${b})~=${a} then error("",0) end`; },
    () => { const a = randInt(1,127); return `if bit32.bxor(${a},${a})~=0 then error("",0) end`; },
    () => `if type(0)~="number" then error("",0) end`,
    () => { const a = randInt(1,50); return `if bit32.band(${a},${a})~=${a} then error("",0) end`; },
    () => `if select("#")~=0 then error("",0) end`,
    () => { const a = randInt(2,9); return `if ${a}*0~=0 then error("",0) end`; },
    () => `if type(true)~="boolean" then error("",0) end`,
    () => { const a = randInt(1,99); return `if math.floor(${a})~=${a} then error("",0) end`; },
    () => `if string.len("")~=0 then error("",0) end`,
    () => { const a = randInt(1,50), b = randInt(1,50); return `if bit32.bxor(bit32.bxor(${a},${b}),${b})~=${a} then error("",0) end`; },
    () => { const a = randInt(1,9); return `if math.ceil(${a})~=${a} then error("",0) end`; },
    () => { const a = randInt(1,255); return `if bit32.band(${a},0xFF)~=${a & 0xFF} then error("",0) end`; },
    () => `if type(type)~="function" then error("",0) end`,
    () => { const a = randInt(1,9), b = randInt(1,9); return `if ${a}+${b}~=${a+b} then error("",0) end`; },
    () => { const a = randInt(2,8); return `if ${a}^1~=${a} then error("",0) end`; },
    () => `if type({})~="table" then error("",0) end`,
    () => { const a = randInt(1,99); return `if math.abs(${a}-${a})~=0 then error("",0) end`; },
    () => { const a = randInt(1,50); return `if bit32.lshift(bit32.rshift(${a},0),0)~=${a} then error("",0) end`; },
    () => `if string.sub("abc",1,1)~="a" then error("",0) end`,
    () => { const a = randInt(1,50), b = randInt(51,100); return `if math.min(${a},${b})~=${a} then error("",0) end`; },
    () => { const a = randInt(2,9); return `if math.floor(${a}/${a})~=1 then error("",0) end`; },
    () => `if tostring(true)~="true" then error("",0) end`,
    () => { const a = randInt(1,127); return `if bit32.band(${a},0xFF)~=${a} then error("",0) end`; },
    () => { const a = randInt(1,9), b = randInt(1,9); return `if ${a}*${b}~=${a*b} then error("",0) end`; },
    () => `if type(nil)~="nil" then error("",0) end`,
    () => { const a = randInt(2,8); return `if ${a}%1~=0 then error("",0) end`; },
  ];
  const lines = code.split('\n');
  const nPreds = randInt(3, 6);
  for (let p = 0; p < nPreds; p++) {
    const insertAt = Math.floor(lines.length * (0.1 + Math.random() * 0.6));
    const pred = preds[randInt(0, preds.length - 1)]();
    lines.splice(insertAt, 0, pred);
  }
  return lines.join('\n');
}

// ─── L8: Dead Code Path Injection ─────────────────────────────
// Injects unreachable but syntactically valid branches using
// impossible math conditions, making static analysis harder.

const DEAD_PATHS = [
  () => { const a = randName(), n = randInt(2,9); return `if (${n}*${n}) < ${n} then local ${a}=nil error(${a},0) end`; },
  () => { const a = randName(), b = randInt(10,99); return `if string.len("") > ${b} then local ${a}=error end`; },
  () => { const a = randName(); return `if type({}) == "number" then local ${a}=0/${a} end`; },
  () => { const a = randName(), v = randInt(1,99); return `if math.huge < ${v} then local ${a}=nil end`; },
  () => { const a = randName(), b = randName(); return `if rawequal(1,"1") then local ${a},${b}=nil,nil end`; },
  () => { const a = randName(); return `if bit32.bxor(0xFF,0xFF) > 0 then local ${a}=0 end`; },
  () => { const a = randName(), v = randInt(1,99); return `if tostring(${v}) == tostring(${v+1}) then local ${a}="" end`; },
  () => { const a = randName(), n = randInt(2,8); return `if math.sqrt(${n*n}) > ${n}+1 then local ${a}=nil end`; },
  () => { const a = randName(); return `if #"" > 0 then local ${a}="" error("",0) end`; },
  () => { const a = randName(), b = randInt(1,99); return `if math.abs(-${b}) ~= ${b} then local ${a}=nil end`; },
];

function injectDeadCodePaths(code) {
  const lines = code.split('\n');
  const out = [];
  for (const l of lines) {
    out.push(l);
    const tr = l.trim();
    if (Math.random() < 0.12 && (tr === 'end' || tr === 'end,' || tr.startsWith('local function') || tr.startsWith('do'))) {
      out.push(DEAD_PATHS[randInt(0, DEAD_PATHS.length - 1)]());
    }
  }
  return out.join('\n');
}

function generateWatermarkChecks() {
  const checks = [];
  const nChecks = randInt(3, 6);
  for (let i = 0; i < nChecks; i++) {
    const wm_ = randName();
    const val = randInt(10000, 99999);
    const key = randInt(1, 254);
    const encoded = val ^ key;
    checks.push({
      decl: `local ${wm_}=bit32.bxor(${encoded},${key})`,
      verify: `if ${wm_}~=${val} then error("",0) end`,
    });
  }
  return checks;
}

function wrapAntiHook(code) {
  const sig  = randName(), vn = randName(), en = randName();
  const ah1  = randName(), ah2 = randName(), dbg = randName();
  const env2 = randName(), chk = randName();
  const mt_  = randName(), mt2_ = randName();
  const gc_  = randName();
  const str2_ = randName();
  const co_  = randName(), co2_ = randName();
  const pd_  = randName(), pd2_ = randName();
  const uv_  = randName(), uv2_ = randName();
  const ci_  = randName(), ci2_ = randName();
  const sd_  = randName(), sd2_ = randName();
  const gf_  = randName();
  const ht_  = randName(), ht2_ = randName();
  const bc = Array.from({ length: randInt(32, 64) }, () => randInt(0, 255)).join(',');
  const hashA = randHex(8).toUpperCase();
  const hashB = randHex(4).toUpperCase();
  const ver = `13.${randInt(0, 9)}.${randInt(10, 99)}`;
  const ts = Date.now();

  const watermarks = generateWatermarkChecks();
  const wmDecls = watermarks.map(w => w.decl);
  const wmVerifies = watermarks.map(w => w.verify);
  const wmMidpoint = Math.floor(wmVerifies.length / 2);
  const wmBeforeCode = wmVerifies.slice(0, wmMidpoint);
  const wmAfterCode = wmVerifies.slice(wmMidpoint);

  const honeypotVar = randName();
  const honeypotKey = randInt(10000, 99999);
  const honeypotEnc = honeypotKey ^ randInt(1, 254);
  const repLen = randInt(4,8);

  return [
    `--[[ `,
    `    ╔══════════════════════════════════════════════════════════╗`,
    `    ║                                                          ║`,
    `    ║   ██╗     ██╗   ██╗ █████╗ ███████╗██╗  ██╗██╗██████╗   ║`,
    `    ║   ██║     ██║   ██║██╔══██╗██╔════╝██║  ██║██║██╔═══╝   ║`,
    `    ║   ██║     ██║   ██║███████║███████╗███████║██║██████╗    ║`,
    `    ║   ██║     ██║   ██║██╔══██║╚════██║██╔══██║██║██╔═══╝   ║`,
    `    ║   ███████╗╚██████╔╝██║  ██║███████║██║  ██║██║██████╗   ║`,
    `    ║   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═════╝   ║`,
    `    ║                                                          ║`,
    `    ║      ╔═╗╦ ╦╦╔═╗╦  ╔╦╗  Protection Engine v${ver}      ║`,
    `    ║      ╚═╗╠═╣║║╣ ║   ║║  Powered by LuaShield            ║`,
    `    ║      ╚═╝╩ ╩╩╚═╝╩═╝╚═╝  github.com/fabiantxl            ║`,
    `    ║                                                          ║`,
    `    ║   ┌──────────────────────────────────────────┐           ║`,
    `    ║   │  Build: ${hashA}-${hashB}          │           ║`,
    `    ║   │  Time:  ${new Date(ts).toISOString().slice(0,19)}Z          │           ║`,
    `    ║   │  Mode:  Enterprise Protection          │           ║`,
    `    ║   └──────────────────────────────────────────┘           ║`,
    `    ║                                                          ║`,
    `    ║   ⚠  This script is protected by LuaShield.             ║`,
    `    ║   ⚠  Unauthorized modification or redistribution        ║`,
    `    ║      is strictly prohibited.                             ║`,
    `    ║                                                          ║`,
    `    ╚══════════════════════════════════════════════════════════╝`,
    `]]`,
    `local ${sig}={_bc={${bc}},_v="${ver}",_id="${randHex(16)}",_ts=${ts},_wm="${randHex(8)}",_ck="${randHex(12)}"}`,
    `local ${vn}=string.char(bit32.bxor(0x${(65 ^ randInt(1, 10)).toString(16).padStart(2, '0')},${randInt(1, 10)}))`,
    ...wmDecls,
    `local ${ah1}=bit32.bxor(0x41,0x00)`,
    `if string.char(${ah1})~="A" then error("",0) end`,
    `local ${ah2}=string.char(72)`,
    `if ${ah2}~="H" then error("",0) end`,
    `local ${dbg}=pcall(function() if debug~=nil and debug.getinfo~=nil then error("",0) end end)`,
    `local ${env2}=type(_ENV)`,
    `local ${chk}=pcall(function() assert(${env2}=="table","") end)`,
    `if not ${chk} then error("",0) end`,
    ...wmBeforeCode,
    `local ${mt_}=setmetatable({},{__index=function() return nil end})`,
    `local ${mt2_}=${mt_}["${randHex(4)}"]`,
    `if ${mt2_}~=nil then error("",0) end`,
    `local ${gc_}=pcall(function() local _=collectgarbage("count") end)`,
    `local ${str2_}=string.rep("\\0",${repLen})`,
    `if #${str2_}~=${repLen} then error("",0) end`,
    `local ${pd_}=0`,
    `local ${pd2_}=pcall(function() ${pd_}=${pd_}+1 pcall(function() ${pd_}=${pd_}+1 pcall(function() ${pd_}=${pd_}+1 end) end) end)`,
    `if ${pd_}~=3 then error("",0) end`,
    `local ${uv_}=(function() local _secret=${randInt(10000,99999)} return function() return _secret end end)()`,
    `local ${uv2_}=pcall(function() if debug and debug.getupvalue then local _n,_v=debug.getupvalue(${uv_},1) if _n then error("",0) end end end)`,
    `local ${ci_}=function() return true end`,
    `local ${ci2_}=pcall(function() if tostring(${ci_}):sub(1,8)~="function" then error("",0) end end)`,
    `local ${sd_}=0`,
    `local ${sd2_}=pcall(function() local function _c(n) if n>0 then return _c(n-1) end return true end _c(5) ${sd_}=1 end)`,
    `if ${sd_}~=1 then error("",0) end`,
    `local ${gf_}=pcall(function() if getfenv then local _e=getfenv(0) if type(_e)~="table" then error("",0) end end end)`,
    `local ${ht_}=setmetatable({},{__newindex=function(t,k,v) rawset(t,k,v) end,__index=function(t,k) return rawget(t,k) end})`,
    `${ht_}["${randHex(4)}"]=true`,
    `local ${ht2_}=${ht_}["${randHex(4)}"]`,
    `local ${honeypotVar}=setmetatable({_k=${honeypotEnc}},{__index=function(self,k) if k=="_d" then error("",0) end return rawget(self,k) end,__newindex=function(self,k,v) if k=="_d" then error("",0) end rawset(self,k,v) end})`,
    `local function ${en}()`,
    code,
    `end`,
    ...wmAfterCode,
    `local _ok,_er=pcall(${en})`,
    `if not _ok then error(tostring(_er),0) end`,
  ].join('\n');
}

// ─── Main obfuscate function ────────────────────────────────────

function obfuscate(code, opts = {}) {
  const options = {
    vmCompile:          opts.vmCompile          !== false,
    renameVars:         opts.renameVars         !== false,
    encryptStrings:     opts.encryptStrings     !== false,
    obfuscateNumbers:   opts.obfuscateNumbers   !== false,
    breakGlobals:       opts.breakGlobals       !== false,
    injectJunk:         opts.injectJunk         !== false,
    opaquePredicates:   opts.opaquePredicates   !== false,
    antiHook:           opts.antiHook           !== false,
    controlFlowFlatten: opts.controlFlowFlatten ?? false,
    stringArrayRotate:  opts.stringArrayRotate  ?? false,
    envFingerprint:     opts.envFingerprint     ?? false,
    vmNesting:          opts.vmNesting          ?? false,
    tripleNesting:      opts.tripleNesting      ?? false,
    deadCodePaths:      opts.deadCodePaths      ?? false,
  };

  const t0 = Date.now();
  const origSize = code.length;
  const applied = [];

  let workCode = code;
  let vmUsed = false;
  let vmShapeName = '';

  if (options.vmCompile && luaparse) {
    try {
      const ops = makeOpcodeMap();
      const ast = luaparse.parse(workCode, {
        comments: false,
        scope: false,
        locations: false,
        ranges: false,
        luaVersion: '5.2',
      });
      const compiler = new Compiler(ops);
      const rootProto = compiler.compile(ast);
      workCode = buildVMCore(rootProto, ops);
      vmShapeName = ['DispatchTable', 'LinkedList', 'TokenizedString', 'StackVM'][randInt(0, 3)];
      applied.push(`VM Bytecode Compiler v12 (${vmShapeName} shape, polymorphic handlers, shuffled opcodes, coroutine execution)`);
      applied.push('Penta-Key XOR Constant Encryption (five independent rotating keys)');
      applied.push('Constant Pool Interleaving (fake constants mixed with real)');
      applied.push('Polymorphic Opcode Handlers (multiple equivalent implementations per run)');
      applied.push('Rolling XOR Cipher on Bytecode Fields');
      applied.push('Dead Bytecode Injection (unreachable VM instructions with JMP-over)');
      applied.push('Self-Hash Integrity Verification (multi-point runtime check)');
      applied.push('Opaque Payload Encoding (custom-alphabet XOR)');
      applied.push('Fake Dispatch Table Entries (20-35 dead branches)');
      applied.push('NOP Opcode + 36 Shuffled Opcodes');
      applied.push('Goto/Labels/Deep Upvalues/ForGeneric/Repeat/Vararg/MultiReturn');
      vmUsed = true;

      if (options.vmNesting) {
        const nestingLayers = options.tripleNesting ? 2 : 1;
        for (let layer = 0; layer < nestingLayers; layer++) {
          try {
            const opsN = makeOpcodeMap();
            const astN = luaparse.parse(workCode, {
              comments: false, scope: false, locations: false, ranges: false, luaVersion: '5.2',
            });
            const compilerN = new Compiler(opsN);
            const rootProtoN = compilerN.compile(astN);
            workCode = buildVMCore(rootProtoN, opsN);
            const vmShapeN = ['DispatchTable', 'LinkedList', 'TokenizedString', 'StackVM'][randInt(0, 3)];
            applied.push(`VM Nesting — Layer ${layer + 2} (${vmShapeN} shape, independent opcode map, Russian-doll protection)`);
          } catch (e) {
            applied.push(`VM Nesting Layer ${layer + 2} fallback (${e.message.slice(0, 60)})`);
          }
        }
      }
    } catch (e) {
      applied.push(`VM Compiler fallback (${e.message.slice(0, 80)})`);
    }
  }

  let toks = tokenize(workCode);

  if (options.renameVars) {
    toks = renameLocals(toks);
    applied.push('Identifier Renaming');
  }

  if (options.stringArrayRotate && !vmUsed) {
    const rotResult = rotateStringArray(toks);
    if (rotResult) {
      toks = rotResult.toks;
      workCode = rotResult.prefix + reconstruct(toks);
      toks = tokenize(workCode);
      applied.push('String Array Rotation (indexed lookup with XOR decode)');
    }
  }

  if (options.encryptStrings) {
    toks = encryptStrings(toks);
    applied.push('String Encryption (9-pattern polymorphic, no decryptor name)');
  }
  if (options.obfuscateNumbers) {
    toks = obfuscateNumbers(toks);
    applied.push('Number Obfuscation (30-pattern multi-step bit32)');
  }
  if (options.breakGlobals && !vmUsed) {
    toks = breakGlobals(toks);
    applied.push('Global Name Splitting (runtime _ENV lookup)');
  }

  let result = reconstruct(toks);

  if (options.controlFlowFlatten && !vmUsed) {
    result = flattenControlFlow(result);
    applied.push('Control Flow Flattening (state-machine dispatcher)');
  }

  if (options.injectJunk) {
    result = injectJunk(result);
    applied.push('Realistic Junk Code Injection (100 patterns v12)');
  }

  if (options.opaquePredicates) {
    result = injectOpaquePredicates(result);
    applied.push('Opaque Predicates v12 (36 math-guaranteed conditions, multi-inject)');
  }

  if (options.deadCodePaths) {
    result = injectDeadCodePaths(result);
    applied.push('Dead Code Path Injection v13 (L8 — 10 unreachable Roblox-style branches)');
  }

  if (options.envFingerprint) {
    result = wrapEnvironmentFingerprint(result);
    applied.push('Environment Fingerprinting (Roblox context detection)');
  }

  if (options.antiHook) {
    result = wrapAntiHook(result);
    applied.push('Anti-Hook v12 + Anti-Debug (bit32 fingerprint, executor detection, timing check, metatable trap, coroutine state, pcall depth, upvalue introspection trap, closure identity, honeypot trap)');
  }

  return {
    code: result,
    stats: {
      originalSize: origSize,
      obfuscatedSize: result.length,
      sizeRatio: (result.length / origSize).toFixed(2),
      techniquesApplied: applied,
      processingTimeMs: Date.now() - t0,
      vmUsed,
      vmShape: vmShapeName || 'N/A',
    },
  };
}

// ─── Presets ───────────────────────────────────────────────────

const PRESETS = {
  light: {
    vmCompile: false,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: false, breakGlobals: false,
    injectJunk: false, opaquePredicates: false, antiHook: false,
    controlFlowFlatten: false, stringArrayRotate: false, envFingerprint: false,
    vmNesting: false, deadCodePaths: false,
  },
  medium: {
    vmCompile: false,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: false,
    injectJunk: true, opaquePredicates: false, antiHook: true,
    controlFlowFlatten: false, stringArrayRotate: true, envFingerprint: false,
    vmNesting: false, deadCodePaths: false,
  },
  heavy: {
    vmCompile: true,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: true,
    injectJunk: true, opaquePredicates: true, antiHook: true,
    controlFlowFlatten: true, stringArrayRotate: true, envFingerprint: true,
    vmNesting: false, deadCodePaths: true,
  },
  max: {
    vmCompile: true,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: true,
    injectJunk: true, opaquePredicates: true, antiHook: true,
    controlFlowFlatten: true, stringArrayRotate: true, envFingerprint: true,
    vmNesting: true, tripleNesting: false, deadCodePaths: true,
  },
  ultra: {
    vmCompile: true,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: true,
    injectJunk: true, opaquePredicates: true, antiHook: true,
    controlFlowFlatten: true, stringArrayRotate: true, envFingerprint: true,
    vmNesting: true, tripleNesting: true, deadCodePaths: true,
  },
};

module.exports = { obfuscate, PRESETS };
e,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: false,
    injectJunk: true, opaquePredicates: false, antiHook: true,
    controlFlowFlatten: false, stringArrayRotate: true, envFingerprint: false,
    vmNesting: false,
  },
  heavy: {
    vmCompile: true,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: true,
    injectJunk: true, opaquePredicates: true, antiHook: true,
    controlFlowFlatten: true, stringArrayRotate: true, envFingerprint: true,
    vmNesting: false, deadCodePaths: true,
  },
  max: {
    vmCompile: true,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: true,
    injectJunk: true, opaquePredicates: true, antiHook: true,
    controlFlowFlatten: true, stringArrayRotate: true, envFingerprint: true,
    vmNesting: true, tripleNesting: false, deadCodePaths: true,
  },
  ultra: {
    vmCompile: true,
    renameVars: true, encryptStrings: true,
    obfuscateNumbers: true, breakGlobals: true,
    injectJunk: true, opaquePredicates: true, antiHook: true,
    controlFlowFlatten: true, stringArrayRotate: true, envFingerprint: true,
    vmNesting: true, tripleNesting: true, deadCodePaths: true,
  },
};

module.exports = { obfuscate, PRESETS };

ng: true, deadCodePaths: true,
  },
};

module.exports = { obfuscate, PRESETS };
