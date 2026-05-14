/**
 * Spotinks Engine v1.3 - Enterprise Build
 * Void Team / Lead Architect: xarol9
 * Features: Log Channel Integration, Advanced Analytics, Referral System.
 */

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

const { BOT_TOKEN, ADMIN_ID, ADMIN_USERNAME, LOG_CHANNEL_ID } = process.env;
const DB_PATH = path.resolve(__dirname, 'spotinks.db');
const PROMOS_PATH = path.resolve(__dirname, 'promos.json');

const bot = new Telegraf(BOT_TOKEN);

// --- КОНФІГУРАЦІЯ ПОСЛУГ ---
const SERVICES = {
    render: { name: "3D Рендер", price: 550, icon: '🧊' },
    design: { name: "UI/UX Дизайн", price: 400, icon: '🎨' },
    plugin: { name: "Java Plugin", price: 300, icon: '☕' },
    setup: { name: "Налаштування сервера", price: 200, icon: '⚙️' },
    watercl: { name: "WaterCL Custom Build", price: 1000, icon: '🌊' }
};

let db;

// --- ІНІЦІАЛІЗАЦІЯ БД ---
async function bootstrap() {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
            status TEXT DEFAULT 'paid',
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
    console.log('🌑 Spotinks Engine v1.3: Системи Void Team активовані');
}

// --- ФУНКЦІЯ ЛОГУВАННЯ В КАНАЛ ---
async function addLog(userId, action, details) {
    await db.run('INSERT INTO system_logs (user_id, action, details) VALUES (?, ?, ?)', [userId, action, details]);
    if (LOG_CHANNEL_ID) {
        const logMsg = `📝 **LOG**\n👤 User: \`${userId}\`\n⚡️ Action: **${action}**\n📄 Info: ${details}`;
        bot.telegram.sendMessage(LOG_CHANNEL_ID, logMsg, { parse_mode: 'Markdown' }).catch(() => {});
    }
}

// --- КЛАВІАТУРИ ---
const KEYBOARDS = {
    main: () => Markup.keyboard([
        ['🛍 Послуги', '🛒 Кошик'],
        ['👤 Профіль', '📈 Стан черги'],
        ['🎟 Активувати код', '👥 Реферали'],
        ['🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Активна черга', '📊 Аналітика'],
        ['📢 Розсилка', '💰 Керування балансом'],
        ['⚙️ Системні налаштування', '🔙 Режим юзера']
    ]).resize()
};

bot.use(session());

// --- МІДЛВАР (Перевірка бану та реферали) ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    const user = await db.get('SELECT is_banned FROM users WHERE user_id = ?', [ctx.from.id]);
    if (user && user.is_banned) return ctx.reply("🚫 Доступ заблоковано.");

    ctx.session ??= { cart: [] };
    const userExists = await db.get('SELECT 1 FROM users WHERE user_id = ?', [ctx.from.id]);
    if (!userExists) {
        const refId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        await db.run('INSERT INTO users (user_id, username, referrer_id) VALUES (?, ?, ?)', [ctx.from.id, ctx.from.username, refId]);
        await addLog(ctx.from.id, 'REGISTER', `Ref by: ${refId}`);
    }
    return next();
});

// --- ЛОГІКА ЮЗЕРА ---
bot.start((ctx) => ctx.reply('Void Team: Spotinks Control v1.3', ctx.from.id == ADMIN_ID ? KEYBOARDS.admin() : KEYBOARDS.main()));

bot.hears('🛍 Послуги', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [Markup.button.callback(`${s.icon} ${s.name} — ${s.price}₴`, `add_${id}`)]);
    ctx.reply("✨ Оберіть послугу:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    ctx.session.cart.push(SERVICES[ctx.match[1]]);
    ctx.answerCbQuery("✅ Додано в кошик.");
});

