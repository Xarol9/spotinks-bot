require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

let db;

async function initDB() {
    db = await open({ filename: 'void_genesis.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, balance INTEGER DEFAULT 0, xp INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, item TEXT, status TEXT DEFAULT 'В черзі');
    `);
}

bot.use(session());

// --- КЛАВІАТУРИ ---
const userKb = Markup.keyboard([
    ['💎 Послуги', '👤 Профіль'],
    ['🎒 Мої замовлення', '🎁 Бонус']
]).resize();

const adminKb = Markup.keyboard([
    ['📊 Статистика', '📦 Всі замовлення'],
    ['📢 Розсилка', '🔙 Вихід з адмінки']
]).resize();

// --- РОЗДІЛЕННЯ ДОСТУПУ (Middleware) ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.state.isAdmin = (ctx.from.id === ADMIN_ID);
    
    // Авто-реєстрація
    await db.run('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)', [ctx.from.id, ctx.from.username]);
    return next();
});

// --- ЛОГІКА ЮЗЕРА ---
bot.start((ctx) => {
    const text = ctx.state.isAdmin ? '🌑 Вітаю, Архітекторе. Систему розгорнуто.' : '🌑 Вітаємо у Void Team. Оберіть послугу:';
    ctx.reply(text, ctx.state.isAdmin ? adminKb : userKb);
});

bot.hears('👤 Профіль', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.from.id]);
    ctx.replyWithMarkdown(`👤 **ID:** \`${ctx.from.id}\`\n💰 **Баланс:** ${user.balance}₴\n📊 **Рівень:** ${Math.floor(user.xp / 100)}`);
});

bot.hears('💎 Послуги', (ctx) => {
    ctx.reply("Оберіть категорію розробки:", Markup.inlineKeyboard([
        [Markup.button.callback('🧊 3D Рендер', 'buy_render')],
        [Markup.button.callback('💻 Плагін', 'buy_plugin')],
        [Markup.button.callback('🎬 Відео', 'buy_video')]
    ]));
});

// --- ЛОГІКА АДМІНА (Тільки для тебе) ---
bot.hears('📊 Статистика', async (ctx) => {
    if (!ctx.state.isAdmin) return ctx.reply('❌ Доступ заборонено.');
    const uCount = await db.get('SELECT COUNT(*) as c FROM users');
    const oCount = await db.get('SELECT COUNT(*) as c FROM orders');
    ctx.reply(`📈 **Системний звіт:**\n\nКористувачів: ${uCount.c}\nЗамовлень: ${oCount.c}`);
});

bot.hears('📦 Всі замовлення', async (ctx) => {
    if (!ctx.state.isAdmin) return;
    const orders = await db.all('SELECT * FROM orders ORDER BY id DESC LIMIT 5');
    if (!orders.length) return ctx.reply("Черга порожня.");
    
    const msg = orders.map(o => `ID:${o.id} | Юзер:${o.uid} | ${o.item}`).join('\n');
    ctx.reply(`📋 **Останні замовлення:**\n\n${msg}`);
});

bot.hears('🔙 Вихід з адмінки', (ctx) => {
    if (!ctx.state.isAdmin) return;
    ctx.reply('Перехід у режим юзера...', userKb);
});

// Обробка кнопок
bot.action(/buy_(.+)/, async (ctx) => {
    const item = ctx.match[1];
    await db.run('INSERT INTO orders (uid, item) VALUES (?, ?)', [ctx.from.id, item]);
    ctx.answerCbQuery("Додано!");
    ctx.reply(`✅ Замовлення на ${item} зафіксовано. Архітектор зв'яжеться з вами.`);
});

initDB().then(() => {
    console.log('Void Genesis is running...');
    bot.launch();
});