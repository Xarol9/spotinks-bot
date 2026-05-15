require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

let db;

async function initDB() {
    db = await open({ filename: 'void_nexus.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, balance INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, role TEXT DEFAULT 'USER');
        CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, item TEXT, status TEXT DEFAULT 'WAITING', progress INTEGER DEFAULT 0);
    `);
}

bot.use(session());

// --- UI COMPONENTS ---
const UI = {
    userMenu: () => Markup.keyboard([
        ['📂 Catalog', '👤 Terminal'],
        ['🛰 My Projects', '🎁 Sync Bonus']
    ]).resize(),
    
    adminMenu: () => Markup.keyboard([
        ['📡 System Stats', '🛠 Order Control'],
        ['💳 Billing', '🌐 Global Alert'],
        ['🔙 User Mode']
    ]).resize(),

    statusConfig: {
        WAITING: "⬜ Очікування",
        PROCESSING: "🟦 В роботі",
        TESTING: "🟨 Тестування",
        READY: "🟩 Готово"
    }
};

// --- CORE MIDDLEWARE ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.from.id]);
    
    if (!user) {
        const role = ctx.from.id === ADMIN_ID ? 'ADMIN' : 'USER';
        await db.run('INSERT INTO users (id, username, role) VALUES (?, ?, ?)', [ctx.from.id, ctx.from.username, role]);
    }
    
    ctx.state.user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.from.id]);
    return next();
});

// --- COMMANDS ---
bot.start((ctx) => {
    const isOwner = ctx.state.user.role === 'ADMIN';
    ctx.replyWithMarkdownV2(
        `🌑 *VOID GENESIS v2\.0 active*\n\`System status: ONLINE\`\n\`Access level: ${ctx.state.user.role}\``,
        isOwner ? UI.adminMenu() : UI.userMenu()
    );
});

// --- USER LOGIC ---
bot.hears('📂 Catalog', (ctx) => {
    ctx.reply("📁 Оберіть категорію розробки:", Markup.inlineKeyboard([
        [Markup.button.callback('🧊 3D RENDER', 'buy_render')],
        [Markup.button.callback('💻 JAVA PLUGIN', 'buy_plugin')],
        [Markup.button.callback('🎬 VIDEO EDIT', 'buy_video')]
    ]));
});

bot.hears('👤 Terminal', async (ctx) => {
    const u = ctx.state.user;
    const progress = "█".repeat(Math.floor(u.xp/10) % 10) + "░".repeat(10 - (Math.floor(u.xp/10) % 10));
    ctx.replyWithMarkdownV2(
        `💻 *USER TERMINAL*\n\n` +
        `👤 ID: \`${ctx.from.id}\`\n` +
        `💰 BAL: \`${u.balance}₴\`\n` +
        `📊 XP:  \`[${progress}]\``
    );
});

bot.hears('🛰 My Projects', async (ctx) => {
    const orders = await db.all('SELECT * FROM orders WHERE uid = ?', [ctx.from.id]);
    if (!orders.length) return ctx.reply("🛰 Немає активних проектів.");
    
    const list = orders.map(o => `🆔 \`#${o.id}\` | *${o.item}*\nSTATUS: \`${UI.statusConfig[o.status]}\` [${o.progress}%]`).join('\n\n');
    ctx.replyWithMarkdownV2(`📡 *АКТИВНІ ПРОЦЕСИ:*\n\n${list}`);
});

// --- ADMIN LOGIC ---
bot.hears('📡 System Stats', async (ctx) => {
    if (ctx.state.user.role !== 'ADMIN') return;
    const stats = await db.get('SELECT COUNT(*) as u, (SELECT COUNT(*) FROM orders) as o FROM users');
    ctx.replyWithMarkdownV2(`📊 *SYSTEM REPORT*\n\nUsers: \`${stats.u}\`\nOrders: \`${stats.o}\``);
});

bot.hears('🛠 Order Control', async (ctx) => {
    if (ctx.state.user.role !== 'ADMIN') return;
    const orders = await db.all('SELECT * FROM orders WHERE status != "READY" LIMIT 5');
    if (!orders.length) return ctx.reply("Всі проекти завершені.");

    for (const o of orders) {
        ctx.reply(`📦 Замовлення #${o.id} від @${o.uid}`, Markup.inlineKeyboard([
            [Markup.button.callback('🟦 В роботу', `set_PROCESSING_${o.id}`)],
            [Markup.button.callback('🟩 Завершити', `set_READY_${o.id}`)]
        ]));
    }
});

// --- ACTIONS ---
bot.action(/buy_(.+)/, async (ctx) => {
    const item = ctx.match[1].toUpperCase();
    await db.run('INSERT INTO orders (uid, item) VALUES (?, ?)', [ctx.from.id, item]);
    ctx.answerCbQuery("INITIALIZED");
    ctx.replyWithMarkdownV2(`✅ *ПРОЕКТ ${item} ІНІЦІЙОВАНО*\nСтатус можна відстежити в терміналі\.`);
});

bot.action(/set_(.+)_(.+)/, async (ctx) => {
    const [_, status, id] = ctx.match;
    await db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    ctx.answerCbQuery(`Status: ${status}`);
    ctx.editMessageText(`✅ Статус проекту #${id} змінено на ${status}`);
});

initDB().then(() => bot.launch());