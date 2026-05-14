/**
 * Spotinks Engine v1.0 - Void Team Official Release
 * Оптимізація: мінімальне споживання RAM, захист від вилетів, чистий код.
 */

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

const { BOT_TOKEN, ADMIN_ID, ADMIN_USERNAME } = process.env;
const DB_PATH = path.resolve(__dirname, 'spotinks.db');
const PROMOS_PATH = path.resolve(__dirname, 'promos.json');

if (!BOT_TOKEN || !ADMIN_ID) process.exit(1);

const bot = new Telegraf(BOT_TOKEN);

// --- СЕРВІСИ (Константи) ---
const SERVICES = {
    render: { name: "3D Рендер", price: 500, icon: '🧊' },
    design: { name: "UI/UX Дизайн", price: 350, icon: '🎨' },
    plugin: { name: "Java Plugin", price: 650, icon: '☕' },
    preview: { name: "YouTube Прев'ю", price: 200, icon: '🎬' }
};

let db;

// --- ЯДРО СИСТЕМИ ---
async function bootstrap() {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Створення таблиць одним запитом
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            balance INTEGER DEFAULT 0,
            referred_by INTEGER,
            is_banned INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            items TEXT,
            total_price INTEGER,
            status TEXT DEFAULT 'paid'
        );
    `);
    
    // Перевірка колонок (якщо база стара)
    const columns = (await db.all(`PRAGMA table_info(users)`)).map(c => c.name);
    if (!columns.includes('referred_by')) await db.exec('ALTER TABLE users ADD COLUMN referred_by INTEGER');

    console.log('🚀 Void Engine 1.0: Database & Logic Loaded');
}

// --- КЛАВІАТУРИ ---
const UI = {
    main: (id) => Markup.keyboard([
        ['🛍 Послуги', '🛒 Кошик'],
        ['👤 Профіль', '📈 Черга'],
        ['👥 Реферали', '🎟 Промокод'],
        ['🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Активні Замовлення', '📊 Аналітика'],
        ['💰 Змінити Баланс', '🔙 Юзер-мод']
    ]).resize()
};

// --- MIDDLEWARES ---
bot.use(session());
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.session ??= { cart: [] };
    
    // Авто-реєстрація
    await db.run('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)', [ctx.from.id, ctx.from.username]);
    
    const user = await db.get('SELECT is_banned FROM users WHERE user_id = ?', [ctx.from.id]);
    if (user?.is_banned) return ctx.reply("🚫 Доступ заблоковано.");
    return next();
});

// --- ЛОГІКА ЮЗЕРА ---
bot.start((ctx) => ctx.reply('Void Team System v1.0', ctx.from.id == ADMIN_ID ? UI.admin() : UI.main()));

bot.hears('🛍 Послуги', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [Markup.button.callback(`${s.icon} ${s.name} - ${s.price}₴`, `add_${id}`)]);
    ctx.reply("Доступні послуги:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    const s = SERVICES[ctx.match[1]];
    ctx.session.cart.push(s);
    ctx.answerCbQuery(`✅ ${s.name} додано`);
});

bot.hears('🛒 Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("Кошик порожній.");
    
    const total = cart.reduce((sum, i) => sum + i.price, 0);
    ctx.replyWithMarkdown(`🛒 **Замовлення:**\nСума: ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💎 Оплатити', 'pay')],
        [Markup.button.callback('🗑 Очистити', 'reset')]
    ]));
});

bot.action('pay', async (ctx) => {
    const total = ctx.session.cart.reduce((s, i) => s + i.price, 0);
    const user = await db.get('SELECT balance FROM users WHERE user_id = ?', [ctx.from.id]);

    if (user.balance < total) return ctx.answerCbQuery("❌ Недостатньо коштів!");

    const items = ctx.session.cart.map(i => i.name).join(', ');
    await db.run('INSERT INTO orders (user_id, username, items, total_price) VALUES (?, ?, ?, ?)', [ctx.from.id, ctx.from.username, items, total]);
    await db.run('UPDATE users SET balance = balance - ? WHERE user_id = ?', [total, ctx.from.id]);

    ctx.session.cart = [];
    ctx.editMessageText("✅ Сплачено! Чекайте на зв'язок.");
    bot.telegram.sendMessage(ADMIN_ID, `🔥 Нове замовлення від @${ctx.from.username}`);
});

bot.hears('👤 Профіль', async (ctx) => {
    const user = await db.get('SELECT balance FROM users WHERE user_id = ?', [ctx.from.id]);
    ctx.reply(`💳 Баланс: ${user.balance}₴\n🆔 ID: ${ctx.from.id}`);
});

bot.hears('📈 Черга', async (ctx) => {
    const orders = await db.all('SELECT user_id FROM orders WHERE status = "paid"');
    const pos = orders.findIndex(o => o.user_id === ctx.from.id) + 1;
    ctx.reply(pos > 0 ? `📊 Позиція в черзі: ${pos}` : "Активних замовлень немає.");
});

bot.hears('🎟 Промокод', (ctx) => {
    ctx.session.state = 'PROMO';
    ctx.reply("Введіть код:");
});

bot.hears('🆘 Підтримка', (ctx) => ctx.reply(`Зв'язок: @${ADMIN_USERNAME || 'admin'}`));

// --- АДМІНІСТРУВАННЯ ---
bot.hears('📊 Аналітика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const data = await db.all('SELECT items, COUNT(*) as c FROM orders GROUP BY items');
    ctx.reply(`Статистика:\n${data.map(d => `${d.items}: ${d.c}`).join('\n')}`);
});

bot.hears('📋 Активні Замовлення', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orders = await db.all('SELECT * FROM orders WHERE status = "paid"');
    if (!orders.length) return ctx.reply("Порожньо.");
    
    orders.forEach(o => {
        ctx.reply(`📦 #${o.id} @${o.username}\n${o.items}`, Markup.inlineKeyboard([
            [Markup.button.callback('✅ Готово', `done_${o.id}`)]
        ]));
    });
});

bot.action(/done_(\d+)/, async (ctx) => {
    await db.run('UPDATE orders SET status = "done" WHERE id = ?', [ctx.match[1]]);
    ctx.deleteMessage();
});

// --- ГЛОБАЛЬНИЙ ОБРОБНИК СТАНІВ ---
bot.on('text', async (ctx, next) => {
    if (ctx.session.state === 'PROMO') {
        const promos = JSON.parse(fs.readFileSync(PROMOS_PATH, 'utf-8') || '{}');
        const prize = promos[ctx.message.text.toUpperCase()];
        if (prize) {
            await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [prize, ctx.from.id]);
            ctx.reply(`✅ Нараховано ${prize}₴`);
        } else {
            ctx.reply("❌ Невірний код");
        }
        ctx.session.state = null;
        return;
    }
    return next();
});

// --- ЗАХИСТ ВІД ВИЛЕТІВ (Critical Stability) ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🚫 Uncaught Exception:', err);
});

// --- ЗАПУСК ---
bootstrap().then(() => {
    bot.launch({ dropPendingUpdates: true });
    console.log('💎 Void Engine 1.0 Online');
});