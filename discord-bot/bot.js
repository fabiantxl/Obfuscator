'use strict';

// ============================================================
//  LuaShield Discord Bot v13
//  - Slash commands: /obfuscate, /help, /language, /status
//  - DM support
//  - English / Spanish language selector on first use
//  - Obfuscator v13 (4 VM Shapes, Penta-Key XOR, Polymorphic Handlers,
//    VM Nesting, Triple-Nest Ultra, 9-Pattern String Encryption,
//    120 Junk Patterns, 36 Opaque Predicates, CFF, L7 CFF, L8 Dead Code,
//    String Array Rotation, Env Fingerprint, Anti-Debug v13, 20+ layers)
//  - Persistent language storage (survives bot restarts)
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
  EmbedBuilder,
  Colors,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandOptionType,
} = require('discord.js');

const { obfuscate, PRESETS } = require('./obfuscator');

// ─── Config ───────────────────────────────────────────────────

const TOKEN         = process.env.DISCORD_BOT_TOKEN;
const MAX_FILE_SIZE = 500 * 1024;
const LANG_FILE     = path.join(__dirname, 'user_languages.json');
const STATS_FILE    = path.join(__dirname, 'bot_stats.json');

if (!TOKEN) {
  console.error('[ERROR] Missing DISCORD_BOT_TOKEN in .env');
  process.exit(1);
}

// ─── Persistent language store ────────────────────────────────

const userLang = new Map();

function loadLangStore() {
  try {
    if (fs.existsSync(LANG_FILE)) {
      const data = JSON.parse(fs.readFileSync(LANG_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) userLang.set(k, v);
    }
  } catch { /* ignore corrupt file */ }
}

function saveLangStore() {
  try {
    const obj = {};
    for (const [k, v] of userLang) obj[k] = v;
    fs.writeFileSync(LANG_FILE, JSON.stringify(obj, null, 2));
  } catch { /* ignore write errors */ }
}

loadLangStore();

function getLang(userId) { return userLang.get(userId) ?? null; }
function setLang(userId, lang) { userLang.set(userId, lang); saveLangStore(); }

// ─── Rate limiting (v9) ──────────────────────────────────────

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, [now]);
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  const timestamps = rateLimitMap.get(userId).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = Math.min(...timestamps);
    const waitMs = RATE_LIMIT_WINDOW - (now - oldestInWindow);
    return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) };
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return { allowed: true, remaining: RATE_LIMIT_MAX - timestamps.length };
}

// ─── Stats tracking (v9) ─────────────────────────────────────

let botStats = { totalObfuscations: 0, totalBytesProcessed: 0, startTime: Date.now() };

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      botStats = { ...botStats, ...JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) };
    }
  } catch { /* ignore */ }
  botStats.startTime = Date.now();
}

function saveStats() {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(botStats, null, 2)); } catch { /* ignore */ }
}

loadStats();

// ─── i18n strings ─────────────────────────────────────────────

