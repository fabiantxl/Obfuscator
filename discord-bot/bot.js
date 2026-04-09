'use strict';

// ============================================================
//  LuaShield Discord Bot v9
//  - Slash commands: /obfuscate, /help, /language, /status
//  - DM support
//  - English / Spanish language selector on first use
//  - Obfuscator v9 (Multi-Shape VM, Rolling XOR, Self-Hash Verify,
//    CFF, String Array Rotation, Env Fingerprint, 14+ protection layers)
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
    footer:          'LuaShield v9 — Multi-Shape VM | CFF | Rolling XOR | Self-Hash Verify | 14+ Layers',
    helpTitle:       '🛡️ LuaShield v9 — Help',
    helpDesc:        'Top-tier Lua/Luau obfuscator for Roblox. Multi-Shape VM Engine (3 shapes per run), Control Flow Flattening, String Array Rotation, Rolling XOR cipher, Self-Hash verification, Dual-Key encryption, Environment Fingerprinting, and 14+ protection layers.',
    helpUsage:       '`/obfuscate` — Attach a `.lua` file and select a protection level.\n`/status` — Show engine version and stats.',
    helpLight:       '• Identifier renaming\n• Dual-XOR string encryption (no decryptor function)',
    helpMedium:      '• Light +\n• Multi-step `bit32` number obfuscation (20 patterns)\n• String Array Rotation (indexed XOR lookup)\n• 60-pattern junk code injection (v9)\n• Anti-hook wrapper + timing check',
    helpHeavy:       '• Medium +\n• **Multi-Shape VM** (3 shapes: Dispatch Table, Linked-List, Tokenized String)\n• Rolling XOR cipher on bytecode fields\n• Dual-Key XOR constant encryption\n• Self-Hash integrity verification (with runtime check)\n• Control Flow Flattening (state-machine dispatcher)\n• Environment Fingerprinting (Roblox context)\n• Opaque payload encoding (custom-alphabet XOR)\n• 20-35 fake dispatch table entries\n• `goto`/labels, `pairs`/`ipairs`, `repeat..until`, varargs, deep upvalues (2+ levels), multiple returns\n• Coroutine-wrapped execution (anti-hook)\n• Global name splitting (`_ENV` concat lookup)\n• 20 opaque predicates (multi-inject)',
    helpMax:         '• Same as Heavy +\n• Anti-debug v9 (executor detection, `debug` lib check, `string.dump` detection, env hash, timing check, metatable trap)\n• Coroutine guard (invalidates `debug.sethook`)\n• Unique bytecode signature per run',
    helpFooter:      'LuaShield v9 — Surpasses Luraph | 3 VM Shapes | CFF | Rolling XOR | Self-Hash',
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
    footer:          'LuaShield v9 — VM Multi-Forma | CFF | XOR Rotativo | Auto-Hash Verificado | 14+ Capas',
    helpTitle:       '🛡️ LuaShield v9 — Ayuda',
    helpDesc:        'Ofuscador Lua/Luau de nivel profesional para Roblox. Motor VM Multi-Forma (3 formas por ejecución), Aplanamiento de Flujo de Control, Rotación de Array de Strings, cifrado XOR rotativo, verificación de auto-hash, cifrado dual-clave, Huella Digital de Entorno y 14+ capas de protección.',
    helpUsage:       '`/obfuscate` — Adjunta un archivo `.lua` y elige el nivel de protección.\n`/status` — Muestra versión del motor y estadísticas.',
    helpLight:       '• Renombrado de identificadores\n• Cifrado XOR doble de strings (sin función nombrada)',
    helpMedium:      '• Light +\n• Ofuscación de números con `bit32` multi-paso (20 patrones)\n• Rotación de Array de Strings (lookup XOR indexado)\n• Inyección de junk code (60 patrones v9)\n• Wrapper anti-hook + verificación de tiempo',
    helpHeavy:       '• Medium +\n• **VM Multi-Forma** (3 formas: Dispatch Table, Lista Enlazada, String Tokenizado)\n• Cifrado XOR rotativo en campos de bytecode\n• Cifrado dual-clave XOR en constantes\n• Verificación de integridad auto-hash (con chequeo en runtime)\n• Aplanamiento de Flujo de Control (dispatcher máquina de estados)\n• Huella Digital de Entorno (detección contexto Roblox)\n• Codificación opaca del payload (XOR con alfabeto personalizado)\n• 20-35 entradas falsas en dispatch table\n• `goto`/etiquetas, `pairs`/`ipairs`, `repeat..until`, varargs, upvalues profundos (2+ niveles), multi-retornos\n• Ejecución envuelta en coroutine (anti-hook)\n• Globales rotos en runtime (`_ENV` concat)\n• 20 predicados opacos (multi-inyección)',
    helpMax:         '• Igual que Heavy +\n• Anti-debug v9 (detección de executors, lib `debug`, detección `string.dump`, hash de entorno, verificación de tiempo, trampa de metatabla)\n• Guard de coroutine (invalida `debug.sethook`)\n• Firma de bytecode única por ejecución',
    helpFooter:      'LuaShield v9 — Supera a Luraph | 3 Formas VM | CFF | XOR Rotativo | Auto-Hash',
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
          { name: '🔴 Max — Maximum, anti-debug included', value: 'max' },
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
  return { light: '🟢', medium: '🟡', heavy: '🟠', max: '🔴' }[level] ?? '⚪';
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
    .setTitle('🛡️ LuaShield v9')
    .setColor(Colors.Blurple)
    .setDescription(
      '**Welcome! / ¡Bienvenido!**\n\n' +
      'Please choose your language to get started.\n' +
      'Por favor elige tu idioma para comenzar.',
    )
    .setFooter({ text: 'LuaShield v9 — Roblox Script Obfuscator' });
  return { embeds: [embed], components: [row], ephemeral: true };
}

