const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jgeqbdrfpekzuumaklvx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgzODAzNCwiZXhwIjoyMDkwNDE0MDM0fQ.ODEPG-6DGVizArFl5pOHguhGbgTniBaHyA_W81ta9YA'
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

        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        return res.status(200).json(data || []);
    } catch (e) {
        console.error('Cases query error:', e);
        return res.status(500).json({ error: 'Failed to load cases' });
    }
};