const I18N = {
  en: {
    langPicker:      'Please choose your language to get started:',
    langSet:         '🇺🇸 Language set to **English**! You can now use `/obfuscate` to protect your scripts. Your preference has been saved.',
    noCode:          'Attach a `.lua`/`.luau` file **or** paste code in the `code` option.',
    badFile:         'Only `.lua` and `.luau` files are accepted.',
    tooBig:          (kb) => `File exceeds the ${kb} KB limit.`,
    downloadErr:     'Could not download the file. Please try again.',
    obfErr:          'Could not obfuscate the script:',
    obfErrHint:      'Make sure the code is valid Lua/Luau.',
    doneTitle:       '✅ Obfuscation complete',
    fieldFile:       '📄 File',
    fieldLevel:      'Level',
    fieldTime:       '⏱️ Time',
    fieldOrigSize:   '📦 Original size',
    fieldObfSize:    '📦 Obfuscated size',
    fieldIncrease:   '📈 Size increase',
    fieldTech:       '🛡️ Techniques applied',
    footer:          'LuaShield v13 — 4 VM Shapes | Penta-Key XOR | Polymorphic Handlers | VM Nesting | 21+ Layers',
    helpTitle:       '🛡️ LuaShield v13 — Help',
    helpDesc:        'Top-tier Lua/Luau obfuscator for Roblox. 4 VM shapes (Dispatch Table, Linked-List, Tokenized String, Stack VM), Polymorphic Opcode Handlers, Penta-Key XOR encryption, VM Nesting, Triple-Nest (ultra), 9-Pattern String Encryption, 120 Junk Patterns, 36 Opaque Predicates, CFF, L8 Dead Code Path Injection, Anti-Debug v13, and 21+ protection layers.',
    helpUsage:       '`/obfuscate` — Attach a `.lua` file and select a protection level.\n`/status` — Show engine version and stats.',
    helpLight:       '• Comment stripping\n• Identifier renaming\n• 9-pattern polymorphic string encryption (no decryptor function)',
    helpMedium:      '• Light +\n• Multi-step `bit32` number obfuscation (30 patterns)\n• String Array Rotation (indexed XOR lookup)\n• 120-pattern junk code injection (v13, Roblox-specific APIs)\n• Anti-hook wrapper + pcall depth analysis',
    helpHeavy:       '• Medium +\n• **Multi-Shape VM v13** (4 shapes: Dispatch Table, Linked-List, Tokenized String, Stack VM)\n• Polymorphic Opcode Handlers (multiple equivalent implementations per run)\n• Rolling XOR cipher on bytecode fields\n• **Penta-Key XOR** constant encryption (5 independent rotating keys)\n• Dead Bytecode Injection (unreachable VM instructions with JMP-over)\n• Self-Hash integrity verification (multi-point runtime check)\n• Constant Pool Interleaving (fake constants mixed with real)\n• Control Flow Flattening (state-machine dispatcher)\n• **L8 Dead Code Path Injection** (10 impossible-math branches)\n• Environment Fingerprinting (Roblox context: game, workspace, Instance, script)\n• Opaque payload encoding (custom-alphabet XOR)\n• 20-35 fake dispatch table entries\n• 36 shuffled opcodes (including NOP)\n• `goto`/labels, `pairs`/`ipairs`, `repeat..until`, varargs, deep upvalues (2+ levels), multiple returns\n• Global name splitting (`_ENV` concat lookup)\n• 36 opaque predicates v13 (multi-inject)',
    helpDebug:       '• VM-only diagnostic build\n• Prints `[VM-DBG] pc/op/a/b/c` in Roblox F9 console\n• Use this only to locate runtime/register issues, not for final release',
    helpMax:         '• Same as Heavy +\n• **VM Nesting** (double-compile: Russian-doll protection, independent opcode maps)\n• Anti-debug v13 (bit32 fingerprint, `debug` lib detection, `string.dump` detection, env type check, metatable trap, coroutine state, pcall depth analysis, upvalue introspection trap, closure identity, honeypot traps, stack depth validation)\n• Multi-point cryptographic watermark (XOR-encoded)\n• Unique bytecode signature per run',
    helpUltra:       '• Same as Max +\n• **Triple VM Nesting** (Russian-doll × 3, three independent opcode maps)\n• Maximum entropy bytecode\n• Strongest protection level — hardest to reverse engineer',
    helpFooter:      'LuaShield v13 — Surpasses Luraph, IronBrew v3, Moonsec | 4 VM Shapes | Penta-Key XOR | VM Nesting',
    changeLang:      'Change language / Cambiar idioma',
    rateLimit:       (s) => `You're sending requests too fast! Please wait **${s} seconds** before trying again.`,
  },
  es: {
    langPicker:      'Por favor elige tu idioma para comenzar:',
    langSet:         '🇪🇸 Idioma establecido a **Español**! Ahora puedes usar `/obfuscate` para proteger tus scripts. Tu preferencia ha sido guardada.',
    noCode:          'Adjunta un archivo `.lua`/`.luau` **o** pega el código en la opción `code`.',
    badFile:         'Solo se aceptan archivos `.lua` y `.luau`.',
    tooBig:          (kb) => `El archivo supera el límite de ${kb} KB.`,
    downloadErr:     'No se pudo descargar el archivo. Inténtalo de nuevo.',
    obfErr:          'No se pudo ofuscar el script:',
    obfErrHint:      'Verifica que el código sea Lua/Luau válido.',
    doneTitle:       '✅ Ofuscación completada',
    fieldFile:       '📄 Archivo',
    fieldLevel:      'Nivel',
    fieldTime:       '⏱️ Tiempo',
    fieldOrigSize:   '📦 Tamaño original',
    fieldObfSize:    '📦 Tamaño ofuscado',
    fieldIncrease:   '📈 Aumento de tamaño',
    fieldTech:       '🛡️ Técnicas aplicadas',
    footer:          'LuaShield v13 — 4 Formas VM | XOR Penta-Clave | Handlers Polimórficos | VM Anidado | 21+ Capas',
    helpTitle:       '🛡️ LuaShield v13 — Ayuda',
    helpDesc:        'Ofuscador Lua/Luau de nivel profesional para Roblox. 4 Formas VM (Dispatch Table, Lista Enlazada, String Tokenizado, Stack VM), Handlers Polimórficos, XOR Penta-Clave (5 claves), VM Anidado, Triple-Nest (ultra), Cifrado de Strings 9-Patrones, 120 Patrones Junk, 36 Predicados Opacos, CFF, L8 Inyección Dead Code Path, Anti-Debug v13, y 21+ capas de protección.',
    helpUsage:       '`/obfuscate` — Adjunta un archivo `.lua` y elige el nivel de protección.\n`/status` — Muestra versión del motor y estadísticas.',
    helpLight:       '• Eliminación de comentarios\n• Renombrado de identificadores\n• Cifrado de strings 9-patrones polimórficos (sin función nombrada)',
    helpMedium:      '• Light +\n• Ofuscación de números con `bit32` multi-paso (30 patrones)\n• Rotación de Array de Strings (lookup XOR indexado)\n• Inyección de junk code (120 patrones v13, APIs Roblox específicas)\n• Wrapper anti-hook + análisis profundidad pcall',
    helpHeavy:       '• Medium +\n• **VM Multi-Forma v13** (4 formas: Dispatch Table, Lista Enlazada, String Tokenizado, Stack VM)\n• Handlers de Opcode Polimórficos (múltiples implementaciones equivalentes por ejecución)\n• Cifrado XOR rotativo en campos de bytecode\n• **XOR Penta-Clave** en constantes (5 claves independientes giratorias)\n• Inyección de Bytecode Muerto (instrucciones VM inalcanzables con JMP)\n• Verificación de integridad auto-hash (multi-punto en runtime)\n• Interleaving del Pool de Constantes (constantes falsas mezcladas)\n• Aplanamiento de Flujo de Control (dispatcher máquina de estados)\n• **L8 Inyección de Dead Code Paths** (10 ramas matemáticamente imposibles)\n• Huella Digital de Entorno (detección contexto Roblox: game, workspace, Instance, script)\n• Codificación opaca del payload (XOR con alfabeto personalizado)\n• 20-35 entradas falsas en dispatch table\n• 36 opcodes barajados (incluyendo NOP)\n• `goto`/etiquetas, `pairs`/`ipairs`, `repeat..until`, varargs, upvalues profundos, multi-retornos\n• Globales rotos en runtime (`_ENV` concat)\n• 36 predicados opacos v13 (multi-inyección)',
    helpDebug:       '• Build de diagnóstico solo con VM\n• Imprime `[VM-DBG] pc/op/a/b/c` en la consola F9 de Roblox\n• Úsalo solo para encontrar problemas runtime/registros, no como release final',
    helpMax:         '• Igual que Heavy +\n• **VM Anidado** (doble compilación: protección muñeca rusa, mapas de opcode independientes)\n• Anti-debug v13 (fingerprint bit32, lib `debug`, detección `string.dump`, tipo env, trampa metatabla, estado coroutine, análisis pcall, trampa upvalue, identidad closure, honeypots, profundidad stack)\n• Marca de agua criptográfica multi-punto (XOR-codificada)\n• Firma de bytecode única por ejecución',
    helpUltra:       '• Igual que Max +\n• **Triple VM Anidado** (muñeca rusa × 3, tres mapas de opcode independientes)\n• Máxima entropía en bytecode\n• Nivel más fuerte — el más difícil de revertir ingeniería',
    helpFooter:      'LuaShield v13 — Supera a Luraph, IronBrew v3, Moonsec | 4 Formas VM | XOR Penta-Clave | VM Anidado',
    changeLang:      'Change language / Cambiar idioma',
    rateLimit:       (s) => `Estas enviando solicitudes muy rapido! Por favor espera **${s} segundos** antes de intentar de nuevo.`,
  },
};

