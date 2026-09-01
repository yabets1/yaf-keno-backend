const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// In-memory databases (Resets when free Render server sleeps)
let userBalances = {};
let registeredUsers = {};

// ==========================================
// 🚨 TELEGRAM BOT CREDENTIALS 🚨
// Replace these with your real details!
const TELEGRAM_BOT_TOKEN = '8817002947:AAHLpPF5F4QH7GNKIaxoxBEv9wOth_TumIk'; 
const TELEGRAM_REGISTRATION_CHANNEL_ID = 'ID: -1004345822083'; 
const TELEGRAM_WITHDRAWAL_CHANNEL_ID = 'ID: -1003903639876'; 
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

// 4. Process Win (Add Money)
app.post('/api/win', (req, res) => {
    const { userId, winAmount } = req.body;
    
    if (!userBalances[userId]) userBalances[userId] = 0;
    
    userBalances[userId] += winAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 5. Instant Deposit API (Removed 5-second delay)
app.post('/api/deposit/telebirr-push', (req, res) => {
    const { userId, amount, phone } = req.body;
    
    console.log(`Processing instant deposit for ${phone} for ${amount} ETB...`);

    if (!userBalances[userId]) userBalances[userId] = 0;
    userBalances[userId] += amount;
    
    console.log(`Payment confirmed! Added ${amount} to user ${userId}.`);
    
    res.json({ 
        success: true, 
        newBalance: userBalances[userId]
    });
});

// 6. Telebirr Webhook (Placeholder for real SDK callback)
app.post('/api/telebirr/callback', (req, res) => {
    console.log("Received payment confirmation from Telebirr!");
    res.send("0"); // Tell Telebirr we successfully received the notification
});

// 7. Withdrawal Request (Sends to Telegram)
app.post('/api/withdraw', async (req, res) => {
    const { userId, firstName, username, paymentMethod, accountNumber, amount } = req.body;
    
    if (!registeredUsers[userId]) return res.status(400).json({ error: "Not registered" });
    if (!userBalances[userId] || userBalances[userId] < amount) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    // Deduct balance immediately to prevent double withdrawal
    userBalances[userId] -= amount;

    // Send notification to your Private Telegram Channel for WITHDRAWALS
    try {
        const message = `💸 *New Withdrawal Request!*\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n🏦 Method: ${paymentMethod.toUpperCase()}\n📱 Account No: ${accountNumber}\n💰 Amount: ${amount} ETB`;
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_WITHDRAWAL_CHANNEL_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (err) {
        console.error("Failed to send Telegram withdrawal notification");
    }

    res.json({ success: true, newBalance: userBalances[userId] });
});

// Start the server
app.listen(PORT, () => {
    console.log(`YAF-KENO Backend running on port ${PORT}`);
});