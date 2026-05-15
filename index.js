/**
 * ==============================================================================
 * VOID_CORE v9.1.0 "PROXIMA_RELOADED"
 * ==============================================================================
 * Developer: Morivis // Void Team
 * Architecture: Event-Driven Terminal & Modular UI
 * ==============================================================================
 */

require('dotenv').config();
const { Bot, InlineKeyboard, Keyboard, session } = require("grammy");
const os = require('os');

// --- [ 1. CONFIG & DATA ] ---
const config = {
    token: process.env.BOT_TOKEN,
    adminId: Number(process.env.ADMIN_ID),
    urls: {
        web: "https://xarol9.github.io/spotinks-web/index.html",
        github: "https://github.com/Morivis",
        tiktok: "https://www.tiktok.com/@.morivis.hub",
        youtube: "https://youtube.com/@morivis1"
    }
};

const LORE = {
    os: "VOID_CORE v9.1.0",
    node: "DESNA_STATION_01",
    projects: [
        { name: "SoulKeep", type: "Java/MC", desc: "Advanced inventory protocol for 1.21.11." },
        { name: "Spotinks", type: "Web/UI", desc: "Singularity design hub & Bento Grid." },
        { name: "Bunker Life", type: "RPG/Horror", desc: "Survival ecosystem in Sector 4." }
    ],
    bunker: {
        entrance: "<b>Вхід до Бункера</b>\n\nМасивні гермодвері Сектора 4. Датчики фіксують активність ядра.",
        artifacts: "🔹 <b>Data-Chip</b>: Логи ядра.\n🔹 <b>Zen-Cell</b>: Енергія станції."
    }
};

if (!config.token) throw new Error("CRITICAL: BOT_TOKEN is missing!");
const bot = new Bot(config.token);

// Використовуємо сесії для відстеження станів (наприклад, чи в терміналі юзер)
bot.use(session({ initial: () => ({ inTerminal: false }) }));

// --- [ 2. UI ENGINE ] ---
const UI = {
    main: (id) => {
        const kb = new Keyboard().webApp("⚡ TERMINAL HUB", config.urls.web).row();
        if (id === config.adminId) {
            kb.text("📟 CONSOLE").text("📊 METRICS").row();
        }
        kb.text("📂 PROJECTS").text("📡 NETWORK").row().text("🎮 BUNKER");
        return kb.resized();
    },
    bunker: new InlineKeyboard()
        .text("🔍 ARTIFACTS", "bk_arts")
        .text("❌ EXIT", "bk_exit"),
    back: new InlineKeyboard().text("⬅️ BACK_TO_MENU", "cmd_start")
};

// --- [ 3. CORE LOGIC ] ---

const getMetrics = () => ({
    uptime: `${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s`,
    ram: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    load: `${os.loadavg()[0].toFixed(2)}%`
});

// Command: /start
bot.command("start", async (ctx) => {
    ctx.session.inTerminal = false;
    const isRoot = ctx.from.id === config.adminId;
    await ctx.reply(isRoot ? `<b>[ VOID_ROOT ]</b>\nSystem online. Node: <code>${LORE.node}</code>` : `<b>[ VOID_GUEST ]</b>\nAccess granted.`, {
        parse_mode: "HTML",
        reply_markup: UI.main(ctx.from.id)
    });
});

// Module: Projects
bot.hears("📂 PROJECTS", async (ctx) => {
    const list = LORE.projects.map(p => `• <b>${p.name}</b>: ${p.desc}`).join("\n\n");
    await ctx.reply(`<b>[ ARCHIVE ]</b>\n\n${list}`, { parse_mode: "HTML", reply_markup: UI.back });
});

// Module: Network
bot.hears("📡 NETWORK", async (ctx) => {
    const kb = new InlineKeyboard().url("TikTok", config.urls.tiktok).url("YouTube", config.urls.youtube);
    await ctx.reply("<b>[ BROADCAST_NODES ]</b>", { parse_mode: "HTML", reply_markup: kb });
});

// Module: Metrics (Root Only)
bot.hears("📊 METRICS", async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    const m = getMetrics();
    await ctx.reply(`<b>[ DIAGNOSTICS ]</b>\n\nUptime: <code>${m.uptime}</code>\nRAM: <code>${m.ram}</code>\nLoad: <code>${m.load}</code>`, { parse_mode: "HTML" });
});

// Module: Bunker
bot.hears("🎮 BUNKER", async (ctx) => {
    await ctx.reply(LORE.bunker.entrance, { parse_mode: "HTML", reply_markup: UI.bunker });
});

// --- [ 4. TERMINAL EMULATOR (THE BASH) ---

bot.hears("📟 CONSOLE", async (ctx) => {
    if (ctx.from.id !== config.adminId) return;
    ctx.session.inTerminal = true;
    await ctx.reply("<code>[ VOID_BASH ACTIVE ]\nType 'exit' to return.</code>", { 
        parse_mode: "HTML", 
        reply_markup: { remove_keyboard: true } 
    });
});

bot.on("message:text", async (ctx, next) => {
    if (!ctx.session.inTerminal) return next();
    
    const cmd = ctx.message.text.toLowerCase().trim();
    let response = "";

    if (cmd === "exit") {
        ctx.session.inTerminal = false;
        return ctx.reply("Exiting terminal...", { reply_markup: UI.main(ctx.from.id) });
    } else if (cmd === "ls") {
        response = "📄 index.js\n📄 .env\n📁 node_modules";
    } else if (cmd === "neofetch") {
        const m = getMetrics();
        response = `<b>morivis@void-os</b>\n---\nOS: ${LORE.os}\nRAM: ${m.ram}\nUP: ${m.uptime}`;
    } else if (cmd === "whoami") {
        response = `ROOT_USER: Morivis\nSTATION: ${LORE.node}`;
    } else {
        response = `bash: ${cmd}: command not found`;
    }

    await ctx.reply(`<code>${response}</code>`, { parse_mode: "HTML" });
});

// --- [ 5. CALLBACK HANDLING ] ---
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === "bk_arts") {
        await ctx.editMessageText(`<b>[ ARTIFACTS ]</b>\n\n${LORE.bunker.artifacts}`, { parse_mode: "HTML", reply_markup: UI.back });
    } else if (data === "bk_exit") {
        await ctx.deleteMessage();
    } else if (data === "cmd_start") {
        await ctx.reply("Main node active.", { reply_markup: UI.main(ctx.from.id) });
    }
    await ctx.answerCallbackQuery();
});

// --- [ 6. ERROR HANDLING & BOOT ] ---
bot.catch((err) => console.error(`[SYSTEM_ERROR]: ${err.message}`));

console.clear();
console.log(`\x1b[36m[ ${LORE.os} ]\x1b[0m ONLINE // Node: ${LORE.node}`);
bot.start();