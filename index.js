/**
 * Spotinks Engine v1.5 - Industrial Build
 * Lead Architect: xarol9 (Void Team)
 * Platform: Arch Linux | PM2 Ready
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

// --- КОНФІГУРАЦІЯ ПОСЛУГ VOID TEAM ---
const SERVICES = {
    render: { name: "3D Рендер", price: 550, icon: '🧊' },
    design: { name: "UI/UX Дизайн", price: 400, icon: '🎨' },
    plugin: { name: "Java Plugin", price: 300, icon: '☕' },
    setup: { name: "Налаштування сервера", price: 200, icon: '⚙️' },
    watercl: { name: "WaterCL Custom Build", price: 1000, icon: '🌊' }
};

let db;

// --- ІНІЦІАЛІЗАЦІЯ СИСТЕМИ ---
async function bootstrap() {
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            balance INTEGER DEFAULT 0,
            referrer_id INTEGER,
            is_banned INTEGER DEFAULT 0,
            last_daily DATETIME,
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
    `);
    console.log('🌑 Spotinks Engine v1.5: Industrial Build Active');
}

// --- СИСТЕМА ЛОГУВАННЯ ---
async function addLog(userId, action, details) {
    await db.run('INSERT INTO system_logs (user_id, action, details) VALUES (?, ?, ?)', [userId, action, details]);
    if (LOG_CHANNEL_ID) {
        const logMsg = `📝 **LOG v1.5**\n👤 ID: \`${userId}\`\n⚡️ Action: **${action}**\n📄 Info: ${details}`;
        bot.telegram.sendMessage(LOG_CHANNEL_ID, logMsg, { parse_mode: 'Markdown' }).catch(() => {});
    }
}

// --- КЛАВІАТУРИ ---
const KEYBOARDS = {
    main: () => Markup.keyboard([
        ['🛍 Послуги', '🛒 Кошик'],
        ['👤 Профіль', '📈 Стан черги'],
        ['🎁 Дейлик', '👥 Реферали'],
        ['🎟 Активувати код', '🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Активна черга', '📊 Аналітика'],
        ['📢 Розсилка', '💰 Керування балансом'],
        ['📦 Backup DB', '🔙 Режим юзера']
    ]).resize()
};

bot.use(session());

// --- МІДЛВАР (Фікс реєстрації та рефералів) ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.session ??= { cart: [], state: null };

    const user = await db.get('SELECT * FROM users WHERE user_id = ?', [ctx.from.id]);
    if (user && user.is_banned) return ctx.reply("🚫 Доступ обмежено архітектором.");

    if (!user) {
        let refId = ctx.startPayload ? parseInt(ctx.startPayload) : null;
        if (refId === ctx.from.id) refId = null; // Захист від саморефералів
        await db.run('INSERT INTO users (user_id, username, referrer_id) VALUES (?, ?, ?)', [ctx.from.id, ctx.from.username, refId]);
        await addLog(ctx.from.id, 'REGISTER', `Ref ID: ${refId}`);
    }
    return next();
});

// --- ЛОГІКА ЮЗЕРА ---
bot.start((ctx) => ctx.reply('Void Team: Spotinks Control v1.5', ctx.from.id == ADMIN_ID ? KEYBOARDS.admin() : KEYBOARDS.main()));

// Виправлена кнопка Дейлик
bot.hears('🎁 Дейлик', async (ctx) => {
    const user = await db.get('SELECT last_daily FROM users WHERE user_id = ?', [ctx.from.id]);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (user.last_daily && (now - new Date(user.last_daily).getTime()) < cooldown) {
        const nextDate = new Date(new Date(user.last_daily).getTime() + cooldown);
        return ctx.reply(`⏳ Бонус вже отримано. Наступний о ${nextDate.toLocaleTimeString()}!`);
    }

    const reward = Math.floor(Math.random() * 46) + 5; // 5-50₴
    await db.run('UPDATE users SET balance = balance + ?, last_daily = ? WHERE user_id = ?', [reward, new Date().toISOString(), ctx.from.id]);
    ctx.reply(`🎉 Нараховано щоденний бонус: ${reward}₴!`);
    await addLog(ctx.from.id, 'DAILY_REWARD', `${reward}₴`);
});

bot.hears('🛍 Послуги', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [Markup.button.callback(`${s.icon} ${s.name} — ${s.price}₴`, `add_${id}`)]);
    ctx.reply("✨ Оберіть послугу для замовлення:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    const service = SERVICES[ctx.match[1]];
    ctx.session.cart.push(service);
    ctx.answerCbQuery(`✅ ${service.name} в кошику`);
});

bot.hears('🛒 Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("🛒 Кошик порожній.");
    const total = cart.reduce((s, i) => s + i.price, 0);
    ctx.reply(`🛒 Ваше замовлення:\n${cart.map(i => `• ${i.name}`).join('\n')}\n\nРазом: ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💳 Сплатити балансом', 'pay_confirm')],
        [Markup.button.callback('🗑 Очистити', 'clear_cart')]
    ]));
});

bot.action('clear_cart', (ctx) => {
    ctx.session.cart = [];
    ctx.editMessageText("🗑 Кошик очищено.");
});

bot.action('pay_confirm', async (ctx) => {
    const cart = ctx.session.cart || [];
    const total = cart.reduce((s, i) => s + i.price, 0);
    const user = await db.get('SELECT balance, referrer_id FROM users WHERE user_id = ?', [ctx.from.id]);

    if (user.balance < total) return ctx.answerCbQuery("❌ Недостатньо коштів!");

    const items = cart.map(i => i.name).join(', ');
    const res = await db.run('INSERT INTO orders (user_id, username, items, total_price) VALUES (?, ?, ?, ?)', [ctx.from.id, ctx.from.username, items, total]);
    await db.run('UPDATE users SET balance = balance - ? WHERE user_id = ?', [total, ctx.from.id]);

    // Реферальні 5%
    if (user.referrer_id) {
        const bonus = Math.floor(total * 0.05);
        await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [bonus, user.referrer_id]);
    }

    ctx.session.cart = [];
    ctx.editMessageText(`🚀 Замовлення #${res.lastID} в черзі!`);
    await addLog(ctx.from.id, 'PURCHASE', `Order #${res.lastID} | ${total}₴`);
});

bot.hears('👤 Профіль', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE user_id = ?', [ctx.from.id]);
    ctx.replyWithMarkdown(`👤 **Профіль**\n\n🆔 ID: \`${ctx.from.id}\`\n💰 Баланс: ${user.balance}₴\n👥 Реферали: [Використовуй кнопку в меню]`);
});

bot.hears('👥 Реферали', (ctx) => {
    ctx.reply(`👥 Твоє посилання:\nhttps://t.me/${ctx.botInfo.username}?start=${ctx.from.id}\n\nОтримуй 5% з кожного замовлення друга!`);
});

bot.hears('🎟 Активувати код', (ctx) => {
    ctx.session.state = 'WAIT_PROMO';
    ctx.reply("Введіть ваш промокод:");
});

// --- АДМІНІСТРУВАННЯ ---
bot.hears('📊 Аналітика', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const stats = await db.get("SELECT COUNT(*) as u, SUM(balance) as b FROM users");
    const ord = await db.get("SELECT COUNT(*) as c FROM orders WHERE status = 'paid'");
    ctx.reply(`📊 Статистика:\nЮзерів: ${stats.u}\nГрошей в системі: ${stats.b}₴\nАктивних замовлень: ${ord.c}`);
});

bot.hears('📦 Backup DB', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    await ctx.replyWithDocument({ source: DB_PATH, filename: 'spotinks.db' });
});

bot.hears('🔙 Юзер-мод', (ctx) => ctx.reply('Режим клієнта', KEYBOARDS.main()));

// Обробник тексту для промокодів
bot.on('text', async (ctx, next) => {
    if (ctx.session?.state === 'WAIT_PROMO') {
        const code = ctx.message.text.toUpperCase();
        let promos = fs.existsSync(PROMOS_PATH) ? JSON.parse(fs.readFileSync(PROMOS_PATH)) : {};
        
        if (promos[code]) {
            await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [promos[code], ctx.from.id]);
            ctx.reply(`🎉 Код активовано! Нараховано ${promos[code]}₴`);
            await addLog(ctx.from.id, 'PROMO_USE', `Code: ${code}`);
        } else {
            ctx.reply("❌ Код не знайдено або він недійсний.");
        }
        ctx.session.state = null;
    } else return next();
});

bootstrap().then(() => bot.launch({ dropPendingUpdates: true }));