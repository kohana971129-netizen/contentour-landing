// ══════════════ 공유 상수 & 유틸리티 ══════════════
// 여러 JS 파일에서 중복 정의되던 상수를 통합

window.CT = window.CT || {};

// ── 상태 매핑 ──
CT.SETTLEMENT_STATUS = {
    request: '승인 대기',
    approved: '승인 완료',
    paid: '입금 완료',
    rejected: '반려'
};

CT.CONTRACT_STATUS = {
    pending: '대기',
    confirmed: '확정',
    in_progress: '진행중',
    completed: '완료',
    cancelled: '취소'
};

CT.USER_ROLES = {
    admin: '관리자',
    customer: '고객사',
    interpreter: '통역사',
    member: '회원'
};

// ── 언어 매핑 ──
CT.LANG_MAP = {
    en: '영어', jp: '일본어', zh: '중국어', de: '독일어',
    fr: '프랑스어', es: '스페인어', ru: '러시아어', ar: '아랍어'
};

// ── Supabase 클라이언트 통합 접근 ──
CT.getClient = function() {
    return window.sbClient || null;
};

// ── HTML 이스케이프 ──
CT.escHtml = function(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// ── 날짜 포맷 ──
CT.formatDate = function(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
};

// ── 금액 포맷 ──
CT.formatMoney = function(amount) {
    if (!amount) return '₩0';
    return '₩' + Number(amount).toLocaleString();
};

// ── 상대 시간 ──
CT.timeAgo = function(dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return min + '분 전';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + '시간 전';
    var day = Math.floor(hr / 24);
    if (day < 7) return day + '일 전';
    return CT.formatDate(dateStr);
};

// ── 감사 로그 기록 ──
CT.logAudit = async function(action, targetTable, targetId, details) {
    var sb = CT.getClient();
    if (!sb) return;
    try {
        await sb.rpc('log_audit', {
            p_action: action,
            p_target_table: targetTable || null,
            p_target_id: targetId || null,
            p_details: details || {}
        });
    } catch (e) {
        console.warn('감사 로그 기록 실패:', e);
    }
};
