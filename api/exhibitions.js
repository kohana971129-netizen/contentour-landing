// GET /api/exhibitions
// 60_해외전시회DB 테이블의 활성 전시회 목록을 반환합니다.
// CDN 캐싱 1시간 + stale-while-revalidate.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { data, error } = await sb
            .from('60_해외전시회DB')
            .select('id, name, name_en, country, city, venue, field, start_date, end_date')
            .eq('is_active', true)
            .order('country', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;

        // 프론트에서 쓰던 키마(name/country/city/field/v/s/e)와 호환되도록 변환
        const exhibitions = (data || []).map(d => ({
            id: d.id,
            name: d.name,
            country: d.country,
            city: d.city || '',
            field: d.field || '',
            v: d.venue || undefined,
            s: d.start_date || undefined,
            e: d.end_date || undefined
        }));

        // CDN 캐시: 1시간, 24시간 stale-while-revalidate
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        return res.status(200).json({ exhibitions, count: exhibitions.length });
    } catch (e) {
        console.error('Exhibitions API error:', e);
        return res.status(500).json({ error: e.message });
    }
};
