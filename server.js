const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = '8914550459:AAFmxIYxofgnAE-a0CqlPj0agjYBPQD1Uzw';
const CHANNEL_USERNAME = '@TF_TOKEN_BOT_NEWS';

// Supabase Cloud Configuration
const SUPABASE_URL = 'https://xblqfkeimvcymxgzsjnk.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual Supabase anon key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(express.json());
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', 'Content-Type'); next(); });

const bot = new Telegraf(BOT_TOKEN);

async function getOrCreateUser(telegramId, defaultName = "Miner") {
    let id = Number(telegramId);
    let { data: u, error } = await supabase.from('users').select('*').eq('telegramId', id).single();
    
    if (!u) {
        u = { 
            telegramId: id, username: defaultName, balance: 1000, lifetimeEarned: 1000, starsSpent: 0,
            tapPower: 1, energy: 1500, maxEnergy: 1500, profitPerHour: 1200, 
            multitapLevel: 1, energyLevel: 0, aiBotLevel: 0,
            referrals: [], lastCheckIn: 0, channelClaimed: false, history: [{ desc: "Account initialized with +1,000 🪙", time: new Date().toLocaleTimeString() }]
        };
        await supabase.from('users').insert([u]);
    }
    return u;
}

bot.start(async (ctx) => {
    const id = ctx.from.id;
    const name = ctx.from.first_name || "Miner";
    const payload = ctx.startPayload;
    
    let u = await getOrCreateUser(id, name);
    if (u.username !== name) {
        await supabase.from('users').update({ username: name }).eq('telegramId', id);
    }

    if (payload && payload.startsWith('ref_')) {
        const refId = parseInt(payload.replace('ref_', ''));
        let { data: refUser } = await supabase.from('users').select('*').eq('telegramId', refId).single();
        if (refUser && refId !== id) {
            let newBalance = Number(refUser.balance) + 10000;
            let newLifetime = Number(refUser.lifetimeEarned) + 10000;
            let refs = refUser.referrals || [];
            let hist = refUser.history || [];
            hist.unshift({ desc: `Recruited friend ${name} (+10,000 🪙)`, time: new Date().toLocaleTimeString() });

            if (!refs.includes(id)) {
                refs.push(id);
                await supabase.from('users').update({ balance: newBalance, lifetimeEarned: newLifetime, referrals: refs, history: hist }).eq('telegramId', refId);
                try {
                    await bot.telegram.sendMessage(refId, `🎉 <b>New Fren Joined!</b>\n\n👤 <b>${name}</b> joined via your invite link.\n🎁 +10,000 🪙 added to your balance!`, { parse_mode: 'HTML' });
                } catch (err) {}
            }
        }
    }
    
    ctx.reply(`🚀 Welcome to TF Empire, ${name}!`, {
        ...Markup.inlineKeyboard([[Markup.button.webApp("⛏️ Launch App", "https://tf-token-app-9988.surge.sh/app.html?v=121")]])
    });
});

app.post('/api/sync', async (req, res) => {
    const { telegramId, balance, energy, profitPerHour, starsAdded } = req.body;
    let u = await getOrCreateUser(telegramId);

    let updateData = {};
    if (balance !== undefined) {
        const diff = Number(balance) - Number(u.balance);
        if (diff > 0) updateData.lifetimeEarned = Number(u.lifetimeEarned) + diff;
        updateData.balance = Number(balance);
    }
    if (energy !== undefined) updateData.energy = Number(energy);
    if (profitPerHour !== undefined) updateData.profitPerHour = Number(profitPerHour);
    if (starsAdded) updateData.starsSpent = Number(u.starsSpent || 0) + Number(starsAdded);

    await supabase.from('users').update(updateData).eq('telegramId', Number(telegramId));
    res.json({ success: true });
});

