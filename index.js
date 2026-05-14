/**
 * Spotinks Engine v1.3 - Enterprise Build
 * Void Team / Lead Architect: xarol9
 * Features: Advanced Analytics, Referral System, Detailed Order Tracking, Audit Logs.
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

const bot = new Telegraf(BOT_TOKEN);

// --- КОНФІГУРАЦІЯ ---
const SERVICES = {
    render: { name: "3D Рендер", price: 550, icon: '🧊', category: 'Design' },
    design: { name: "UI/UX Дизайн", price: 400, icon: '🎨', category: 'Design' },
    plugin: { name: "Java Plugin", price: 300, icon: '☕', category: 'Dev' },
    setup: { name: "Налаштування сервера", price: 200, icon: '⚙️', category: 'Dev' },
    watercl: { name: "WaterCL Custom Build", price: 1000, icon: '🌊', category: 'Dev' }
};

let db;

// --- ІНІЦІАЛІЗАЦІЯ БД ---
async function bootstrap() {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    // Створення розширеної структури таблиць
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            balance INTEGER DEFAULT 0,
            referrer_id INTEGER,
            is_banned INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            items TEXT,
            total_price INTEGER,
            status TEXT DEFAULT 'paid', -- paid, in_progress, review, done
            deadline TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS used_promos (
            user_id INTEGER, promo_code TEXT, PRIMARY KEY (user_id, promo_code)
        );
    `);
    console.log('🌑 Spotinks Engine v1.3: Всі системи активовані (Arch Linux Mode)');
}

// --- ДОПОМІЖНІ ФУНКЦІЇ ---
async function addLog(userId, action, details) {
    await db.run('INSERT INTO system_logs (user_id, action, details) VALUES (?, ?, ?)', [userId, action, details]);
}

// --- КЛАВІАТУРИ ---
const KEYBOARDS = {
    main: () => Markup.keyboard([
        ['🛍 Послуги', '🛒 Кошик'],
        ['👤 Профіль', '📊 Мої замовлення'],
        ['🎟 Активувати код', '👥 Реферали'],
        ['🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Активна черга', '📈 Глибока аналітика'],
        ['📢 Розсилка', '💰 Керування фінансами'],
        ['⚙️ Системні налаштування', '🔙 Юзер-мод']
    ]).resize()
};

bot.use(session());

// --- МІДЛВАР ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    
    const user = await db.get('SELECT is_banned FROM users WHERE user_id = ?', [ctx.from.id]);
    if (user && user.is_banned) return ctx.reply("🚫 Доступ до інфраструктури Void Team заблоковано.");

    ctx.session ??= { cart: [], state: null };
    
    // Реєстрація та реферальна логіка
    const userExists = await db.get('SELECT 1 FROM users WHERE user_id = ?', [ctx.from.id]);
    if (!userExists) {
        let referrerId = null;
        if (ctx.startPayload) referrerId = parseInt(ctx.startPayload);
        await db.run('INSERT INTO users (user_id, username, referrer_id) VALUES (?, ?, ?)', [ctx.from.id, ctx.from.username, referrerId]);
        await addLog(ctx.from.id, 'REGISTER', `Ref: ${referrerId}`);
    }
    
    return next();
});

// --- ГЛИБОКА АНАЛІТИКА (Для адміна) ---
bot.hears('📈 Глибока аналітика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;

    const stats = await db.get(`
        SELECT 
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT SUM(total_price) FROM orders WHERE status = 'done') as total_revenue,
            (SELECT COUNT(*) FROM orders WHERE created_at >= date('now', '-1 day')) as orders_24h,
            (SELECT SUM(total_price) FROM orders WHERE created_at >= date('now', '-7 days') AND status = 'done') as revenue_7d
    `);

    const topServices = await db.all(`
        SELECT items, COUNT(*) as count FROM orders GROUP BY items ORDER BY count DESC LIMIT 3
    `);

    let topMsg = topServices.map(s => `🔹 ${s.items}: ${s.count}`).join('\n');

    ctx.replyWithMarkdown(
        `📊 **Аналітика Spotinks Studio**\n\n` +
        `👥 Всього клієнтів: ${stats.total_users}\n` +
        `💰 Загальний прибуток: ${stats.total_revenue || 0}₴\n` +
        `📅 Прибуток за тиждень: ${stats.revenue_7d || 0}₴\n` +
        `📦 Замовлень за 24г: ${stats.orders_24h}\n\n` +
        `🔥 **Популярні послуги:**\n${topMsg}`
    );
});

// --- РЕФЕРАЛЬНА СИСТЕМА ---
bot.hears('👥 Реферали', async (ctx) => {
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    const refs = await db.get('SELECT COUNT(*) as count FROM users WHERE referrer_id = ?', [ctx.from.id]);
    
    ctx.replyWithMarkdown(
        `👥 **Реферальна програма**\n\n` +
        `Запрошуйте друзів та отримуйте 5% від їхнього першого замовлення на свій баланс!\n\n` +
        `🔗 Ваше посилання:\n\`${refLink}\`\n\n` +
        `Запрошено друзів: ${refs.count}`
    );
});

// --- КЕРУВАННЯ ЧЕРГОЮ (Advanced Admin) ---
bot.hears('📋 Активна черга', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orders = await db.all('SELECT * FROM orders WHERE status != "done" ORDER BY created_at ASC');
    
    if (!orders.length) return ctx.reply("Черга порожня. Можна попрацювати над WaterCL! 🌊");

    for (const o of orders) {
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('⏳ В роботі', `status_in_progress_${o.id}`)],
            [Markup.button.callback('👀 На перевірку', `status_review_${o.id}`)],
            [Markup.button.callback('✅ Виконано', `status_done_${o.id}`)]
        ]);
        ctx.reply(`📦 Замовлення #${o.id}\n👤 Клієнт: @${o.username}\n🛠 Послуги: ${o.items}\nСтатус: ${o.status}`, kb);
    }
});

// Обробка зміни статусів
bot.action(/status_(\w+)_(\d+)/, async (ctx) => {
    const [_, newStatus, orderId] = ctx.match;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    
    await db.run('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
    await addLog(ADMIN_ID, 'STATUS_CHANGE', `Order #${orderId} -> ${newStatus}`);
    
    let statusText = {
        in_progress: "🛠 Взято в роботу!",
        review: "👀 Очікує вашої перевірки. Перевірте лічку!",
        done: "✅ Виконано! Дякуємо, що ви з Void Team."
    }[newStatus];

    bot.telegram.sendMessage(order.user_id, `📢 **Оновлення замовлення #${orderId}:**\n${statusText}`);
    ctx.answerCbQuery(`Статус оновлено на ${newStatus}`);
    ctx.editMessageText(`✅ Статус замовлення #${orderId} змінено на: ${newStatus}`);
});

// --- ПРОФІЛЬ ТА ФІНАНСИ ---
bot.hears('👤 Профіль', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE user_id = ?', [ctx.from.id]);
    ctx.replyWithMarkdown(
        `👤 **Ваш аккаунт**\n\n` +
        `🆔 ID: \`${ctx.from.id}\`\n` +
        `💰 Баланс: ${user.balance}₴\n` +
        `📅 З нами з: ${new Date(user.created_at).toLocaleDateString()}`
    );
});

// --- КЕРУВАННЯ ПОСЛУГАМИ (Каталог) ---
bot.hears('🛍 Послуги', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [
        Markup.button.callback(`${s.icon} ${s.name} — ${s.price}₴`, `add_${id}`)
    ]);
    ctx.reply("✨ Оберіть послугу для замовлення:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    const service = SERVICES[ctx.match[1]];
    ctx.session.cart.push(service);
    ctx.answerCbQuery(`✅ ${service.name} в кошику`);
});

bot.hears('🛒 Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("Кошик порожній.");
    
    const total = cart.reduce((s, i) => s + i.price, 0);
    ctx.reply(`🛒 Разом до сплати: ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💳 Сплатити балансом', 'pay_balance')],
        [Markup.button.callback('🗑 Очистити', 'clear_cart')]
    ]));
});

bot.action('pay_balance', async (ctx) => {
    const cart = ctx.session.cart;
    const total = cart.reduce((s, i) => s + i.price, 0);
    const user = await db.get('SELECT balance, referrer_id FROM users WHERE user_id = ?', [ctx.from.id]);

    if (user.balance < total) return ctx.answerCbQuery("❌ Недостатньо коштів на балансі!");

    const items = cart.map(i => i.name).join(', ');
    const res = await db.run('INSERT INTO orders (user_id, username, items, total_price) VALUES (?, ?, ?, ?)', [ctx.from.id, ctx.from.username, items, total]);
    await db.run('UPDATE users SET balance = balance - ? WHERE user_id = ?', [total, ctx.from.id]);

    // Реферальний бонус (5%)
    if (user.referrer_id) {
        const bonus = Math.floor(total * 0.05);
        await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [bonus, user.referrer_id]);
        bot.telegram.sendMessage(user.referrer_id, `💰 Вам нараховано ${bonus}₴ реферального бонусу!`);
    }

    await addLog(ctx.from.id, 'ORDER_CREATE', `ID: ${res.lastID}, Sum: ${total}`);
    ctx.session.cart = [];
    ctx.editMessageText(`🚀 Замовлення #${res.lastID} оформлено!`);
    bot.telegram.sendMessage(ADMIN_ID, `🔥 **Нове замовлення!**\nВід: @${ctx.from.username}\nСума: ${total}₴\nПослуги: ${items}`);
});

// --- СИСТЕМНІ КОМАНДИ (v1.3) ---
bot.command('stats', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const logs = await db.all('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 5');
    let logMsg = logs.map(l => `🕒 ${l.action}: ${l.details}`).join('\n');
    ctx.reply(`📝 **Останні системні дії:**\n\n${logMsg}`);
});

bot.command('gen', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const [_, amount, code] = ctx.message.text.split(' ');
    if (!amount || !code) return ctx.reply("Формат: /gen 500 CODE");
    
    let promos = fs.existsSync(PROMOS_PATH) ? JSON.parse(fs.readFileSync(PROMOS_PATH)) : {};
    promos[code.toUpperCase()] = parseInt(amount);
    fs.writeFileSync(PROMOS_PATH, JSON.stringify(promos, null, 2));
    ctx.reply(`✅ Код ${code.toUpperCase()} активовано.`);
});

// Запуск
bootstrap().then(() => {
    bot.launch({ dropPendingUpdates: true });
    console.log('🚀 Spotinks Engine v1.3 is live!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));