bot.hears('🛒 Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("Кошик порожній.");
    const total = cart.reduce((s, i) => s + i.price, 0);
    ctx.reply(`🛒 Разом: ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💳 Сплатити балансом', 'pay')],
        [Markup.button.callback('🗑 Очистити', 'clear')]
    ]));
});

bot.action('pay', async (ctx) => {
    const cart = ctx.session.cart || [];
    const total = cart.reduce((s, i) => s + i.price, 0);
    const user = await db.get('SELECT balance, referrer_id FROM users WHERE user_id = ?', [ctx.from.id]);

    if (user.balance < total) return ctx.answerCbQuery("❌ Недостатньо коштів.");

    const items = cart.map(i => i.name).join(', ');
    const res = await db.run('INSERT INTO orders (user_id, username, items, total_price) VALUES (?, ?, ?, ?)', [ctx.from.id, ctx.from.username, items, total]);
    await db.run('UPDATE users SET balance = balance - ? WHERE user_id = ?', [total, ctx.from.id]);

    // Реферальна виплата (5%)
    if (user.referrer_id) {
        const bonus = Math.floor(total * 0.05);
        await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [bonus, user.referrer_id]);
        bot.telegram.sendMessage(user.referrer_id, `💰 Бонус ${bonus}₴ за замовлення друга!`);
    }

    await addLog(ctx.from.id, 'ORDER_CREATE', `Order #${res.lastID}, Sum: ${total}₴`);
    ctx.session.cart = [];
    ctx.editMessageText(`🚀 Замовлення #${res.lastID} оформлено!`);
    bot.telegram.sendMessage(ADMIN_ID, `🔥 Нове замовлення від @${ctx.from.username}: ${items}`);
});

bot.hears('👥 Реферали', (ctx) => {
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.replyWithMarkdown(`👥 **Реферальна програма**\n\nЗапрошуй друзів та отримуй 5% від їхніх замовлень!\n\n🔗 Посилання:\n\`${link}\``);
});

// --- АДМІНКА ТА АНАЛІТИКА ---
bot.hears('📊 Аналітика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const stats = await db.get(`
        SELECT 
            (SELECT COUNT(*) FROM users) as users,
            (SELECT SUM(total_price) FROM orders WHERE status = 'done') as revenue,
            (SELECT COUNT(*) FROM orders WHERE status = 'paid') as active_orders
    `);
    ctx.replyWithMarkdown(`📊 **Аналітика**\n\n👤 Юзерів: ${stats.users}\n💳 Прибуток: ${stats.revenue || 0}₴\n📦 В черзі: ${stats.active_orders}`);
});

bot.hears('📋 Активна черга', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orders = await db.all('SELECT * FROM orders WHERE status != "done"');
    if (!orders.length) return ctx.reply("Черга порожня.");
    
    for (const o of orders) {
        const kb = Markup.inlineKeyboard([[Markup.button.callback('✅ Виконано', `done_${o.id}`)]]);
        ctx.reply(`📦 #${o.id} від @${o.username}\n🛠 ${o.items}`, kb);
    }
});

bot.action(/done_(\d+)/, async (ctx) => {
    const id = ctx.match[1];
    await db.run('UPDATE orders SET status = "done" WHERE id = ?', [id]);
    await addLog(ADMIN_ID, 'ORDER_DONE', `Order #${id} marked as done`);
    ctx.editMessageText(`✅ Замовлення #${id} завершене!`);
});

// Команди v1.3
bot.command('backup', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    await ctx.replyWithDocument({ source: DB_PATH, filename: `backup.db` });
    await addLog(ADMIN_ID, 'SYSTEM_BACKUP', 'Manual database backup created');
});

bot.command('gen', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const [_, amount, code] = ctx.message.text.split(' ');
    let promos = fs.existsSync(PROMOS_PATH) ? JSON.parse(fs.readFileSync(PROMOS_PATH)) : {};
    promos[code.toUpperCase()] = parseInt(amount);
    fs.writeFileSync(PROMOS_PATH, JSON.stringify(promos, null, 2));
    ctx.reply(`✅ Код ${code} на ${amount}₴ створено.`);
    await addLog(ADMIN_ID, 'PROMO_GEN', `Code ${code} for ${amount}₴`);
});

bootstrap().then(() => bot.launch({ dropPendingUpdates: true }));