app.post('/api/upgrade', async (req, res) => {
    const { telegramId, upgradeType } = req.body;
    let u = await getOrCreateUser(telegramId);

    let multitapLevel = u.multitapLevel || 1;
    let energyLevel = u.energyLevel || 0;
    let aiBotLevel = u.aiBotLevel || 0;
    let balance = Number(u.balance);
    let history = u.history || [];

    let cost = 500;
    let updateData = {};

    if (upgradeType === 'multitap') {
        cost = Math.floor(500 * Math.pow(1.7, multitapLevel - 1));
        if (balance < cost) return res.json({ success: false, message: "Not enough coins!" });
        balance -= cost;
        multitapLevel += 1;
        updateData.multitapLevel = multitapLevel;
        updateData.tapPower = multitapLevel;
        history.unshift({ desc: `Upgraded Multitap to +${multitapLevel} (-${cost.toLocaleString()} 🪙)`, time: new Date().toLocaleTimeString() });
    } else if (upgradeType === 'energyLimit') {
        cost = Math.floor(1000 * Math.pow(1.8, energyLevel));
        if (balance < cost) return res.json({ success: false, message: "Not enough coins!" });
        balance -= cost;
        energyLevel += 1;
        let maxEnergy = 1500 + (energyLevel * 500);
        updateData.energyLevel = energyLevel;
        updateData.maxEnergy = maxEnergy;
        updateData.energy = maxEnergy;
        history.unshift({ desc: `Upgraded Energy Limit (-${cost.toLocaleString()} 🪙)`, time: new Date().toLocaleTimeString() });
    } else if (upgradeType === 'aiBot') {
        cost = Math.floor(3000 * Math.pow(2.0, aiBotLevel));
        if (balance < cost) return res.json({ success: false, message: "Not enough coins!" });
        balance -= cost;
        aiBotLevel += 1;
        updateData.aiBotLevel = aiBotLevel;
        updateData.profitPerHour = Number(u.profitPerHour) + 500;
        history.unshift({ desc: `Bought AI Trading Bot (+500 PPH) (-${cost.toLocaleString()} 🪙)`, time: new Date().toLocaleTimeString() });
    }

    if (history.length > 30) history.pop();
    updateData.balance = balance;
    updateData.history = history;

    await supabase.from('users').update(updateData).eq('telegramId', Number(telegramId));
    let { data: updatedU } = await supabase.from('users').select('*').eq('telegramId', Number(telegramId)).single();
    res.json({ success: true, ...updatedU });
});

app.get('/api/user/:id', async (req, res) => {
    let u = await getOrCreateUser(req.params.id);
    res.json({ 
        success: true, 
        balance: Number(u.balance) || 1000, 
        lifetimeEarned: Number(u.lifetimeEarned) || 1000,
        starsSpent: Number(u.starsSpent) || 0,
        tapPower: Number(u.tapPower || u.multitapLevel) || 1,
        energy: Number(u.energy) || 1500,
        maxEnergy: Number(u.maxEnergy || (1500 + (u.energyLevel || 0) * 500)) || 1500,
        profitPerHour: Number(u.profitPerHour) || 1200,
        multitapLevel: u.multitapLevel || 1,
        energyLevel: u.energyLevel || 0,
        aiBotLevel: u.aiBotLevel || 0,
        refCount: u.referrals ? u.referrals.length : 0,
        dailyClaimed: u.lastCheckIn ? (Date.now() - u.lastCheckIn < 86400000) : false,
        channelClaimed: !!u.channelClaimed,
        history: u.history || []
    });
});

app.get('/api/leaderboard', async (req, res) => {
    let { data: users } = await supabase.from('users').select('username, lifetimeEarned, balance').order('lifetimeEarned', { ascending: false }).limit(50);
    const leaderboard = (users || []).map(u => ({
        username: u.username || "Miner",
        score: u.lifetimeEarned || u.balance || 1000
    }));
    res.json({ success: true, leaderboard });
});

app.post('/api/claim-ad-reward', async (req, res) => {
    const { telegramId } = req.body;
    let u = await getOrCreateUser(telegramId);

    let newBalance = Number(u.balance) + 15000;
    let newLifetime = Number(u.lifetimeEarned) + 15000;
    let history = u.history || [];
    history.unshift({ desc: "Watched Rewarded Ad (+15,000 🪙)", time: new Date().toLocaleTimeString() });
    if (history.length > 30) history.pop();

    await supabase.from('users').update({ balance: newBalance, lifetimeEarned: newLifetime, history }).eq('telegramId', Number(telegramId));
    res.json({ success: true, balance: newBalance, message: "+15,000 🪙 Rewarded successfully!" });
});