function t(userId, key, ...args) {
  const lang = userLang.get(userId) ?? 'en';
  const val = I18N[lang][key];
  return typeof val === 'function' ? val(...args) : val;
}

// ─── Slash command definitions ─────────────────────────────────

const COMMANDS = [
  {
    name: 'obfuscate',
    description: 'Obfuscate a Roblox Lua/Luau script',
    options: [
      {
        name: 'level',
        description: 'Protection level',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: '🟢 Light — Fast, basic protection', value: 'light' },
          { name: '🟡 Medium — Balanced (default)', value: 'medium' },
          { name: '🟠 Heavy — Multi-Shape VM + full protection', value: 'heavy' },
          { name: '🔵 Debug — VM trace for Roblox F9 console', value: 'debug' },
          { name: '🔴 Max — VM Nesting + Anti-Debug v13', value: 'max' },
          { name: '⚫ Ultra — Triple VM Nesting, absolute max', value: 'ultra' },
        ],
      },
      {
        name: 'file',
        description: 'The .lua or .luau file to obfuscate',
        type: ApplicationCommandOptionType.Attachment,
        required: false,
      },
      {
        name: 'code',
        description: 'Paste Lua code directly (alternative to file)',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: 'help',
    description: 'Show LuaShield help and usage information',
  },
  {
    name: 'language',
    description: 'Change bot language / Cambiar idioma del bot',
  },
  {
    name: 'status',
    description: 'Show engine version, uptime, and total obfuscations',
  },
];

