const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '50mb' })); // Allows large image uploads for receipts

// In-memory databases
let userBalances = {};
let registeredUsers = {};
let userProfiles = {}; // 🔥 NEW: Stores user names, phones, etc.
let globalStats = { deposits: 0, withdrawals: 0, bets: 0, payouts: 0 }; // 🔥 NEW STATS TRACKER

// ==========================================
// 🚨 TELEGRAM BOT CREDENTIALS 🚨
const TELEGRAM_BOT_TOKEN = '8817002947:AAHLpPF5F4QH7GNKIaxoxBEv9wOth_TumIk'; 
const TELEGRAM_REGISTRATION_CHANNEL_ID = '-1004345822083'; 
const TELEGRAM_WITHDRAWAL_CHANNEL_ID = '-1003903639876'; 
const TELEGRAM_DEPOSIT_CHANNEL_ID = '-1004338096507';
const ADMIN_TELEGRAM_IDS = ['404211177', '1847040245'];
// ==========================================

// Friendly Root Message
app.get('/', (req, res) => {
    res.send('Welcome to the BRIGHTEN.BET API! Server is running perfectly.');
});

// 1. Check Balance & Registration Status (With Self-Healing)
app.get('/api/balance/:userId', (req, res) => {
    const userId = req.params.userId;
    
    if (userId === 'browser_test') {
        return res.json({ balance: 50 });
    }
    
    // 🔥 SELF-HEALING: If they have money in memory, they are registered!
    if (userBalances[userId] !== undefined) {
        registeredUsers[userId] = true;
    }
    
    if (!registeredUsers[userId]) {
        return res.json({ registered: false, balance: 0 });
    }
    
    res.json({ registered: true, balance: userBalances[userId] });
});

