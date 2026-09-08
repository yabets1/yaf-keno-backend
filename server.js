const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '50mb' })); 

let userBalances = {};
let registeredUsers = {};
let userProfiles = {}; 
let globalStats = { deposits: 0, withdrawals: 0, bets: 0, payouts: 0 }; 

const TELEGRAM_BOT_TOKEN = '8817002947:AAHLpPF5F4QH7GNKIaxoxBEv9wOth_TumIk'; 
const TELEGRAM_REGISTRATION_CHANNEL_ID = '-1004345822083'; 
const TELEGRAM_WITHDRAWAL_CHANNEL_ID = '-1003903639876'; 
const TELEGRAM_DEPOSIT_CHANNEL_ID = '-1004338096507';
const ADMIN_TELEGRAM_IDS = ['404211177', '1847040245']; 

// 🔥 CHAPA API CONFIGURATION 🔥
const CHAPA_SECRET_KEY = process.env.CHASECK_TEST-HkFnPN4naYzTQT7pHIeTtpn22rgUhFFO || 'CHASECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const CHAPA_API_URL = 'https://api.chapa.co/v1/transaction/initialize';

// ==========================================
// 1. CHAPA AUTOMATED DEPOSIT INITIALIZATION
// ==========================================
app.post('/api/chapa/deposit', async (req, res) => {
    const { userId, firstName, username, email, amount, phone } = req.body;
    
    if (!amount || parseFloat(amount) < 10) {
        return res.status(400).json({ success: false, error: "Minimum deposit is 10 ETB" });
    }

    const txRef = `brighten-dep-${userId}-${Date.now()}`;

    const chapaPayload = {
        amount: String(amount),
        currency: 'ETB',
        email: email || `${userId}@brighten.bet`,
        first_name: firstName || 'Player',
        last_name: 'Bet',
        phone_number: phone || '0900000000',
        tx_ref: txRef,
        callback_url: `${req.protocol}://${req.get('host')}/api/chapa/webhook`,
        return_url: `https://t.me/BrightenBetBot`,
        customization: {
            title: 'BRIGHTEN.BET Deposit',
            description: 'Instant account funding via Chapa'
        }
    };

    try {
        const chapaRes = await fetch(CHAPA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CHAPA_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(chapaPayload)
        });

        const chapaData = await chapaRes.json();

        if (chapaData.status === 'success') {
            res.json({ success: true, checkout_url: chapaData.data.checkout_url, tx_ref: txRef });
        } else {
            res.status(400).json({ success: false, error: chapaData.message || 'Failed to initialize Chapa payment' });
        }
    } catch (err) {
        console.error("Chapa Initialization Error:", err);
        res.status(500).json({ success: false, error: 'Payment gateway connection error' });
    }
});

// ==========================================
// 2. CHAPA WEBHOOK (Instant automatic deposit fulfillment)
// ==========================================
app.post('/api/chapa/webhook', async (req, res) => {
    const event = req.body;

    if (event.status === 'success' || event.event === 'charge.success') {
        const txRef = event.tx_ref;
        const amountPaid = parseFloat(event.amount);

        const parts = txRef.split('-');
        if (parts.length >= 3) {
            const userId = parts[2];

            if (!userBalances[userId]) userBalances[userId] = 0;
            userBalances[userId] += amountPaid;
            registeredUsers[userId] = true;
            globalStats.deposits += amountPaid;

            try {
                const message = `⚡ <b>Chapa Automated Deposit Success!</b>\n\n🆔 ID: ${userId}\n💵 Amount: ${amountPaid} ETB\n🔗 Ref: <code>${txRef}</code>`;
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: TELEGRAM_DEPOSIT_CHANNEL_ID, text: message, parse_mode: 'HTML' })
                });
            } catch (e) {}
        }
    }

    res.sendStatus(200);
});

app.get('/api/admin/stats/:userId', (req, res) => {
    if (!ADMIN_TELEGRAM_IDS.includes(String(req.params.userId)) && req.params.userId !== 'fallback_user') {
        return res.status(403).json({ error: "Unauthorized." });
    }
    const players = Object.keys(registeredUsers).map(id => ({
        id, balance: userBalances[id] || 0,
        firstName: userProfiles[id]?.firstName || 'Player',
        username: userProfiles[id]?.username || 'N/A',
        phone: userProfiles[id]?.phone || 'N/A'
    }));
    res.json({ totalUsers: Object.keys(registeredUsers).length, todayDeposits: globalStats.deposits, todayWithdrawals: globalStats.withdrawals, totalBets: globalStats.bets, totalPayouts: globalStats.payouts, netRevenue: globalStats.bets - globalStats.payouts, players });
});

app.listen(PORT, () => console.log(`YAF-KENO Backend running on port ${PORT}`));