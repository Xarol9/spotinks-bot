/**
 * Spotinks Engine v1.0 - Void Team Official Release
 * Основні фічі: Аналітика, Черга, Промокоди, Захист від крашів.
 */

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

const { BOT_TOKEN, ADMIN_ID } = process.env;
const DB_PATH = path.resolve(__dirname, 'spotinks.db');
const PROMOS_PATH = path.resolve(__dirname, 'promos.json');

const bot = new Telegraf(BOT_TOKEN);

// --- КОНФІГУРАЦІЯ ПОСЛУГ ---
const SERVICES = {
    render: { name: "3D Рендер", price: 500, icon: '🧊' },
    design: { name: "UI/UX Дизайн", price: 350, icon: '🎨' },
    plugin: { name: "Java Plugin", price: 650, icon: '☕' },
    preview: { name: "YouTube Прев'ю", price: 200, icon: '🎬' }
};

let db;

// --- ІНІЦІАЛІЗАЦІЯ ---
async function bootstrap() {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            balance INTEGER DEFAULT 0,
            is_banned INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            items TEXT,
            total_price INTEGER,
            status TEXT DEFAULT 'paid',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('💎 Void Engine v1.0 завантажено');
}

// --- КЛАВІАТУРИ ---
const KEYBOARDS = {
    main: () => Markup.keyboard([
        ['🛍 Послуги', '🛒 Кошик'],
        ['👤 Профіль', '📈 Черга'],
        ['🎟 Промокод', '🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Активні Замовлення', '📊 Аналітика'],
        ['💰 Змінити Баланс', '🔙 Юзер-мод']
    ]).resize()
};

bot.use(session());

// --- МІДЛВАР ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.session ??= { cart: [] };
    await db.run('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)', [ctx.from.id, ctx.from.username]);
    return next();
});

// --- ЛОГІКА КОРИСТУВАЧА ---
bot.start((ctx) => ctx.reply('Void Team Control v1.0', ctx.from.id == ADMIN_ID ? KEYBOARDS.admin() : KEYBOARDS.main()));

bot.hears('🛍 Послуги', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [Markup.button.callback(`${s.icon} ${s.name} - ${s.price}₴`, `add_${id}`)]);
    ctx.reply("Оберіть послугу:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    ctx.session.cart.push(SERVICES[ctx.match[1]]);
    ctx.answerCbQuery(`✅ Додано`);
});

bot.hears('🛒 Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("Кошик порожній.");
    const total = cart.reduce((s, i) => s + i.price, 0);
    ctx.replyWithMarkdown(`🛒 **Кошик:**\nСума: ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💎 Оплатити', 'pay')],
        [Markup.button.callback('🗑 Очистити', 'clear')]
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
    ctx.editMessageText("✅ Сплачено! Ви в черзі.");
    bot.telegram.sendMessage(ADMIN_ID, `🔥 Нове замовлення від @${ctx.from.username}`);
});

bot.hears('📈 Черга', async (ctx) => {
    const orders = await db.all('SELECT user_id FROM orders WHERE status = "paid" ORDER BY created_at ASC');
    const pos = orders.findIndex(o => o.user_id === ctx.from.id) + 1;
    ctx.reply(pos > 0 ? `📊 Ваша позиція: ${pos}` : "У вас немає активних замовлень.");
});

bot.hears('🎟 Промокод', (ctx) => {
    ctx.session.state = 'PROMO';
    ctx.reply("Введіть код:");
});

// --- АДМІНКА ---
bot.hears('📊 Аналітика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const stats = await db.all('SELECT items, COUNT(*) as c FROM orders GROUP BY items');
    let msg = "📊 **Аналітика:**\n\n";
    stats.forEach(s => msg += `${s.items}: ${"🟩".repeat(Math.min(s.c, 5))} (${s.c})\n`);
    ctx.replyWithMarkdown(msg);
});

bot.hears('📋 Активні Замовлення', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orders = await db.all('SELECT * FROM orders WHERE status = "paid"');
    if (!orders.length) return ctx.reply("Черга порожня.");
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

// --- СТАНИ ---
bot.on('text', async (ctx, next) => {
    if (ctx.session.state === 'PROMO') {
        const promos = fs.existsSync(PROMOS_PATH) ? JSON.parse(fs.readFileSync(PROMOS_PATH, 'utf-8')) : {};
        const bonus = promos[ctx.message.text.toUpperCase()];
        if (bonus) {
            await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [bonus, ctx.from.id]);
            ctx.reply(`✅ +${bonus}₴ нараховано!`);
        } else ctx.reply("❌ Невірний код.");
        ctx.session.state = null;
        return;
    }
    return next();
});

// --- СТАБІЛЬНІСТЬ ---
process.on('unhandledRejection', (e) => console.error('Error:', e));

bootstrap().then(() => bot.launch({ dropPendingUpdates: true }));