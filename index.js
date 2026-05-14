/**
 * Spotinks Engine v1.1 - Void Team
 * Full Unified Code: Баланс, Черга, Адмінка, Промокоди, Підтримка.
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

// --- КОНФІГУРАЦІЯ ПОСЛУГ ---
const SERVICES = {
    render: { name: "3D Рендер", price: 550, icon: '🧊' },
    design: { name: "UI/UX Дизайн", price: 400, icon: '🎨' },
    plugin: { name: "Java Plugin (Junior)", price: 300, icon: '☕' },
    setup: { name: "Налаштування сервера", price: 200, icon: '⚙️' },
    social: { name: "Social Design", price: 350, icon: '🎬' }
};

let db;

// --- ІНІЦІАЛІЗАЦІЯ БАЗИ ДАНИХ ---
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
    
    // Створюємо порожній файл промокодів, якщо його немає
    if (!fs.existsSync(PROMOS_PATH)) {
        fs.writeFileSync(PROMOS_PATH, JSON.stringify({ "START": 100 }, null, 2));
    }
    
    console.log('💎 Void Engine v1.1: Системи активовані. Готовий до роботи!');
}

// --- КЛАВІАТУРИ ---
const KEYBOARDS = {
    main: () => Markup.keyboard([
        ['🛍 Каталог послуг', '🛒 Кошик'],
        ['👤 Профіль', '📈 Стан черги'],
        ['🎟 Активувати код', '🆘 Підтримка']
    ]).resize(),
    admin: () => Markup.keyboard([
        ['📋 Керування чергою', '📊 Аналітика'],
        ['📢 Розсилка', '💰 Поповнити баланс'],
        ['🔙 Режим юзера']
    ]).resize()
};

bot.use(session());

// --- MIDDLEWARE (Реєстрація юзерів) ---
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.session ??= { cart: [] };
    await db.run('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)', [ctx.from.id, ctx.from.username]);
    return next();
});

// --- ЛОГІКА КОРИСТУВАЧА ---
bot.start((ctx) => {
    const is_admin = ctx.from.id == ADMIN_ID;
    ctx.reply(
        `Void Team: Spotinks Control v1.1 🌑\n\nПривіт, ${ctx.from.first_name}! Оберіть пункт меню для початку.`,
        is_admin ? KEYBOARDS.admin() : KEYBOARDS.main()
    );
});

bot.hears('🛍 Каталог послуг', (ctx) => {
    const btns = Object.entries(SERVICES).map(([id, s]) => [
        Markup.button.callback(`${s.icon} ${s.name} — ${s.price}₴`, `add_${id}`)
    ]);
    ctx.reply("✨ Оберіть потрібну послугу:", Markup.inlineKeyboard(btns));
});

bot.action(/add_(\w+)/, (ctx) => {
    const service = SERVICES[ctx.match[1]];
    ctx.session.cart.push(service);
    ctx.answerCbQuery(`✅ ${service.name} додано!`);
});

bot.hears('🛒 Кошик', async (ctx) => {
    const cart = ctx.session.cart || [];
    if (!cart.length) return ctx.reply("Ваш кошик порожній! 🛍");
    
    const itemList = cart.map((item, i) => `${i + 1}. ${item.icon} ${item.name} — ${item.price}₴`).join('\n');
    const total = cart.reduce((s, i) => s + i.price, 0);
    
    ctx.replyWithMarkdown(`🛒 **Ваше замовлення:**\n\n${itemList}\n\n**Разом:** ${total}₴`, Markup.inlineKeyboard([
        [Markup.button.callback('💳 Сплатити з балансу', 'pay')],
        [Markup.button.callback('🗑 Очистити', 'clear')]
    ]));
});

bot.action('pay', async (ctx) => {
    const cart = ctx.session.cart || [];
    const total = cart.reduce((s, i) => s + i.price, 0);
    const user = await db.get('SELECT balance FROM users WHERE user_id = ?', [ctx.from.id]);

    if (user.balance < total) {
        return ctx.reply(`❌ Недостатньо коштів! Ваш баланс: ${user.balance}₴. Потрібно ще ${total - user.balance}₴.\nСкористайтеся промокодом або зверніться в підтримку.`);
    }

    const items = cart.map(i => i.name).join(', ');
    await db.run('INSERT INTO orders (user_id, username, items, total_price) VALUES (?, ?, ?, ?)', [ctx.from.id, ctx.from.username, items, total]);
    await db.run('UPDATE users SET balance = balance - ? WHERE user_id = ?', [total, ctx.from.id]);

    ctx.session.cart = [];
    ctx.editMessageText("🚀 Замовлення оформлено! Я вже бачу його в адмінці.");
    bot.telegram.sendMessage(ADMIN_ID, `🔥 **НОВЕ ЗАМОВЛЕННЯ!**\nВід: @${ctx.from.username}\nПослуги: ${items}\nСума: ${total}₴`);
});

bot.hears('👤 Профіль', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE user_id = ?', [ctx.from.id]);
    const orders = await db.get('SELECT COUNT(*) as count FROM orders WHERE user_id = ?', [ctx.from.id]);
    ctx.replyWithMarkdown(`👤 **Профіль:**\n\nID: \`${ctx.from.id}\`\nБаланс: ${user.balance}₴\nЗамовлень: ${orders.count}`);
});

bot.hears('📈 Стан черги', async (ctx) => {
    const queue = await db.get('SELECT COUNT(*) as count FROM orders WHERE status = "paid"');
    ctx.reply(`📊 Зараз у роботі: ${queue.count} замовлень.\nМи працюємо максимально швидко!`);
});

bot.hears('🆘 Підтримка', (ctx) => {
    ctx.reply(`🆘 Зв'язок з адміністратором: @${ADMIN_USERNAME}\nСайт: xarol9.github.io/spotinks-web/`);
});

bot.hears('🎟 Активувати код', (ctx) => {
    ctx.session.state = 'WAIT_PROMO';
    ctx.reply("Введіть ваш секретний код:");
});

// --- АДМІН-ФУНКЦІЇ ---
bot.hears('🔙 Режим юзера', (ctx) => ctx.reply('Переключено на інтерфейс юзера', KEYBOARDS.main()));

bot.hears('📋 Керування чергою', async (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    const orders = await db.all('SELECT * FROM orders WHERE status = "paid"');
    if (!orders.length) return ctx.reply("Черга порожня.");
    
    for (const o of orders) {
        ctx.reply(`📦 #${o.id} від @${o.username}\n🛠 ${o.items}`, Markup.inlineKeyboard([
            [Markup.button.callback('✅ Виконано', `done_${o.id}`)]
        ]));
    }
});

bot.action(/done_(\d+)/, async (ctx) => {
    const id = ctx.match[1];
    await db.run('UPDATE orders SET status = "done" WHERE id = ?', [id]);
    ctx.editMessageText(`✅ Замовлення #${id} завершене!`);
});

bot.hears('📢 Розсилка', (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    ctx.session.state = 'WAIT_BROADCAST';
    ctx.reply("Введіть текст для розсилки всім користувачам:");
});

bot.hears('💰 Поповнити баланс', (ctx) => {
    if (ctx.from.id != ADMIN_ID) return;
    ctx.session.state = 'WAIT_GIVE_ID';
    ctx.reply("Введіть ID юзера та суму (напр: 12345 500):");
});

// --- ОБРОБНИК ТЕКСТУ ---
bot.on('text', async (ctx, next) => {
    const state = ctx.session.state;

    if (state === 'WAIT_PROMO') {
        const code = ctx.message.text.toUpperCase();
        const promos = JSON.parse(fs.readFileSync(PROMOS_PATH, 'utf-8'));
        
        if (!promos[code]) return ctx.reply("❌ Невірний код.");
        
        const used = await db.get('SELECT 1 FROM used_promos WHERE user_id = ? AND promo_code = ?', [ctx.from.id, code]);
        if (used) return ctx.reply("⚠️ Ви вже використали цей код.");

        await db.run('INSERT INTO used_promos (user_id, promo_code) VALUES (?, ?)', [ctx.from.id, code]);
        await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [promos[code], ctx.from.id]);
        ctx.reply(`🎉 Нараховано ${promos[code]}₴!`);
        ctx.session.state = null;
    } 
    else if (state === 'WAIT_GIVE_ID' && ctx.from.id == ADMIN_ID) {
        const [tid, amt] = ctx.message.text.split(' ');
        await db.run('UPDATE users SET balance = balance + ? WHERE user_id = ?', [amt, tid]);
        ctx.reply(`✅ Поповнено ${tid} на ${amt}₴`);
        bot.telegram.sendMessage(tid, `💰 Баланс поповнено на ${amt}₴ адміном!`);
        ctx.session.state = null;
    }
    else if (state === 'WAIT_BROADCAST' && ctx.from.id == ADMIN_ID) {
        const users = await db.all('SELECT user_id FROM users');
        users.forEach(u => bot.telegram.sendMessage(u.user_id, `📢 **Оголошення:**\n\n${ctx.message.text}`, { parse_mode: 'Markdown' }).catch(e => {}));
        ctx.reply("✅ Розсилку відправлено.");
        ctx.session.state = null;
    }
    else return next();
});

bootstrap().then(() => bot.launch({ dropPendingUpdates: true }));