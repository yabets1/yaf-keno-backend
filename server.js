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
const TELEGRAM_CHANNEL_ID = 'ID: -1004345822083'; 
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

// 2. Register New User
app.post('/api/register', async (req, res) => {
    const { userId, firstName, username, phone } = req.body;
    
    if (registeredUsers[userId]) {
        return res.status(400).json({ error: "Already registered" });
    }

    // Register them and give exact 10 ETB bonus ONE TIME
    registeredUsers[userId] = true;
    userBalances[userId] = 10.00; 
    
    console.log(`New user registered: ${firstName}. Bonus granted.`);

    // Send notification to your Private Telegram Channel
    try {
        const message = `🚨 *New Player Registered!*\n\n👤 Name: ${firstName}\n🔗 Username: @${username || 'N/A'}\n🆔 ID: ${userId}\n📱 Phone: ${phone || 'N/A'}\n💰 Bonus Given: 10 ETB`;
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHANNEL_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (err) {
        console.error("Failed to send Telegram notification");
    }

    res.json({ success: true, balance: userBalances[userId] });
});

// 3. Place a Bet
app.post('/api/bet', (req, res) => {
    const { userId, betAmount } = req.body;
    if (!registeredUsers[userId]) return res.status(400).json({ error: "Not registered" });
    if (userBalances[userId] < betAmount) return res.status(400).json({ error: "Insufficient funds" });

    userBalances[userId] -= betAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 4. Win Money
app.post('/api/win', (req, res) => {
    const { userId, winAmount } = req.body;
    if (!registeredUsers[userId]) return res.status(400).json({ error: "Not registered" });
    
    userBalances[userId] += winAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 5. Telebirr Push Notification Payment Simulation
app.post('/api/deposit/telebirr-push', async (req, res) => {
    const { userId, amount, phone } = req.body;
    
    setTimeout(() => {
        if (!registeredUsers[userId]) return res.status(400).json({ error: "Not registered" });
        userBalances[userId] += amount;
        res.json({ success: true, newBalance: userBalances[userId] });
    }, 5000); 
});

// Start the server
app.listen(PORT, () => {
    console.log(`YAF-KENO Backend running on port ${PORT}`);
});