/**
 * ==============================================================================
 * VOID_OS THE MONOLITH PROTOCOL v8.1.0 "PROXIMA"
 * ==============================================================================
 * Target Environment: Node.js v26.1.0+ | Arch Linux (Zen Kernel)
 * Developer: Morivis // Void Team
 * Description: Ultimate OS with Dynamic JSON Lore, VFS, and RPG Engine.
 * ==============================================================================
 */

require('dotenv').config();
const { Bot, InlineKeyboard, Keyboard } = require("grammy");
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// --- [ 1. CORE CONFIGURATION ] ---
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN) {
    console.error("\x1b[31m%s\x1b[0m", "[ CRITICAL_FAILURE ]: BOT_TOKEN is missing.");
    process.exit(1);
}

const bot = new Bot(TOKEN);

const URLS = {
    web_app: "https://xarol9.github.io/spotinks-web/index.html",
    github: "https://github.com/Morivis",
    tiktok: "https://www.tiktok.com/@.morivis.hub",
    youtube: "https://youtube.com/@morivis1"
};

// --- [ 2. DATA LOADER ] ---
const getLore = () => {
    try {
        const raw = fs.readFileSync('./database.json', 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { system_info: { os_core: "FAILED", kernel: "ERROR" }, bunker_lore: { locations: { entrance: { name: "Error", description: "Database not found." } } } };
    }
};

// --- [ 3. STATE & METRICS ] ---
const STATE = {
    users: new Map(),
    terminalSessions: new Map(),
    bunkerGames: new Map(),
    metrics: {
        bootTime: Date.now(),
        messagesHandled: 0,
        errorsCaught: 0
    }
};

// --- [ 4. UTILS ] ---
const getMemoryUsage = () => (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- [ 5. UI GENERATORS ] ---
const getMainMenu = (isRoot) => {
    const kb = new Keyboard();
    if (isRoot) {
        kb.webApp("⚡ SPOTINKS HUB", URLS.web_app).row()
          .text("💻 TERMINAL").text("📊 METRICS").row()
          .text("📂 LORE DB").text("🎮 BUNKER V2").row()
          .text("⚙️ SYS ADMIN");
    } else {
        kb.webApp("🌐 ВІДКРИТИ SPOTINKS", URLS.web_app).row()
          .text("📂 ПРОЕКТИ").text("📡 МЕРЕЖА").row()
          .text("🎮 BUNKER LIFE");
    }
    return kb.resized();
};

const getBunkerMenu = () => {
    return new InlineKeyboard()
        .text("🔍 Оглянути артефакти", "bk_artifacts")
        .row()
        .text("❌ Вийти з системи", "bk_exit");
};

// --- [ 6. MIDDLEWARE ] ---
bot.use(async (ctx, next) => {
    STATE.metrics.messagesHandled++;
    if (ctx.from) {
        const isRoot = String(ctx.from.id) === String(ADMIN_ID);
        if (!STATE.users.has(ctx.from.id)) {
            STATE.users.set(ctx.from.id, { id: ctx.from.id, role: isRoot ? "ROOT_ADMIN" : "GUEST" });
        }
    }
    await next();
});

// --- [ 7. COMMANDS ] ---
bot.command("start", async (ctx) => {
    const isRoot = String(ctx.from.id) === String(ADMIN_ID);
    const lore = getLore();
    
    const boot = await ctx.reply(`<code>[ BOOTING ${lore.system_info.os_core} ]...</code>`, { parse_mode: "HTML" });
    await sleep(600);
    await ctx.api.editMessageText(ctx.chat.id, boot.message_id, "<code>[ KERNEL ]: Loading Zen-Kernel modules...</code>", { parse_mode: "HTML" });
    await sleep(400);
    await ctx.api.deleteMessage(ctx.chat.id, boot.message_id);

    const welcome = isRoot 
        ? `<b>[ VOID_OS ROOT ]</b>\nСистема готова до роботи, Morivis.\nВузол: <code>${lore.system_info.node_id}</code>`
        : `<b>[ SPOTINKS ]</b>\nВітаю у мережі Void Team.\nДоступ дозволено. Оберіть модуль.`;

    await ctx.reply(welcome, { parse_mode: "HTML", reply_markup: getMainMenu(isRoot) });
});

// --- [ 8. GUEST MODULES ] ---
bot.hears("📂 ПРОЕКТИ", async (ctx) => {
    const lore = getLore();
    const p = lore.projects_archive;
    await ctx.reply(
        `<b>[ PROJECT ARCHIVE ]</b>\n\n` +
        `📦 <b>SoulKeep:</b> ${p.soulkeep.summary}\n` +
        `🌐 <b>Spotinks:</b> ${p.spotinks_web.summary}\n` +
        `💀 <b>Bunker Life:</b> ${p.bunker_life.summary}`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().url("GitHub Source", URLS.github) }
    );
});

bot.hears("📡 МЕРЕЖА", async (ctx) => {
    await ctx.reply("<b>[ VOID_NETWORK ]</b>\nНаші канали зв'язку:", {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url("TikTok", URLS.tiktok).url("YouTube", URLS.youtube)
    });
});

// --- [ 9. ROOT MODULES ] ---
bot.hears("📊 METRICS", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const lore = getLore();
    await ctx.reply(
        `<b>[ DIAGNOSTICS ]</b>\n\n` +
        `🖥️ <b>CPU:</b> <code>${os.cpus()[0].model}</code>\n` +
        `🧠 <b>RAM:</b> <code>${getMemoryUsage()} MB</code>\n` +
        `⏱️ <b>Uptime:</b> <code>${Math.floor(os.uptime()/3600)}h</code>\n` +
        `🛡️ <b>Security:</b> <code>${lore.system_info.security_level}</code>`,
        { parse_mode: "HTML" }
    );
});