app.post('/api/create-invoice', async (req, res) => {
    const { telegramId, packageName, starsCount, coinsReward } = req.body;
    try {
        const invoiceLink = await bot.telegram.createInvoiceLink({
            title: `${packageName}`,
            description: `Top up +${coinsReward.toLocaleString()} 🪙 in TF Exchange`,
            payload: JSON.stringify({ telegramId, coinsReward, starsCount }),
            provider_token: '',
            currency: 'XTR',
            prices: [{ label: `${coinsReward.toLocaleString()} Coins`, amount: starsCount }]
        });
        res.json({ success: true, invoiceLink });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

bot.on('pre_checkout_query', async (ctx) => { await ctx.answerPreCheckoutQuery(true); });

bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    try {
        const payload = JSON.parse(payment.invoice_payload);
        let u = await getOrCreateUser(payload.telegramId);
        let newBalance = Number(u.balance) + payload.coinsReward;
        let newLifetime = Number(u.lifetimeEarned) + payload.coinsReward;
        let newStars = Number(u.starsSpent || 0) + payload.starsCount;
        let history = u.history || [];
        history.unshift({ desc: `Bought +${payload.coinsReward.toLocaleString()} 🪙 (${payload.starsCount} ⭐)`, time: new Date().toLocaleTimeString() });

        await supabase.from('users').update({ balance: newBalance, lifetimeEarned: newLifetime, starsSpent: newStars, history }).eq('telegramId', Number(payload.payload.telegramId));
        await ctx.reply(`🎉 <b>Payment Successful!</b>\n\n+${payload.coinsReward.toLocaleString()} 🪙 added to your balance.`, { parse_mode: 'HTML' });
    } catch (e) {}
});

app.post('/api/claim-task', async (req, res) => {
    const { telegramId, taskType } = req.body;
    let u = await getOrCreateUser(telegramId);
    const now = Date.now();

    if (taskType === 'daily') {
        if (u.lastCheckIn && now - u.lastCheckIn < 86400000) {
            return res.json({ success: false, message: "Daily check-in already claimed today!" });
        }
        let newBalance = Number(u.balance) + 5000;
        let newLifetime = Number(u.lifetimeEarned) + 5000;
        let history = u.history || [];
        history.unshift({ desc: "Claimed Daily Check-In (+5,000 🪙)", time: new Date().toLocaleTimeString() });

        await supabase.from('users').update({ lastCheckIn: now, balance: newBalance, lifetimeEarned: newLifetime, history }).eq('telegramId', Number(telegramId));
        return res.json({ success: true, balance: newBalance, message: "+5,000 🪙 Claimed successfully!" });
    }

    if (taskType === 'channel') {
        if (u.channelClaimed) return res.json({ success: false, message: "Channel reward already claimed!" });
        try {
            const member = await bot.telegram.getChatMember(CHANNEL_USERNAME, telegramId);
            if (['member', 'administrator', 'creator'].includes(member.status)) {
                let newBalance = Number(u.balance) + 25000;
                let newLifetime = Number(u.lifetimeEarned) + 25000;
                let history = u.history || [];
                history.unshift({ desc: "Joined News Channel (+25,000 🪙)", time: new Date().toLocaleTimeString() });

                await supabase.from('users').update({ channelClaimed: true, balance: newBalance, lifetimeEarned: newLifetime, history }).eq('telegramId', Number(telegramId));
                return res.json({ success: true, balance: newBalance, message: "+25,000 🪙 Claimed successfully!" });
            } else {
                return res.json({ success: false, message: "❌ You haven't joined the channel yet!" });
            }
        } catch (err) {
            return res.json({ success: false, message: "Membership check failed." });
        }
    }
    res.status(400).json({ success: false, message: "Invalid task" });
});

app.get('/', (req, res) => res.send('Online!'));

// Use dynamic port for Render cloud deployment
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (Supabase Connected)`));
bot.launch().then(() => console.log("Bot active!"));
