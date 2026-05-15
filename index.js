require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Конфігурація з .env
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

let db;

// 1. Ініціалізація бази даних
async function initDB() {
    db = await open({ filename: 'void_nexus.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, 
            username TEXT, 
            balance INTEGER DEFAULT 0, 
            xp INTEGER DEFAULT 0, 
            role TEXT DEFAULT 'USER'
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            uid INTEGER, 
            item TEXT, 
            status TEXT DEFAULT 'WAITING', 
            progress INTEGER DEFAULT 0
        );
    `);
    console.log('🌑 Void Database Connected');
}

bot.use(session());

// --- UI CONFIG ---
const UI = {
    userKb: () => Markup.keyboard([
        ['📂 Catalog', '👤 Terminal'],
        ['🛰 My Projects', '🎁 Bonus']
    ]).resize(),
    
    adminKb: () => Markup.keyboard([
        ['📡 System Stats', '🛠 Order Control'],
        ['📢 Broadcast', '🔙 User Mode']
    ]).resize(),

    statusMap: {
        WAITING: "⬜ Очікування",
        PROCESSING: "🟦 В роботі",
        READY: "🟩 Виконано"
    }
};

// --- MIDDLEWARE (Розподіл ролей) ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    
    let user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.from.id]);
    
    if (!user) {
        const role = (ctx.from.id === ADMIN_ID) ? 'ADMIN' : 'USER';
        await db.run('INSERT INTO users (id, username, role) VALUES (?, ?, ?)', 
            [ctx.from.id, ctx.from.username, role]);
        user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.from.id]);
    }
    
    ctx.state.user = user;
    ctx.state.isAdmin = (user.role === 'ADMIN');
    return next();
});

// --- COMMANDS ---
bot.start((ctx) => {
    const welcomeText = ctx.state.isAdmin 
        ? `🌑 *VOID NEXUS: ADMIN ACCESS*\nСистема розгорнута. Очікую команд, Архітекторе.`
        : `🌑 *VOID TEAM SYSTEM*\nВітаємо у терміналі. Оберіть категорію для розробки.`;
    
    ctx.replyWithMarkdown(welcomeText, ctx.state.isAdmin ? UI.adminKb() : UI.userKb());
});

// --- USER LOGIC ---
bot.hears('📂 Catalog', (ctx) => {
    ctx.reply("📁 Оберіть напрямок розробки:", Markup.inlineKeyboard([
        [Markup.button.callback('🧊 3D RENDER (550₴)', 'buy_RENDER')],
        [Markup.button.callback('💻 JAVA PLUGIN (300₴)', 'buy_PLUGIN')],
        [Markup.button.callback('🎬 VIDEO EDIT (400₴)', 'buy_VIDEO')]
    ]));
});

bot.hears('👤 Terminal', async (ctx) => {
    const u = ctx.state.user;
    const lvl = Math.floor(u.xp / 100);
    const progress = "█".repeat(Math.floor((u.xp % 100) / 10)) + "░".repeat(10 - Math.floor((u.xp % 100) / 10));
    
    ctx.replyWithMarkdown(
        `💻 *USER TERMINAL v2.0*\n\n` +
        `👤 ID: \`${ctx.from.id}\`\n` +
        `💰 Balance: \`${u.balance}₴\`\n` +
        `📊 Level: \`${lvl}\` [${progress}]`
    );
});

bot.hears('🛰 My Projects', async (ctx) => {
    const orders = await db.all('SELECT * FROM orders WHERE uid = ? ORDER BY id DESC', [ctx.from.id]);
    if (!orders.length) return ctx.reply("🛰 Активних процесів не виявлено.");
    
    const list = orders.map(o => 
        `🆔 *Order #${o.id}* - ${o.item}\n` +
        `Status: \`${UI.statusMap[o.status]}\` [${o.progress}%]\n` +
        `--------------------`
    ).join('\n');
    
    ctx.replyWithMarkdown(`🛰 *ВАШІ ПРОЕКТИ:*\n\n${list}`);
});

// --- ADMIN LOGIC ---
bot.hears('📡 System Stats', async (ctx) => {
    if (!ctx.state.isAdmin) return;
    const stats = await db.get('SELECT COUNT(*) as u, (SELECT COUNT(*) FROM orders) as o FROM users');
    ctx.replyWithMarkdown(`📊 *SYSTEM REPORT*\n\nКористувачів: \`${stats.u}\`\nЗамовлень: \`${stats.o}\``);
});

bot.hears('🛠 Order Control', async (ctx) => {
    if (!ctx.state.isAdmin) return;
    const orders = await db.all('SELECT * FROM orders WHERE status != "READY" LIMIT 5');
    
    if (!orders.length) return ctx.reply("⚡ Всі проекти завершені або черга порожня.");

    for (const o of orders) {
        ctx.reply(`📦 Замовлення #${o.id} (${o.item}) від @${o.uid}`, Markup.inlineKeyboard([
            [Markup.button.callback('🟦 В роботу', `set_PROCESSING_${o.id}`)],
            [Markup.button.callback('🟩 Готово', `set_READY_${o.id}`)]
        ]));
    }
});

bot.hears('🔙 User Mode', (ctx) => {
    if (!ctx.state.isAdmin) return;
    ctx.reply('Вхід у режим інтерфейсу клієнта...', UI.userKb());
});

// --- ACTIONS (Кнопки) ---
bot.action(/buy_(.+)/, async (ctx) => {
    const item = ctx.match[1];
    await db.run('INSERT INTO orders (uid, item) VALUES (?, ?)', [ctx.from.id, item]);
    await ctx.answerCbQuery("INITIALIZED");
    ctx.replyWithMarkdown(`✅ *ПРОЕКТ ${item} ІНІЦІЙОВАНО*\nСтатус доступний у розділі "🛰 My Projects".`);
});

bot.action(/set_(.+)_(.+)/, async (ctx) => {
    const [_, status, id] = ctx.match;
    const prog = status === 'READY' ? 100 : (status === 'PROCESSING' ? 45 : 0);
    
    await db.run('UPDATE orders SET status = ?, progress = ? WHERE id = ?', [status, prog, id]);
    ctx.answerCbQuery(`Updated to ${status}`);
    ctx.editMessageText(`✅ Статус проекту #${id} змінено на: ${UI.statusMap[status]}`);
    
    // Сповіщення юзера
    const order = await db.get('SELECT uid FROM orders WHERE id = ?', [id]);
    if (order) {
        bot.telegram.sendMessage(order.uid, `🔔 *Оновлення проекту #${id}*\nСтатус: ${UI.statusMap[status]} [${prog}%]`, { parse_mode: 'Markdown' });
    }
});

// --- ЗАПУСК ---
initDB().then(() => {
    console.log('🌑 Void Genesis v2.0 Started Successfully');
    bot.launch();
});