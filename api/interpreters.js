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
            .from('40_통역사프로필')
            .select('user_id, display_name, languages, specialties, experience_years, intro, profile_image_url, country_code, field_tag, cases_count, rating, satisfaction, rate_by_type, is_active')
            .eq('is_active', true);

        if (error) throw error;

        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        return res.status(200).json(data || []);
    } catch (e) {
        console.error('Interpreter query error:', e);
        return res.status(500).json({ error: 'Failed to load interpreters' });
    }
};
