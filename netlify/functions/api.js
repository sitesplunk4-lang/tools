const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Fungsi buat bersihin cookie (buang _|WARNING kalau ada, atau bersihin spasi)
const cleanCookie = (cookie) => {
    if (!cookie) return '';
    let c = cookie.trim();
    // Kalau ada _|WARNING di depan, biarin aja (Roblox butuh ini)
    // Tapi kalau cuma potongan, tetep kita kirim apa adanya.
    return c;
};

const makeHeaders = (cookie) => ({
    'Cookie': `.ROBLOSECURITY=${cleanCookie(cookie)}`,
    'User-Agent': UA,
    'Accept': 'application/json'
});

const router = express.Router();

router.post('/check-cookie', async (req, res) => {
    const { cookie } = req.body;
    // Cek minimal panjang cookie, jangan cek format WARNING
    if (!cookie || cookie.length < 50) {
        return res.status(400).json({ valid: false, error: 'Cookie terlalu pendek / kosong.' });
    }
    
    const headers = makeHeaders(cookie);
    
    try {
        const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers, timeout: 8000 });
        const user = authRes.data;
        
        let robux = null, premium = false, spend = 0;
        try {
            const r = await axios.get(`https://economy.roblox.com/v1/users/${user.id}/currency`, { headers, timeout: 6000 });
            robux = r.data.robux;
        } catch (e) {}
        try {
            const r = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, { headers, timeout: 6000 });
            premium = r.data === true || r.data?.isPremium === true;
        } catch (e) {}
        try {
            const r = await axios.get(`https://economy.roblox.com/v2/users/${user.id}/transaction-totals?timeFrame=Year&transactionType=Summary`, { headers, timeout: 6000 });
            spend = r.data?.purchasesTotal || 0;
        } catch (e) {}

        const detail = await axios.get(`https://users.roblox.com/v1/users/${user.id}`, { headers, timeout: 6000 });
        const created = new Date(detail.data.createdAt);
        const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
        
        let rap = 0, limitedCount = 0, topLimited = [];
        
        try {
            const invRes = await axios.get(`https://inventory.roblox.com/v2/users/${user.id}/inventory/3?limit=100&sortOrder=Desc`, { headers, timeout: 8000 });
            const assets = invRes.data?.data || [];
            
            for (let i = 0; i < assets.length; i += 10) {
                const batch = assets.slice(i, i + 10);
                await Promise.all(batch.map(async (a) => {
                    try {
                        const detRes = await axios.get(`https://economy.roblox.com/v2/assets/${a.assetId}/details`, { headers, timeout: 5000 });
                        const data = detRes.data;
                        
                        if (data.IsLimited || data.IsLimitedUnique) {
                            limitedCount++;
                            const rapRes = await axios.get(`https://economy.roblox.com/v1/assets/${a.assetId}/resale-data`, { headers, timeout: 5000 });
                            const itemRap = rapRes.data?.recentAveragePrice || 0;
                            rap += itemRap;
                            
                            if (topLimited.length < 6) {
                                topLimited.push({
                                    name: data.Name,
                                    rap: itemRap,
                                    image: `https://www.roblox.com/asset-thumbnail/image?assetId=${a.assetId}&width=150&height=150&format=png`
                                });
                            }
                        }
                    } catch (e) {}
                }));
            }
        } catch (e) {}

        let topGames = [];
        try {
            const gamesRes = await axios.get(`https://games.roblox.com/v2/users/${user.id}/games?accessFilter=Public&limit=6&sortOrder=Desc`, { headers, timeout: 8000 });
            const games = gamesRes.data?.data || [];
            topGames = games.map(g => ({
                name: g.name,
                placeId: g.id,
                image: `https://www.roblox.com/place-thumbnails?params=%5B%7B%22placeId%22%3A${g.id}%7D%5D`
            }));
        } catch (e) {}

        res.json({
            valid: true,
            user: { id: user.id, name: user.name, displayName: user.displayName, created: detail.data.createdAt, ageDays, ageYears: (ageDays / 365).toFixed(2), isBanned: detail.data.isBanned || false },
            telemetry: { robux, premium, spend, rap, limitedCount, topLimited, topGames }
        });
    } catch (e) {
        if (e.response && (e.response.status === 401 || e.response.status === 403)) return res.status(401).json({ valid: false, error: 'Cookie tidak valid / expired.' });
        res.status(500).json({ valid: false, error: 'Gagal hubungi Roblox.' });
    }
});