// ─── Client ───────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Helpers ──────────────────────────────────────────────────

function bytesToKB(bytes) { return (bytes / 1024).toFixed(2); }
function levelEmoji(level) {
  return { light: '🟢', medium: '🟡', heavy: '🟠', max: '🔴', ultra: '⚫' }[level] ?? '⚪';
}

function buildLangPicker(userId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lang_en')
      .setLabel('🇺🇸 English')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('lang_es')
      .setLabel('🇪🇸 Español')
      .setStyle(ButtonStyle.Secondary),
  );
  const embed = new EmbedBuilder()
    .setTitle('🛡️ LuaShield v13')
    .setColor(Colors.Blurple)
    .setDescription(
      '**Welcome! / ¡Bienvenido!**\n\n' +
      'Please choose your language to get started.\n' +
      'Por favor elige tu idioma para comenzar.',
    )
    .setFooter({ text: 'LuaShield v13 — Roblox Script Obfuscator' });
  return { embeds: [embed], components: [row], ephemeral: true };
}

function buildSuccessEmbed(userId, stats, level, filename) {
  const ratio = parseFloat(stats.sizeRatio);
  const increase = ((ratio - 1) * 100).toFixed(1);

  let techList = stats.techniquesApplied.map(x => `• ${x}`).join('\n') || '—';

  const fields = [
    { name: t(userId, 'fieldFile'),     value: filename,                                inline: true },
    { name: `${levelEmoji(level)} ${t(userId, 'fieldLevel')}`, value: level.toUpperCase(), inline: true },
    { name: t(userId, 'fieldTime'),     value: `${stats.processingTimeMs}ms`,           inline: true },
    { name: t(userId, 'fieldOrigSize'), value: `${bytesToKB(stats.originalSize)} KB`,   inline: true },
    { name: t(userId, 'fieldObfSize'),  value: `${bytesToKB(stats.obfuscatedSize)} KB`, inline: true },
    { name: t(userId, 'fieldIncrease'), value: `+${increase}%`,                         inline: true },
  ];

  if (techList.length <= 1024) {
    fields.push({ name: t(userId, 'fieldTech'), value: techList, inline: false });
  } else {
    const techItems = stats.techniquesApplied;
    let chunk = [];
    let chunkLen = 0;
    let partNum = 1;
    for (let i = 0; i < techItems.length; i++) {
      const line = `• ${techItems[i]}`;
      if (chunkLen + line.length + 1 > 1020 && chunk.length > 0) {
        fields.push({ name: `${t(userId, 'fieldTech')} (${partNum})`, value: chunk.join('\n'), inline: false });
        partNum++;
        chunk = [];
        chunkLen = 0;
      }
      chunk.push(line);
      chunkLen += line.length + 1;
    }
    if (chunk.length > 0) {
      fields.push({ name: `${t(userId, 'fieldTech')} (${partNum})`, value: chunk.join('\n'), inline: false });
    }
  }

  if (stats.vmShape && stats.vmShape !== 'N/A') {
    fields.push({ name: '🧠 VM Shape', value: stats.vmShape, inline: true });
  }

  return new EmbedBuilder()
    .setTitle(t(userId, 'doneTitle'))
    .setColor(Colors.Green)
    .addFields(...fields)
    .setFooter({ text: t(userId, 'footer') })
    .setTimestamp();
}

