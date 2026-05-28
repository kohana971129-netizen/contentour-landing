// ════════════════════════════════════════════════════════════════
// 서버리스(Vercel) 환경용 rate limit.
// 인메모리는 인스턴스마다 따로라 무용 → Postgres(Supabase) 기반 check_rate_limit RPC 사용.
// RPC 미적용/오류 시 fail-open(통과)하여 가용성 우선 (차단은 부가 방어선).
// migration-rate-limit.sql 적용 후 활성화됨.
// ════════════════════════════════════════════════════════════════

// true = 허용, false = 차단(한도 초과)
async function checkRateLimit(sb, key, max, windowSeconds) {
    if (!sb) return true;
    try {
        const { data, error } = await sb.rpc('check_rate_limit', {
            p_key: String(key).slice(0, 200),
            p_max: max,
            p_window_seconds: windowSeconds
        });
        if (error) { console.warn('[rate-limit] RPC 오류 (통과 처리):', error.message); return true; }
        return data === true;
    } catch (e) {
        console.warn('[rate-limit] 예외 (통과 처리):', e && e.message);
        return true;
    }
}

// 프록시 헤더에서 클라이언트 IP 추출 (Vercel은 x-forwarded-for 설정)
function clientIp(req) {
    const xff = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
    return String(xff).split(',')[0].trim() || 'unknown';
}

module.exports = { checkRateLimit, clientIp };
