// ════════════════════════════════════════════════════════════
// Vercel Cron — 적립금 만료 자동 처리 (12개월 정책)
// 매일 자정(KST) 실행 → expire_loyalty_points RPC 호출
// ════════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    // Vercel Cron 헤더 검증 (외부에서 임의 호출 방지)
    const authHeader = req.headers['authorization'] || '';
    const cronSecret = process.env.CRON_SECRET || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    try {
        const start = Date.now();
        const { data, error } = await supabase.rpc('expire_loyalty_points');

        if (error) {
            console.error('[cron-loyalty-expire] RPC 실패:', error.message);
            return res.status(500).json({ error: error.message });
        }

        const result = (data && data[0]) || { processed_users: 0, total_expired: 0 };
        const elapsed = Date.now() - start;

        console.log(`[cron-loyalty-expire] 완료: ${result.processed_users}명 / ${result.total_expired}P 만료 / ${elapsed}ms`);

        return res.status(200).json({
            ok: true,
            processed_users: result.processed_users || 0,
            total_expired: result.total_expired || 0,
            elapsed_ms: elapsed,
            ran_at: new Date().toISOString()
        });
    } catch (e) {
        console.error('[cron-loyalty-expire] 예외:', e);
        return res.status(500).json({ error: e.message || 'unknown error' });
    }
};