function buildHelpEmbed(userId) {
  const s = I18N[userLang.get(userId) ?? 'en'];
  return new EmbedBuilder()
    .setTitle(s.helpTitle)
    .setColor(Colors.Blurple)
    .setDescription(s.helpDesc)
    .addFields(
      { name: '📌 Usage / Uso', value: s.helpUsage, inline: false },
      { name: '🟢 `light`',     value: s.helpLight,  inline: false },
      { name: '🟡 `medium` *(default)*', value: s.helpMedium, inline: false },
      { name: '🟠 `heavy`',     value: s.helpHeavy,  inline: false },
      { name: '🔵 `debug`',     value: s.helpDebug,  inline: false },
      { name: '🔴 `max`',       value: s.helpMax,    inline: false },
      { name: '⚫ `ultra`',     value: s.helpUltra,  inline: false },
    )
    .setFooter({ text: s.helpFooter });
}

function buildErrorEmbed(userId, title, description) {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setColor(Colors.Red)
    .setDescription(description)
    .setTimestamp();
}

// ─── Obfuscation handler ──────────────────────────────────────

async function handleObfuscate(interaction, level, sourceCode, filename) {
  const userId = interaction.user.id;
  let result;
  try {
    result = obfuscate(sourceCode, PRESETS[level]);
  } catch (err) {
    console.error('[Obfuscator Error]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(
        userId,
        t(userId, 'obfErr'),
        `\`\`\`${err.message}\`\`\`\n${t(userId, 'obfErrHint')}`,
      )],
    });
    return;
  }

  botStats.totalObfuscations++;
  botStats.totalBytesProcessed += sourceCode.length;
  saveStats();

  const outputBuf = Buffer.from(result.code, 'utf8');
  const MAX_DISCORD_FILE = 8 * 1024 * 1024;
  if (outputBuf.length > MAX_DISCORD_FILE) {
    const lang = getLang(userId) || 'en';
    const warnMsg = lang === 'es'
      ? `⚠️ El script obfuscado (${(outputBuf.length/1024/1024).toFixed(1)}MB) excede el límite de Discord (8MB). Usa el nivel \`max\` en lugar de \`ultra\` para scripts grandes.`
      : `⚠️ The obfuscated script (${(outputBuf.length/1024/1024).toFixed(1)}MB) exceeds Discord's 8MB file limit. Use \`max\` instead of \`ultra\` for large scripts.`;
    await interaction.editReply({
      embeds: [buildErrorEmbed(userId, 'Output Too Large', warnMsg)],
    });
    return;
  }

  const outFilename = filename.replace(/\.lua(u)?$/i, '') + '_obfuscated.lua';
  const attachment = new AttachmentBuilder(outputBuf, { name: outFilename });

  await interaction.editReply({
    embeds: [buildSuccessEmbed(userId, result.stats, level, filename)],
    files: [attachment],
  });
}

// ─── Interaction handler: slash commands ──────────────────────

