require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

let db;

// 1. Ініціалізація бази даних
async function initDB() {
    db = await open({ filename: 'void_genesis.db', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT,
            balance INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid INTEGER,
            item TEXT,
            status TEXT DEFAULT 'В черзі'
        );
    `);
}

bot.use(session());

// 2. Головне меню (Бренд: Void Team)
const mainKb = Markup.keyboard([
    ['💎 Послуги', '👤 Профіль'],
    ['🎒 Мої замовлення', '🎁 Бонус'],
    ['🆘 Підтримка']
]).resize();

const adminKb = Markup.keyboard([
    ['📊 Статистика', '📦 Керування замовленнями'],
    ['💰 Видати баланс', '🔙 Юзер-мод']
]).resize();

// 3. Реєстрація
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    await db.run('INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)', [ctx.from.id, ctx.from.username]);
    return next();
});

// 4. Команди
bot.start((ctx) => ctx.reply('🌑 Вітаємо у Void Genesis v1.5.2\nСистема активована.', mainKb));

bot.hears('👤 Профіль', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.from.id]);
    ctx.replyWithMarkdown(`👤 **Профіль: @${ctx.from.username}**\n💰 Баланс: \`${user.balance}₴\`\n📊 Досвід: \`${user.xp} XP\``);
});

bot.hears('💎 Послуги', (ctx) => {
    ctx.reply("Оберіть категорію розробки:", Markup.inlineKeyboard([
        [Markup.button.callback('🧊 3D Рендер (550₴)', 'order_render')],
        [Markup.button.callback('💻 Java Плагін (300₴)', 'order_plugin')],
        [Markup.button.callback('🎬 Монтаж відео (450₴)', 'order_video')]
    ]));
});

// Обробка замовлення
bot.action(/order_(.+)/, async (ctx) => {
    const item = ctx.match[1];
    await db.run('INSERT INTO orders (uid, item) VALUES (?, ?)', [ctx.from.id, item]);
    ctx.answerCbQuery("✅ Замовлення прийнято!");
    ctx.reply(`🚀 Замовлення на ${item} додано в чергу. Очікуйте на архітектора.`);
});

bot.hears('🎒 Мої замовлення', async (ctx) => {
    const orders = await db.all('SELECT * FROM orders WHERE uid = ?', [ctx.from.id]);
    if (!orders.length) return ctx.reply("У вас ще немає замовлень.");
    const list = orders.map(o => `📦 #${o.id} ${o.item} — *${o.status}*`).join('\n');
    ctx.replyWithMarkdown(`Твої замовлення:\n\n${list}`);
});

// 5. Адмінка (Для ДЗ — демонстрація рівнів доступу)
bot.command('admin', (ctx) => {
    if (ctx.from.id == ADMIN_ID) ctx.reply('🛠 Панель архітектора активована.', adminKb);
});

bot.hears('📊 Статистика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const stats = await db.get('SELECT COUNT(*) as cnt FROM users');
    ctx.reply(`Користувачів у системі: ${stats.cnt}`);
});

bot.hears('🔙 Юзер-мод', (ctx) => ctx.reply('Режим клієнта.', mainKb));

initDB().then(() => bot.launch());