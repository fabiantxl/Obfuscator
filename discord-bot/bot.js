'use strict';

// ============================================================
//  LuaShield Discord Bot v6
//  - Slash commands: /obfuscate, /help, /language
//  - DM support
//  - English / Spanish language selector on first use
//  - Obfuscator v6 (Dispatch Table VM, Dual-Key XOR, 9 layers)
// ============================================================

require('dotenv').config();

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

if (!TOKEN) {
  console.error('[ERROR] Missing DISCORD_BOT_TOKEN in .env');
  process.exit(1);
}

// ─── Language store ───────────────────────────────────────────
// key: userId → 'en' | 'es'
const userLang = new Map();

function getLang(userId) { return userLang.get(userId) ?? null; }
function setLang(userId, lang) { userLang.set(userId, lang); }

// ─── i18n strings ─────────────────────────────────────────────

const I18N = {
  en: {
    langPicker:      'Please choose your language to get started:',
    langSet:         '🇺🇸 Language set to **English**! You can now use `/obfuscate` to protect your scripts.',
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
    footer:          'LuaShield v6 — Dispatch Table VM | Dual-Key XOR | 9 Protection Layers',
    helpTitle:       '🛡️ LuaShield v6 — Help',
    helpDesc:        'Top-tier Lua/Luau obfuscator for Roblox. VM Bytecode Engine with Dispatch Table, Dual-Key encryption, and 9 protection layers.',
    helpUsage:       '`/obfuscate` — Attach a `.lua` file and select a protection level.',
    helpLight:       '• Identifier renaming\n• Dual-XOR string encryption (no decryptor function)',
    helpMedium:      '• Light +\n• Multi-step `bit32` number obfuscation\n• 20-pattern junk code injection\n• Anti-hook wrapper',
    helpHeavy:       '• Medium +\n• **Dispatch Table VM** (unique shuffled opcodes per run)\n• Dual-Key XOR constant encryption\n• `pairs`/`ipairs`, `repeat..until`, varargs, upvalues, multiple returns\n• Global name splitting (`_ENV` concat lookup)\n• Opaque predicates',
    helpMax:         '• Same as Heavy +\n• Anti-debug v6 (executor detection, `debug` lib check, env hash)\n• Unique bytecode signature per run',
    helpFooter:      'LuaShield v6 — Beats IronBrew v3 | Luraph parity | 9 layers',
    changeLang:      'Change language / Cambiar idioma',
  },
  es: {
    langPicker:      'Por favor elige tu idioma para comenzar:',
    langSet:         '🇪🇸 Idioma establecido a **Español**! Ahora puedes usar `/obfuscate` para proteger tus scripts.',
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
    footer:          'LuaShield v6 — VM Dispatch Table | XOR Dual-Clave | 9 Capas de Protección',
    helpTitle:       '🛡️ LuaShield v6 — Ayuda',
    helpDesc:        'Ofuscador Lua/Luau de nivel profesional para Roblox. Motor VM con Dispatch Table, cifrado dual-clave y 9 capas de protección.',
    helpUsage:       '`/obfuscate` — Adjunta un archivo `.lua` y elige el nivel de protección.',
    helpLight:       '• Renombrado de identificadores\n• Cifrado XOR doble de strings (sin función nombrada)',
    helpMedium:      '• Light +\n• Ofuscación de números con `bit32` multi-paso\n• Inyección de junk code (20 patrones)\n• Wrapper anti-hook',
    helpHeavy:       '• Medium +\n• **VM con Dispatch Table** (opcodes únicos por ejecución)\n• Cifrado dual-clave XOR en constantes\n• `pairs`/`ipairs`, `repeat..until`, varargs, upvalues, multi-retornos\n• Globales rotos en runtime (`_ENV` concat)\n• Predicados opacos',
    helpMax:         '• Igual que Heavy +\n• Anti-debug v6 (detección de executors, lib `debug`, hash de entorno)\n• Firma de bytecode única por ejecución',
    helpFooter:      'LuaShield v6 — Supera IronBrew v3 | Paridad con Luraph | 9 capas',
    changeLang:      'Change language / Cambiar idioma',
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
          { name: '🟠 Heavy — VM bytecode + full protection', value: 'heavy' },
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
    .setTitle('🛡️ LuaShield v6')
    .setColor(Colors.Blurple)
    .setDescription(
      '**Welcome! / ¡Bienvenido!**\n\n' +
      'Please choose your language to get started.\n' +
      'Por favor elige tu idioma para comenzar.',
    )
    .setFooter({ text: 'LuaShield v6 — Roblox Script Obfuscator' });
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

  if (interaction.commandName === 'obfuscate') {
    const level    = interaction.options.getString('level') ?? 'medium';
    const fileOpt  = interaction.options.getAttachment('file');
    const codeOpt  = interaction.options.getString('code');

    // Defer so we have time to process
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
          .setTitle('🛡️ LuaShield v6')
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
  console.log(`[LuaShield v6] Logged in as ${client.user.tag}`);
  console.log(`[LuaShield v6] Registering slash commands globally...`);

  // Register slash commands globally
  const rest = new REST().setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: COMMANDS },
    );
    console.log(`[LuaShield v6] ✅ Slash commands registered (global)`);
  } catch (err) {
    console.error('[LuaShield v6] ❌ Failed to register slash commands:', err.message);
  }

  client.user.setActivity('/obfuscate | LuaShield v6', { type: 3 }); // WATCHING
  console.log(`[LuaShield v6] Ready! VM Engine: Dispatch Table | 9 Layers | DM Support`);
});

client.on('error', (err) => {
  console.error('[Discord Error]', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

// ─── Login ────────────────────────────────────────────────────

client.login(TOKEN);
