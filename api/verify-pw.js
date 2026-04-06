const crypto = require('crypto');

// SHA-256 hash of the site password (password itself is NOT stored here)
const PASSWORD_HASH = 'b2c6029ad18868353002fd0be04a5f98a5e39134c4a6447b65f28123f3fccfb8';

module.exports = function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
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