bot.hears("📂 LORE DB", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const lore = getLore();
    let logs = lore.bunker_life_ultra.deep_lore_logs.slice(-3).map(l => `[${l.source}]: ${l.message}`).join("\n\n");
    await ctx.reply(`<b>[ LATEST LOGS ]</b>\n\n${logs}`, { parse_mode: "HTML" });
});

// --- [ 10. BUNKER ENGINE ] ---
bot.hears(/🎮 BUNKER/, async (ctx) => {
    const lore = getLore();
    const loc = lore.bunker_lore.locations.entrance;
    await ctx.reply(
        `<b>${loc.name}</b>\n\n${loc.description}\n\n<i>${loc.details}</i>`,
        { parse_mode: "HTML", reply_markup: getBunkerMenu() }
    );
});

// --- [ 11. TERMINAL EMULATOR (THE CORE) ] ---
bot.hears("💻 TERMINAL", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    STATE.terminalSessions.set(ctx.from.id, true);
    await ctx.reply("<code>[ TERMINAL ACTIVE ]: type 'exit' to close.</code>", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
});

bot.on("message:text", async (ctx) => {
    if (!STATE.terminalSessions.has(ctx.from.id)) return;
    
    const input = ctx.message.text.trim().toLowerCase();
    const lore = getLore();
    let res = "";

    if (input === "neofetch") {
        res = `<b>${ctx.from.username}@void-os</b>\n----------\n<b>OS:</b> ${lore.system_info.os_core}\n<b>Kernel:</b> ${lore.system_info.kernel}\n<b>Memory:</b> ${getMemoryUsage()}MB\n<b>Shell:</b> VoidBash`;
    } else if (input === "ls") {
        res = "📄 database.json\n📄 index.js\n📁 node_modules/\n📄 package.json";
    } else if (input === "exit") {
        STATE.terminalSessions.delete(ctx.from.id);
        await ctx.reply("Session closed.", { reply_markup: getMainMenu(true) });
        return;
    } else {
        res = `bash: ${input}: command not found`;
    }
    await ctx.reply(`<code>${res}</code>`, { parse_mode: "HTML" });
});

// --- [ 12. CALLBACKS ] ---
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const lore = getLore();

    if (data === "bk_artifacts") {
        const arts = lore.bunker_lore.artifacts.map(a => `🔹 <b>${a.name}</b>: ${a.lore}`).join("\n\n");
        await ctx.editMessageText(`<b>[ ARTIFACTS ]</b>\n\n${arts}`, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⬅️ Назад", "bk_back") });
    } else if (data === "bk_back") {
        const loc = lore.bunker_lore.locations.entrance;
        await ctx.editMessageText(`<b>${loc.name}</b>\n\n${loc.description}`, { parse_mode: "HTML", reply_markup: getBunkerMenu() });
    } else if (data === "bk_exit") {
        await ctx.deleteMessage();
    }
    await ctx.answerCallbackQuery();
});

// --- [ 13. BOOT ] ---
console.clear();
console.log("\x1b[36m%s\x1b[0m", "[ VOID_OS ONLINE ]");
bot.start();