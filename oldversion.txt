/**
 * Spotinks Engine v1.1 - Void Team
 * Fix: Одноразові промокоди, оновлений UX замовлень, фікс кнопок та адмінки.
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
            balance INTEGER DEFAULT 0
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
        CREATE TABLE IF NOT EXISTS used_promos (
            user_id INTEGER,
            promo_code TEXT,
            PRIMARY KEY (user_id, promo_code)
        );
    `);
    console.log('💎 Void Engine v1.1: Фікси та нові фічі активовані');
}

// --- КЛАВІАТУРИ ---
const KEYBOARDS = {
    main: () => Markup.keyboard([
        ['🛍 Каталог послуг', '🛒 Мій Кошик'],
        ['👤 Профіль', '📈 Стан черги'],
        ['🎟 Активувати код', '🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Керування чергою', '📊 Повна аналітика'],
        ['💰 Коригування балансу', '🔙 Режим юзера']
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
bot.start((ctx) => ctx.reply('Void Team: Spotinks Control v1.1', ctx.from.id == ADMIN_ID ? KEYBOARDS.admin() : KEYBOARDS.main()));

bot.hears('🛍 Каталог послуг', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [Markup.button.callback(`${s.icon} ${s.name} — ${s.price}₴`, `add_${id}`)]);
    ctx.reply("✨ Оберіть потрібну послугу для замовлення:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    const service = SERVICES[ctx.match[1]];
    ctx.session.cart.push(service);
    ctx.answerCbQuery(`✅ ${service.name} додано до кошика!`);
});

bot.hears('🛒 Мій Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("Ваш кошик поки що порожній. Перейдіть до каталогу! 🛍");
    
    const itemList = cart.map((item, index) => `${index + 1}. ${item.icon} ${item.name} — ${item.price}₴`).join('\n');
    const total = cart.reduce((s, i) => s + i.price, 0);
    
    ctx.replyWithMarkdown(`🛒 **Ваше замовлення:**\n\n${itemList}\n\n**Разом до сплати:** ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💳 Підтвердити та сплатити', 'pay')],
        [Markup.button.callback('🗑 Очистити кошик', 'clear')]
    ]));
});

bot.action('clear', (ctx) => {
    ctx.session.cart = [];
    ctx.editMessageText("🗑 Кошик очищено.");
});

bot.action('pay', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.answerCbQuery("Кошик порожній!");

    const total = cart.reduce((s, i) => s + i.price, 0);
    const user = await db.get('SELECT balance FROM users WHERE user_id = ?', [ctx.from.id]);
    
    if (user.balance < total) {
        return ctx.reply(`❌ Недостатньо коштів. Ваш баланс: ${user.balance}₴. Потрібно ще ${total - user.balance}₴.`);
    }

    const items = cart.map(i => i.name).join(', ');
    await db.run('INSERT INTO orders (user_id, username, items, total_price) VALUES (?, ?, ?, ?)', [ctx.from.id, ctx.from.username, items, total]);
    await db.run('UPDATE users SET balance = balance - ? WHERE user_id = ?', [total, ctx.from.id]);

    ctx.session.cart = [];
    ctx.editMessageText("🚀 Замовлення успішно оформлено! Очікуйте, ми скоро почнемо роботу.");
    bot.telegram.sendMessage(ADMIN_ID, `🔥 **Нове замовлення!**\nВід: @${ctx.from.username}\nПослуги: ${items}\nСума: ${total}₴`);
});

bot.hears('🎟 Активувати код', (ctx) => {
    ctx.session.state = 'WAIT_PROMO';
    ctx.reply("⌨️ Введіть ваш секретний промокод:");
});

// --- АДМІНКА ТА ФІКСИ ---
bot.hears('📊 Повна аналітика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const totalOrders = await db.get('SELECT COUNT(*) as count FROM orders');
    const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
    const income = await db.get('SELECT SUM(total_price) as sum FROM orders WHERE status = "done"');
    
    ctx.replyWithMarkdown(`📊 **Статистика Void Team:**\n\n👥 Юзерів: ${totalUsers.count}\n📦 Замовлень: ${totalOrders.count}\n💰 Прибуток: ${income.sum || 0}₴`);
});

bot.hears('📋 Керування чергою', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orders = await db.all('SELECT * FROM orders WHERE status = "paid"');
    if (!orders.length) return ctx.reply("В черзі поки що порожньо. Відпочиваємо! 😎");
    
    for (const o of orders) {
        await ctx.reply(`📦 Замовлення #${o.id}\n👤 Клієнт: @${o.username}\n🛠 Послуги: ${o.items}`, Markup.inlineKeyboard([
            [Markup.button.callback('✅ Виконано', `done_${o.id}`)]
        ]));
    }
});

bot.action(/done_(\d+)/, async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orderId = ctx.match[1];
    await db.run('UPDATE orders SET status = "done" WHERE id = ?', [orderId]);
    ctx.editMessageText(`✅ Замовлення #${orderId} позначено як виконане!`);
});

// --- ОБРОБКА ТЕКСТУ (ПРОМОКОДИ) ---
bot.on('text', async (ctx, next) => {
    if (ctx.session.state === 'WAIT_PROMO') {
        const code = ctx.message.text.toUpperCase();
        const promos = fs.existsSync(PROMOS_PATH) ? JSON.parse(fs.readFileSync(PROMOS_PATH, 'utf-8')) : {};
        
        if (!promos[code]) {
            ctx.reply("❌ Такого коду не існує.");
        } else {
            const alreadyUsed = await db.get('SELECT 1 FROM used_promos WHERE user_id = ? AND promo_code = ?', [ctx.from.id, code]);
            if (alreadyUsed) {
                ctx.reply("⚠️ Ви вже використовували цей промокод! Один код — один раз в одні руки.");
            } else {
                const bonus = promos[code];
                await db.run('INSERT INTO used_promos (user_id, promo_code) VALUES (?, ?)', [ctx.from.id, code]);
                await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [bonus, ctx.from.id]);
                ctx.reply(`🎉 Успіх! На ваш баланс нараховано ${bonus}₴.`);
            }
        }
        ctx.session.state = null;
        return;
    }
    return next();
});

bootstrap().then(() => bot.launch({ dropPendingUpdates: true }));