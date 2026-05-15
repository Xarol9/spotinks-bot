/**
 * ==============================================================================
 * VOID_OS THE MONOLITH PROTOCOL v8.0.0 "LORE-INTEGRATED"
 * ==============================================================================
 * Target Environment: Node.js v26.1.0+ | Arch Linux (Zen Kernel)
 * Core Framework: grammY
 * Developer: Morivis // Void Team
 * Description: Ultimate OS with Dynamic JSON Lore, RPG V2, and VFS.
 * ==============================================================================
 */

require('dotenv').config();
const { Bot, InlineKeyboard, Keyboard } = require("grammy");
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

// ==============================================================================
// [ 1. CORE SYSTEM & DATA LOADER ]
// ==============================================================================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN) {
    console.error("\x1b[31m%s\x1b[0m", "[ CRITICAL_FAILURE ]: BOT_TOKEN is missing. Halt.");
    process.exit(1);
}

// Функція для отримання свіжих даних з JSON
const getLore = () => {
    try {
        const raw = fs.readFileSync('./database.json', 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error("Failed to load database.json. Check syntax!");
        return null;
    }
};

const bot = new Bot(TOKEN);

const URLS = {
    web_app: "https://xarol9.github.io/spotinks-web/index.html",
    github: "https://github.com/Morivis",
    tiktok: "https://www.tiktok.com/@.morivis.hub",
    youtube: "https://youtube.com/@morivis1"
};

// ==============================================================================
// [ 2. ASCII ART & UI ASSETS ]
// ==============================================================================
const ASCII = {
    logo: `
      __      __   _     _    ____   _____ 
      \\ \\    / /  (_)   | |  / __ \\ / ____|
       \\ \\  / /___ _  __| | | |  | | (___  
        \\ \\/ / _ \\ |/ _\` | | |  | |\\___ \\ 
         \\  /  __/ | (_| | | |__| |____) |
          \\/ \\___|_|\\__,_|  \\____/|_____/ 
    `,
    bunker: "<code>[ BUNKER_OS_VISUAL ]</code>",
    server: "[==========]\n[  VOID_OS ]\n[==========]"
};

// ==============================================================================
// [ 3. STATE & METRICS ]
// ==============================================================================
const STATE = {
    users: new Map(),
    terminalSessions: new Map(),
    bunkerGames: new Map(),
    metrics: {
        bootTime: Date.now(),
        messagesHandled: 0,
        commandsExecuted: 0
    }
};

// ==============================================================================
// [ 4. MIDDLEWARE & RBAC ]
// ==============================================================================
bot.use(async (ctx, next) => {
    STATE.metrics.messagesHandled++;
    if (ctx.from) {
        const isRoot = String(ctx.from.id) === String(ADMIN_ID);
        if (!STATE.users.has(ctx.from.id)) {
            STATE.users.set(ctx.from.id, {
                id: ctx.from.id,
                name: ctx.from.first_name,
                role: isRoot ? "ROOT_ADMIN" : "GUEST"
            });
        }
    }
    await next();
});

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

// ==============================================================================
// [ 5. COMMANDS & ROUTING ]
// ==============================================================================
bot.command("start", async (ctx) => {
    const isRoot = String(ctx.from.id) === String(ADMIN_ID);
    const lore = getLore();
    
    await ctx.reply(`<code>[ BOOTING ${lore.system_info.os_core} ]...</code>`, { parse_mode: "HTML" });
    await new Promise(r => setTimeout(r, 500));
    
    const welcomeText = isRoot 
        ? `<b>[ ROOT SESSION ]</b>\nWelcome, Morivis.\nKernel: <code>${lore.system_info.kernel}</code>`
        : `<b>[ VOID_OS INTERFACE ]</b>\nПривіт, ${ctx.from.first_name}.\nМи — Void Team. До канікул залишилося зовсім трохи.`;

    await ctx.reply(welcomeText, { 
        parse_mode: "HTML", 
        reply_markup: getMainMenu(isRoot) 
    });
});

// --- ГІСТЬ: ПРОЕКТИ З БАЗИ ---
bot.hears("📂 ПРОЕКТИ", async (ctx) => {
    const lore = getLore();
    const projects = lore.projects_archive;
    
    let text = `<b>[ АРХІВ ПРОЕКТІВ ]</b>\n\n`;
    text += `📦 <b>SoulKeep:</b> ${projects.soulkeep.summary}\n`;
    text += `🌐 <b>Spotinks:</b> ${projects.spotinks_web.summary}\n`;
    text += `💀 <b>Bunker:</b> ${projects.bunker_life.summary}`;

    await ctx.reply(text, { 
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url("GitHub", URLS.github)
    });
});

// --- АДМІН: ПЕРЕГЛЯД ЛОРУ ТА ЛОГІВ ---
bot.hears("📂 LORE DB", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const lore = getLore();
    
    let logText = `<b>[ SYSTEM DEEP LOGS ]</b>\n\n`;
    lore.bunker_life_ultra.deep_lore_logs.forEach(log => {
        logText += `🕒 <code>${log.timestamp.split('T')[1]}</code>\n[${log.source}]: ${log.message}\n\n`;
    });

    await ctx.reply(logText, { parse_mode: "HTML" });
});