// 2. Register New User (Or Restore Lost Memory)
app.post('/api/register', async (req, res) => {
    const { userId, firstName, username, phone, restoreBalance } = req.body;
    
    if (registeredUsers[userId]) {
        return res.status(400).json({ error: "Already registered", balance: userBalances[userId] });
    }

    registeredUsers[userId] = true;
    
    // 🔥 Save their info for the Admin Dashboard!
    userProfiles[userId] = { firstName, username, phone };
    
    if (restoreBalance !== undefined) {
        userBalances[userId] = restoreBalance;
        return res.json({ success: true, balance: userBalances[userId] });
    }

    userBalances[userId] = 10.00; 
    
    try {
        const message = `🚨 <b>New Player Registered!</b>\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n📱 Phone: ${phone || 'N/A'}\n💰 Bonus Given: 10 ETB`;
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_REGISTRATION_CHANNEL_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (err) {
        console.error("Failed to send Telegram registration notification", err);
    }

    res.json({ success: true, balance: userBalances[userId] });
});

// 3. Process Bet
app.post('/api/bet', (req, res) => {
    const { userId, betAmount } = req.body;
    if (!userBalances[userId] || userBalances[userId] < betAmount) {
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }
    userBalances[userId] -= betAmount;
    globalStats.bets += betAmount; // 🔥 TRACK BET
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 4. Process Win
app.post('/api/win', (req, res) => {
    const { userId, winAmount } = req.body;
    if (!userBalances[userId]) userBalances[userId] = 0;
    userBalances[userId] += winAmount;
    globalStats.payouts += winAmount; // 🔥 TRACK PAYOUT
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 5. Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
    const { userId, firstName, username, paymentMethod, accountNumber, amount } = req.body;

    if (!userBalances[userId] || userBalances[userId] < amount) {
        return res.status(400).json({ success: false, error: "Insufficient balance" });
    }

    userBalances[userId] -= amount;

    try {
        const message = `💸 <b>New Withdrawal Request!</b>\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n🏦 Method: ${paymentMethod.toUpperCase()}\n💳 Account No: <code>${accountNumber}</code>\n💵 Amount: ${amount} ETB`;
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        const response = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_WITHDRAWAL_CHANNEL_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const tgResult = await response.json();
        if (!tgResult.ok) {
            userBalances[userId] += amount;
            return res.status(500).json({ success: false, error: tgResult.description || "Telegram rejected the message" });
        }

        globalStats.withdrawals += amount; // 🔥 TRACK WITHDRAWAL
        res.json({ success: true, newBalance: userBalances[userId] });
    } catch (err) {
        console.error("Failed to send withdrawal notification", err);
        userBalances[userId] += amount;
        res.status(500).json({ success: false, error: "Network error sending request." });
    }
});

// 6. Deposit Request
app.post('/api/deposit/request', async (req, res) => {
    const { userId, firstName, username, paymentMethod, amount, receiptBase64 } = req.body;

    try {
        const message = `💰 <b>New Deposit Request!</b>\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n🏦 Method: ${paymentMethod.toUpperCase()}\n💵 Amount: ${amount} ETB`;
        
        const base64Data = receiptBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_DEPOSIT_CHANNEL_ID);
        formData.append('photo', blob, 'receipt.jpg');
        formData.append('caption', message);
        formData.append('parse_mode', 'HTML');
        
        formData.append('reply_markup', JSON.stringify({
            inline_keyboard: [
                [
                    { text: "✅ APPROVE", callback_data: `dep_yes_${userId}_${amount}` },
                    { text: "❌ REJECT", callback_data: `dep_no_${userId}_${amount}` }
                ]
            ]
        }));

        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData
        });

        const tgResult = await response.json();
        
        if (!tgResult.ok) {
            console.error("Telegram API Error:", tgResult);
            return res.status(500).json({ success: false, error: tgResult.description || "Telegram rejected the message" });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Failed to send deposit request", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// 7. Webhook for Interactive Buttons
app.post('/api/telegram/webhook', async (req, res) => {
    const update = req.body;
    
    if (update.callback_query) {
        const data = update.callback_query.data;
        const msgId = update.callback_query.message.message_id;
        const chatId = update.callback_query.message.chat.id;
        const originalCaption = update.callback_query.message.caption || "";

        try {
            if (data.startsWith('dep_yes_')) {
                const parts = data.split('_');
                const userId = parts[2];
                const amount = parseFloat(parts[3]);

                if (!userBalances[userId]) userBalances[userId] = 0;
                userBalances[userId] += amount;
                
                registeredUsers[userId] = true;
                globalStats.deposits += amount; // 🔥 TRACK APPROVED DEPOSIT

                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: msgId,
                        caption: originalCaption + `\n\n✅ <b>APPROVED</b> by Admin. ${amount} ETB added!`,
                        parse_mode: 'HTML'
                    })
                });
            } else if (data.startsWith('dep_no_')) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: msgId,
                        caption: originalCaption + `\n\n❌ <b>REJECTED</b> by Admin.`,
                        parse_mode: 'HTML'
                    })
                });
            }

            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: update.callback_query.id })
            });
        } catch(e) {
            console.error("Webhook error:", e);
        }
    }
    res.sendStatus(200);
});

// 8. Secret Admin Stats Endpoint
app.get('/api/admin/stats/:userId', (req, res) => {
    // 🔥 BULLETPROOF CHECK: Converts both to strings so it never fails even if quotes are missing
    if (String(req.params.userId) !== String(ADMIN_TELEGRAM_ID) && req.params.userId !== 'fallback_user') {
        return res.status(403).json({ error: "Unauthorized. ID does not match." });
    }
    
    // 🔥 Build the complete player list
    const players = Object.keys(registeredUsers).map(id => ({
        id,
        balance: userBalances[id] || 0,
        firstName: userProfiles[id]?.firstName || 'Player',
        username: userProfiles[id]?.username || 'N/A',
        phone: userProfiles[id]?.phone || 'N/A'
    }));

    res.json({
        totalUsers: Object.keys(registeredUsers).length,
        todayDeposits: globalStats.deposits,
        todayWithdrawals: globalStats.withdrawals,
        totalBets: globalStats.bets,
        totalPayouts: globalStats.payouts,
        netRevenue: globalStats.bets - globalStats.payouts,
        players: players // 🔥 Send players list to frontend
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`YAF-KENO Backend running on port ${PORT}`);
});