const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// In-memory database
let userBalances = {};

// --- API ROUTES ---

// 1. Get Balance (and create new users)
app.get('/api/balance/:userId', (req, res) => {
    const userId = req.params.userId;
    
    // If this Telegram ID doesn't exist yet, give them a 50 ETB welcome bonus!
    if (userBalances[userId] === undefined) {
        userBalances[userId] = 50.00;
        console.log(`New user registered: ${userId}. Bonus granted.`);
    }
    
    res.json({ balance: userBalances[userId] });
});

// 2. Place a Bet
app.post('/api/bet', (req, res) => {
    const { userId, betAmount } = req.body;
    
    if (userBalances[userId] === undefined || userBalances[userId] < betAmount) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    userBalances[userId] -= betAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 3. Win Money
app.post('/api/win', (req, res) => {
    const { userId, winAmount } = req.body;
    
    if (userBalances[userId] === undefined) userBalances[userId] = 0;
    
    userBalances[userId] += winAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

app.listen(PORT, () => {
    console.log(`YAF-KENO Backend running on port ${PORT}`);
});