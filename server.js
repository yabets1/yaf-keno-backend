const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// This allows your Vercel frontend to talk to this Render backend
app.use(cors({
    origin: '*', // We will change this later to your exact Vercel URL for security
    methods: ['GET', 'POST']
}));

// Allows the server to read JSON data sent from the frontend
app.use(express.json());

// In a real app, this would be a real PostgreSQL database. 
// For now, we are storing it in memory just to get Render working.
let userBalances = {
    'user123': 100.00 
};

// --- API ROUTES ---

// 1. Get Balance
app.get('/api/balance/:userId', (req, res) => {
    const userId = req.params.userId;
    const balance = userBalances[userId] || 0;
    res.json({ balance: balance });
});

// 2. Place a Bet (Subtract money)
app.post('/api/bet', (req, res) => {
    const { userId, betAmount } = req.body;
    
    if (!userBalances[userId] || userBalances[userId] < betAmount) {
        return res.status(400).json({ error: "Insufficient funds" });
    }

    userBalances[userId] -= betAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// 3. Win Money (Add money)
app.post('/api/win', (req, res) => {
    const { userId, winAmount } = req.body;
    
    if (!userBalances[userId]) userBalances[userId] = 0;
    
    userBalances[userId] += winAmount;
    res.json({ success: true, newBalance: userBalances[userId] });
});

// Start the server
app.listen(PORT, () => {
    console.log(`YAF-KENO Backend running on port ${PORT}`);
});