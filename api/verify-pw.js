const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientIp } = require('../lib/rate-limit');

// SHA-256 hash of the site password (password itself is NOT stored here)
const PASSWORD_HASH = 'b2c6029ad18868353002fd0be04a5f98a5e39134c4a6447b65f28123f3fccfb8';

// rate limit용 service-role 클라이언트 (env 없으면 null → fail-open)
const sb = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient('https://jgeqbdrfpekzuumaklvx.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 무차별 대입 방지 — IP당 분당 15회
    if (!await checkRateLimit(sb, 'pwgate:' + clientIp(req), 15, 60)) {
        return res.status(429).json({ ok: false, error: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.' });
    }

    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ ok: false });
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');

    if (hash === PASSWORD_HASH) {
        return res.status(200).json({ ok: true });
    }

    return res.status(401).json({ ok: false });
};
