const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jgeqbdrfpekzuumaklvx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { data, error } = await supabase
            .from('52_성과사례')
            .select('*')
            .eq('is_published', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.status(200).json(data || []);
    } catch (e) {
        console.error('Cases query error:', e);
        return res.status(500).json({ error: 'Failed to load cases' });
    }
};