bot.hears("📊 METRICS", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const lore = getLore();
    await ctx.reply(
        `<b>[ STATION: ${lore.system_info.node_id} ]</b>\n` +
        `CPU: <code>${os.cpus()[0].model}</code>\n` +
        `RAM: <code>${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</code>\n` +
        `Security: <code>${lore.system_info.security_level}</code>`,
        { parse_mode: "HTML" }
    );
});

// ==============================================================================
// [ 6. BUNKER ENGINE V2 (DYNAMO) ]
// ==============================================================================
bot.hears(/🎮 BUNKER/, async (ctx) => {
    const lore = getLore();
    STATE.bunkerGames.set(ctx.from.id, { loc: "entrance", inv: [] });
    
    const locData = lore.bunker_lore.locations.entrance;
    await ctx.reply(
        `<b>${locData.name}</b>\n\n${locData.description}\n\n<i>${locData.details}</i>`,
        { 
            parse_mode: "HTML", 
            reply_markup: new InlineKeyboard()
                .text("Оглянути артефакти", "bk_artifacts")
                .row()
                .text("❌ Вихід", "bk_exit")
        }
    );
});

bot.on("callback_query:data", async (ctx) => {
    const lore = getLore();
    const data = ctx.callbackQuery.data;

    if (data === "bk_artifacts") {
        let artText = `<b>[ ЗНАЙДЕНІ АРТЕФАКТИ ]</b>\n\n`;
        lore.bunker_lore.artifacts.forEach(a => {
            artText += `🔹 <b>${a.name}</b>: ${a.lore}\n\n`;
        });
        await ctx.editMessageText(artText, { 
            parse_mode: "HTML", 
            reply_markup: new InlineKeyboard().text("⬅️ Назад", "bk_back") 
        });
    }

    if (data === "bk_back") {
        const locData = lore.bunker_lore.locations.entrance;
        await ctx.editMessageText(
            `<b>${locData.name}</b>\n\n${locData.description}\n\n<i>${locData.details}</i>`,
            { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Оглянути артефакти", "bk_artifacts").row().text("❌ Вихід", "bk_exit") }
        );
    }

    if (data === "bk_exit") {
        await ctx.deleteMessage();
        await ctx.answerCallbackQuery({ text: "Симуляцію завершено." });
    }
    
    await ctx.answerCallbackQuery();
});

// ==============================================================================
// [ 7. TERMINAL & SYSTEM BOOT ]
// ==============================================================================
bot.hears("💻 TERMINAL", async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    STATE.terminalSessions.set(ctx.from.id, { active: true });
    await ctx.reply("<code>[ TERMINAL_READY ]: root@void_os:~#</code>", { parse_mode: "HTML" });
});

bot.on("message:text", async (ctx) => {
    if (STATE.terminalSessions.has(ctx.from.id)) {
        if (ctx.message.text.toLowerCase() === "exit") {
            STATE.terminalSessions.delete(ctx.from.id);
            await ctx.reply("Logout.", { reply_markup: getMainMenu(true) });
            return;
        }
        await ctx.reply(`<code>bash: ${ctx.message.text}: command not found in this sector.</code>`, { parse_mode: "HTML" });
    }
});

console.clear();
console.log("\x1b[36m%s\x1b[0m", ASCII.logo);
console.log(`[ VOID_OS ]: BOOTING SUCCESSFUL. VERSION: ${getLore().system_info.os_core}`);

bot.start();