const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '50mb' })); // Increased to 50mb for high-res phone screenshots

// In-memory databases (Resets when free Render server sleeps)
let userBalances = {};
let registeredUsers = {};

// ==========================================
// 🚨 TELEGRAM BOT CREDENTIALS 🚨
// Replace these with your real details!
const TELEGRAM_BOT_TOKEN = '8817002947:AAHLpPF5F4QH7GNKIaxoxBEv9wOth_TumIk'; 
const TELEGRAM_REGISTRATION_CHANNEL_ID = '-1004345822083'; 
const TELEGRAM_WITHDRAWAL_CHANNEL_ID = '-1003903639876'; 
const TELEGRAM_DEPOSIT_CHANNEL_ID = '-1004338096507';
// ==========================================
// 1. Check Balance & Registration Status
app.get('/api/balance/:userId', (req, res) => {
    const userId = req.params.userId;
    
    // If they aren't registered, tell the frontend to show the popup!
    if (!registeredUsers[userId]) {
        return res.json({ registered: false, balance: 0 });
    }
    
    res.json({ registered: true, balance: userBalances[userId] });
});

// 2. Register New User (10 ETB Bonus)
app.post('/api/register', async (req, res) => {
    const { userId, firstName, username, phone } = req.body;
    
    if (registeredUsers[userId]) {
        return res.status(400).json({ error: "Already registered", balance: userBalances[userId] });
    }

    // Register them and give exact 10 ETB bonus ONE TIME
    registeredUsers[userId] = true;
    userBalances[userId] = 10.00; 
    
    console.log(`New user registered: ${firstName}. Bonus granted.`);

    // Send notification to your Private Telegram Channel for REGISTRATIONS
    try {
        const message = `🚨 *New Player Registered!*\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n📱 Phone: ${phone || 'N/A'}\n💰 Bonus Given: 10 ETB`;
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_REGISTRATION_CHANNEL_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (err) {
        console.error("Failed to send Telegram registration notification");
    }

    res.json({ success: true, balance: userBalances[userId] });
});

// 3. Process Bet (Deduct Money)
app.post('/api/bet', (req, res) => {
    const { userId, betAmount } = req.body;
    
    if (!userBalances[userId] || userBalances[userId] < betAmount) {
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    userBalances[userId] -= betAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 8. Deposit Request with Receipt Image
app.post('/api/deposit/request', async (req, res) => {
    const { userId, firstName, username, paymentMethod, amount, receiptBase64 } = req.body;

    try {
        const message = `💰 *New Deposit Request!*\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n🏦 Method: ${paymentMethod.toUpperCase()}\n💵 Amount: ${amount} ETB`;
        
        // Convert Base64 image back into a file format for Telegram
        const base64Data = receiptBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_DEPOSIT_CHANNEL_ID);
        formData.append('photo', blob, 'receipt.jpg');
        formData.append('caption', message);
        formData.append('parse_mode', 'Markdown');
        
        // Add Interactive Approve/Reject Buttons to the Telegram message!
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
            // THIS WILL NOW SHOW YOU THE EXACT ERROR ON YOUR PHONE!
            return res.status(400).json({ success: false, error: tgResult.description });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Failed to send deposit request", err);
        res.status(500).json({ success: false, error: "Server error processing image" });
    }
});

// 9. Webhook to Handle Telegram Button Clicks (Approve/Reject)
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

                // Give the user their money!
                if (!userBalances[userId]) userBalances[userId] = 0;
                userBalances[userId] += amount;

                // Edit the Telegram message so the buttons disappear
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: msgId,
                        caption: originalCaption + `\n\n✅ *APPROVED* by Admin. ${amount} ETB added!`,
                        parse_mode: 'Markdown'
                    })
                });
            } else if (data.startsWith('dep_no_')) {
                // Just edit the message to say rejected
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: msgId,
                        caption: originalCaption + `\n\n❌ *REJECTED* by Admin.`,
                        parse_mode: 'Markdown'
                    })
                });
            }

            // Tell Telegram the button was clicked so it stops loading
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

// Start the server
app.listen(PORT, () => {
    console.log(`YAF-KENO Backend running on port ${PORT}`);
});