function buildSuccessEmbed(userId, stats, level, filename) {
  const ratio = parseFloat(stats.sizeRatio);
  const increase = ((ratio - 1) * 100).toFixed(1);

  return new EmbedBuilder()
    .setTitle(t(userId, 'doneTitle'))
    .setColor(Colors.Green)
    .addFields(
      { name: t(userId, 'fieldFile'),     value: filename,                                inline: true },
      { name: `${levelEmoji(level)} ${t(userId, 'fieldLevel')}`, value: level.toUpperCase(), inline: true },
      { name: t(userId, 'fieldTime'),     value: `${stats.processingTimeMs}ms`,           inline: true },
      { name: t(userId, 'fieldOrigSize'), value: `${bytesToKB(stats.originalSize)} KB`,   inline: true },
      { name: t(userId, 'fieldObfSize'),  value: `${bytesToKB(stats.obfuscatedSize)} KB`, inline: true },
      { name: t(userId, 'fieldIncrease'), value: `+${increase}%`,                         inline: true },
      {
        name: t(userId, 'fieldTech'),
        value: stats.techniquesApplied.map(x => `• ${x}`).join('\n') || '—',
        inline: false,
      },
      ...(stats.vmShape && stats.vmShape !== 'N/A' ? [{
        name: '🧠 VM Shape',
        value: stats.vmShape,
        inline: true,
      }] : []),
    )
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
      { name: '🔴 `max`',       value: s.helpMax,    inline: false },
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

  const outFilename = filename.replace(/\.lua(u)?$/i, '') + '_obfuscated.lua';
  const attachment = new AttachmentBuilder(
    Buffer.from(result.code, 'utf8'),
    { name: outFilename },
  );

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
      .setTitle('🛡️ LuaShield v9 — Status')
      .setColor(Colors.Blue)
      .addFields(
        { name: '🔧 Engine Version', value: 'v9.0 (Multi-Shape VM + CFF + String Rotation)', inline: true },
        { name: '⏱️ Uptime', value: uptimeStr, inline: true },
        { name: '📊 Total Obfuscations', value: String(botStats.totalObfuscations), inline: true },
        { name: '📦 Total Bytes Processed', value: `${(botStats.totalBytesProcessed / 1024).toFixed(1)} KB`, inline: true },
        { name: '🧠 VM Shapes', value: 'Dispatch Table, Linked-List, Tokenized String', inline: false },
        { name: '🔒 Protection Layers', value: '14+ (Rolling XOR, Self-Hash Verify, CFF, String Rotation, Env Fingerprint, Dual-Key XOR, 60 Junk, 20 Predicates, Anti-Debug v9)', inline: false },
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
          .setTitle('🛡️ LuaShield v9')
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
  console.log(`[LuaShield v9] Logged in as ${client.user.tag}`);
  console.log(`[LuaShield v9] Registering slash commands globally...`);

  const rest = new REST().setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: COMMANDS },
    );
    console.log(`[LuaShield v9] ✅ Slash commands registered (global)`);
  } catch (err) {
    console.error('[LuaShield v9] ❌ Failed to register slash commands:', err.message);
  }

  client.user.setActivity('/obfuscate | LuaShield v9', { type: 3 });
  console.log(`[LuaShield v9] Ready! VM Engine: Multi-Shape (3 shapes) | CFF | 14+ Layers | DM Support`);
});

client.on('error', (err) => {
  console.error('[Discord Error]', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

// ─── Login ────────────────────────────────────────────────────

client.login(TOKEN);