async function handleSlashCommand(interaction) {
  const userId = interaction.user.id;
  const lang = getLang(userId);

  // Language picker on first use (except /language itself)
  if (!lang && interaction.commandName !== 'language') {
    await interaction.reply(buildLangPicker(userId));
    return;
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({ embeds: [buildHelpEmbed(userId)], ephemeral: false });
    return;
  }

  if (interaction.commandName === 'language') {
    await interaction.reply(buildLangPicker(userId));
    return;
  }

  if (interaction.commandName === 'status') {
    const uptime = Math.floor((Date.now() - botStats.startTime) / 1000);
    const hrs = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = uptime % 60;
    const uptimeStr = `${hrs}h ${mins}m ${secs}s`;
    const langKey = getLang(userId) || 'en';
    const embed = new EmbedBuilder()
      .setTitle('🛡️ LuaShield v13 — Status')
      .setColor(Colors.Blue)
      .addFields(
        { name: '🔧 Engine Version', value: 'v13 (4-Shape VM + Polymorphic Handlers + Penta-Key XOR + VM Nesting + Ultra Triple-Nest)', inline: true },
        { name: '⏱️ Uptime', value: uptimeStr, inline: true },
        { name: '📊 Total Obfuscations', value: String(botStats.totalObfuscations), inline: true },
        { name: '📦 Total Bytes Processed', value: `${(botStats.totalBytesProcessed / 1024).toFixed(1)} KB`, inline: true },
        { name: '🧠 VM Shapes', value: 'Dispatch Table · Linked-List · Tokenized String · Stack VM', inline: false },
        { name: '🔒 Protection Layers', value: '21+ (Penta-Key XOR, Rolling XOR, Self-Hash, CFF, L7 CFF, L8 Dead Code, 9-Pattern String Enc, 120 Junk, 36 Predicates, Poly Handlers, Anti-Debug v13, Triple VM Nesting)', inline: false },
      )
      .setFooter({ text: I18N[langKey].footer })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (interaction.commandName === 'obfuscate') {
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      await interaction.reply({
        embeds: [buildErrorEmbed(userId, 'Rate Limit', t(userId, 'rateLimit', rateCheck.waitSeconds))],
        ephemeral: true,
      });
      return;
    }

    const level    = interaction.options.getString('level') ?? 'medium';
    const fileOpt  = interaction.options.getAttachment('file');
    const codeOpt  = interaction.options.getString('code');

    await interaction.deferReply();

    // ── File attachment ───────────────────────────────────────
    if (fileOpt) {
      if (!fileOpt.name.match(/\.(lua|luau)$/i)) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(userId, t(userId, 'badFile'), t(userId, 'badFile'))],
        });
        return;
      }
      if (fileOpt.size > MAX_FILE_SIZE) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(userId, t(userId, 'tooBig', bytesToKB(MAX_FILE_SIZE)), '')],
        });
        return;
      }
      let sourceCode;
      try {
        const res = await fetch(fileOpt.url);
        sourceCode = await res.text();
      } catch {
        await interaction.editReply({
          embeds: [buildErrorEmbed(userId, t(userId, 'downloadErr'), '')],
        });
        return;
      }
      await handleObfuscate(interaction, level, sourceCode, fileOpt.name);
      return;
    }

    // ── Inline code ───────────────────────────────────────────
    if (codeOpt) {
      // Strip markdown code blocks if pasted
      const stripped = codeOpt.replace(/^```(?:lua|luau)?\s*/i, '').replace(/```\s*$/i, '').trim();
      await handleObfuscate(interaction, level, stripped, 'script.lua');
      return;
    }

    // ── No code provided ──────────────────────────────────────
    await interaction.editReply({
      embeds: [buildErrorEmbed(userId, t(userId, 'noCode'), t(userId, 'noCode'))],
    });
  }
}

// ─── Interaction handler: buttons ─────────────────────────────

async function handleButton(interaction) {
  const userId = interaction.user.id;

  if (interaction.customId === 'lang_en' || interaction.customId === 'lang_es') {
    const lang = interaction.customId === 'lang_en' ? 'en' : 'es';
    setLang(userId, lang);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('🛡️ LuaShield v13')
          .setColor(Colors.Green)
          .setDescription(I18N[lang].langSet)
          .setFooter({ text: I18N[lang].footer }),
      ],
      components: [],
    });
  }
}

// ─── Events ───────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (err) {
    console.error('[Interaction Error]', err);
    const reply = { content: '⚠️ An unexpected error occurred.', ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch { /* ignore */ }
  }
});

client.once('ready', async () => {
  console.log(`[LuaShield v13] Logged in as ${client.user.tag}`);
  console.log(`[LuaShield v13] Registering slash commands globally...`);

  const rest = new REST().setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: COMMANDS },
    );
    console.log(`[LuaShield v13] ✅ Slash commands registered (global)`);
  } catch (err) {
    console.error('[LuaShield v13] ❌ Failed to register slash commands:', err.message);
  }

  client.user.setActivity('/obfuscate | LuaShield v13 | 4 VM Shapes', { type: 3 });
  console.log(`[LuaShield v13] Ready! VM Engine: Multi-Shape (3 shapes) | CFF | 21+ Layers | DM Support`);
});

client.on('error', (err) => {
  console.error('[Discord Error]', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

// ─── Login ────────────────────────────────────────────────────

client.login(TOKEN);