// Mass Check, Refresh, Tax, Lookup, Bypass
router.post('/mass-check', async (req, res) => {
    const { cookies } = req.body;
    if (!Array.isArray(cookies) || cookies.length === 0) return res.status(400).json({ error: 'Kirim array cookies.' });
    if (cookies.length > 30) return res.status(400).json({ error: 'Max 30 cookie.' });
    async function checkOne(cookie) {
        if (!cookie || cookie.length < 50) return { valid: false, error: 'Format invalid' };
        const headers = makeHeaders(cookie);
        try {
            const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers, timeout: 8000 });
            const user = authRes.data;
            let robux = null, premium = false;
            try { const r = await axios.get(`https://economy.roblox.com/v1/users/${user.id}/currency`, { headers, timeout: 6000 }); robux = r.data.robux; } catch (e) {}
            try { const r = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, { headers, timeout: 6000 }); premium = r.data === true || r.data?.isPremium === true; } catch (e) {}
            const detail = await axios.get(`https://users.roblox.com/v1/users/${user.id}`, { headers, timeout: 6000 });
            const ageDays = Math.floor((Date.now() - new Date(detail.data.createdAt).getTime()) / 86400000);
            return { valid: true, username: user.name, displayName: user.displayName, id: user.id, robux, premium, ageDays, isBanned: detail.data.isBanned || false };
        } catch (e) { return { valid: false, error: e.response?.status === 401 ? 'Expired' : (e.message || 'Error') }; }
    }
    const results = [];
    for (let i = 0; i < cookies.length; i += 5) {
        const batch = cookies.slice(i, i + 5);
        const r = await Promise.all(batch.map(checkOne));
        results.push(...r);
    }
    res.json({ total: cookies.length, validCount: results.filter(r => r.valid).length, invalidCount: results.filter(r => !r.valid).length, results });
});

router.post('/refresh-cookie', async (req, res) => {
    const { cookie } = req.body;
    if (!cookie || cookie.length < 50) return res.status(400).json({ error: 'Cookie kosong / terlalu pendek' });
    const headers = { ...makeHeaders(cookie), 'Referer': 'https://www.roblox.com/' };
    try {
        const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers, timeout: 10000 });
        const setCookie = authRes.headers['set-cookie'];
        let newCookie = null;
        if (setCookie) { for (const c of setCookie) { if (c.startsWith('.ROBLOSECURITY=')) { newCookie = c.split(';')[0].replace('.ROBLOSECURITY=', ''); break; } } }
        res.json({ refreshed: true, newCookie: newCookie || cookie, sameAsOld: newCookie === cookie || !newCookie, user: { id: authRes.data.id, name: authRes.data.name, displayName: authRes.data.displayName } });
    } catch (e) { res.status(401).json({ refreshed: false, error: 'Cookie invalid / expired.' }); }
});

router.post('/tax', (req, res) => {
    const { amount, mode } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Jumlah tidak valid' });
    let result;
    if (mode === 'receive') { const price = Math.ceil(amount / 0.7); result = { price, tax: price - amount, net: amount }; } 
    else { const net = Math.floor(amount * 0.7); result = { price: amount, tax: amount - net, net }; }
    res.json(result);
});

router.post('/lookup', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username kosong' });
    try {
        const searchRes = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [username], excludeBannedUsers: false }, { headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, timeout: 10000 });
        const arr = searchRes.data?.data || [];
        if (arr.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
        const u = arr[0];
        const detail = await axios.get(`https://users.roblox.com/v1/users/${u.id}`, { headers: { 'User-Agent': UA }, timeout: 10000 });
        const ageDays = Math.floor((Date.now() - new Date(detail.data.createdAt).getTime()) / 86400000);
        res.json({ id: u.id, name: u.name, displayName: u.displayName, created: detail.data.createdAt, ageDays, description: detail.data.description || '(kosong)', isBanned: detail.data.isBanned || false });
    } catch (e) { res.status(500).json({ error: 'Lookup gagal.' }); }
});

router.post('/bypass-check', async (req, res) => {
    const { cookie, target } = req.body;
    if (!cookie) return res.status(400).json({ error: 'Cookie kosong' });
    const proxyEnv = process.env.PROXY_URL;
    if (!proxyEnv) return res.status(400).json({ error: 'Proxy belum diset.', hint: 'Set env PROXY_URL di Netlify.' });
    const url = new URL(proxyEnv);
    const proxyConfig = { proxy: { host: url.hostname, port: parseInt(url.port), auth: url.username ? { username: url.username, password: url.password } : undefined, protocol: url.protocol.replace(':', '') } };
    try {
        const r = await axios.get(target || 'https://users.roblox.com/v1/users/authenticated', { headers: makeHeaders(cookie), timeout: 15000, ...proxyConfig });
        res.json({ success: true, usedProxy: proxyEnv, status: r.status, data: r.data });
    } catch (e) { res.status(500).json({ success: false, usedProxy: proxyEnv, error: e.response?.status || e.message }); }
});

app.use('/.netlify/functions/api', router);
app.use('/api', router);
module.exports.handler = serverless(app);
