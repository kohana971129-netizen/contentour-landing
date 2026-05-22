// 통합 라우터: verify-payment / portone-webhook
// vercel.json rewrites가 옛 URL을 _route 쿼리로 매핑
// 주의: portone-webhook은 raw body로 서명 검증 필요 → bodyParser 비활성

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { emailPaymentCompleteToCustomer, emailPaymentCompleteToInterpreter } = require('../lib/email-templates');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';
const PORTONE_SECRET = process.env.PORTONE_V2_API_SECRET;
const WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

// 두 라우트 모두 raw body 후 분기에서 자체 파싱
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
    return new Promise(function (resolve, reject) {
        let data = '';
        req.on('data', function (chunk) { data += chunk; });
        req.on('end', function () { resolve(data); });
        req.on('error', reject);
    });
}

// ────────────────────────── verify-payment ──────────────────────────
async function handleVerifyPayment(req, res, rawBody) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!SERVICE_KEY || !PORTONE_SECRET) {
        return res.status(500).json({ success: false, error: '서버 설정 오류 (env 누락)' });
    }

    // 호출자 인증
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: '인증 실패' });

    let body;
    try { body = JSON.parse(rawBody || '{}'); }
    catch (e) { return res.status(400).json({ success: false, error: 'Invalid JSON' }); }

    const { paymentId, contractId, paymentType, expectedAmount } = body;
    if (!paymentId || !contractId || !paymentType) {
        return res.status(400).json({ success: false, error: '필수 파라미터 누락' });
    }
    if (!['deposit', 'balance', 'full'].includes(paymentType)) {
        return res.status(400).json({ success: false, error: '유효하지 않은 결제 유형' });
    }
    if (typeof expectedAmount !== 'number' || expectedAmount <= 0) {
        return res.status(400).json({ success: false, error: '유효하지 않은 결제 금액' });
    }

    try {
        const { data: contract, error: cErr } = await sb
            .from('42_통역계약')
            .select('customer_id, interpreter_id, total_amount')
            .eq('id', contractId).single();
        if (cErr || !contract) return res.status(404).json({ success: false, error: '계약을 찾을 수 없습니다.' });
        if (contract.customer_id !== user.id) {
            return res.status(403).json({ success: false, error: '본인 계약만 결제 가능합니다.' });
        }

        const portoneRes = await fetch(
            `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
            { headers: { 'Authorization': `PortOne ${PORTONE_SECRET}` } }
        );
        if (!portoneRes.ok) {
            const errText = await portoneRes.text();
            console.error('PortOne 조회 실패:', portoneRes.status, errText);
            return res.status(502).json({ success: false, error: 'PG 결제 조회 실패' });
        }
        const payment = await portoneRes.json();

        if (payment.status !== 'PAID') {
            return res.status(400).json({
                success: false, error: `결제가 완료되지 않았습니다 (status: ${payment.status})`
            });
        }
        const actualAmount = payment.amount && payment.amount.total;
        if (typeof actualAmount !== 'number' || actualAmount !== expectedAmount) {
            console.error('금액 불일치:', { expected: expectedAmount, actual: actualAmount, paymentId });
            return res.status(400).json({ success: false, error: '결제 금액 불일치' });
        }
        if (payment.currency && payment.currency !== 'KRW') {
            return res.status(400).json({ success: false, error: '결제 통화 불일치' });
        }

        let customData = payment.customData;
        if (typeof customData === 'string') {
            try { customData = JSON.parse(customData); } catch (e) { customData = {}; }
        }
        if (customData && customData.contractId && customData.contractId !== contractId) {
            return res.status(400).json({ success: false, error: 'customData 계약 ID 불일치' });
        }
        if (customData && customData.paymentType && customData.paymentType !== paymentType) {
            return res.status(400).json({ success: false, error: 'customData 결제 유형 불일치' });
        }

        const methodType = payment.method && payment.method.type
            ? String(payment.method.type).toLowerCase() : 'card';
        const { data: rpcResult, error: rpcErr } = await sb.rpc('process_payment', {
            p_contract_id: contractId,
            p_payment_type: paymentType,
            p_amount: actualAmount,
            p_method: methodType,
            p_merchant_uid: payment.id,
            p_imp_uid: payment.id
        });
        if (rpcErr) {
            console.error('process_payment RPC 실패:', rpcErr);
            return res.status(500).json({ success: false, error: '결제 기록 저장 실패' });
        }
        if (rpcResult && rpcResult.success === false) return res.status(400).json(rpcResult);

        // 42_통역계약 결제 상태 서버측 UPDATE (service_role)
        // 클라이언트 직접 UPDATE는 변조 위험이 있어 제거됨 — verify-payment에서만 갱신.
        // process_payment RPC가 이미 수행했더라도 idempotent (같은 값으로 덮어쓰기 = no-op)
        try {
            const nowIso = new Date().toISOString();
            const contractPatch = { updated_at: nowIso };
            if (paymentType === 'deposit' || paymentType === 'full') {
                contractPatch.deposit_status = 'paid';
                contractPatch.deposit_paid_at = nowIso;
                contractPatch.status = 'deposit_paid';
            } else if (paymentType === 'balance') {
                contractPatch.balance_status = 'paid';
                contractPatch.balance_paid_at = nowIso;
                contractPatch.status = 'balance_paid';
            }
            if (Object.keys(contractPatch).length > 1) {
                const { error: ctErr } = await sb.from('42_통역계약')
                    .update(contractPatch)
                    .eq('id', contractId);
                if (ctErr) console.warn('[verify-payment] 42_통역계약 상태 UPDATE 경고 (RPC가 이미 했을 수 있음):', ctErr.message);
            }
        } catch (e) {
            console.warn('[verify-payment] 계약 상태 UPDATE 예외 (무시):', e && e.message);
        }

        // 이메일 발송 (실패해도 결제 결과 영향 없음)
        try {
            const { data: contractFull } = await sb
                .from('42_통역계약')
                .select('customer_id, interpreter_id, exhibition_name, client_company, total_amount')
                .eq('id', contractId).single();
            if (contractFull) {
                let customerEmail = null, customerName = null;
                if (contractFull.customer_id) {
                    const { data: cust } = await sb.from('01_회원').select('email, name').eq('id', contractFull.customer_id).single();
                    if (cust) { customerEmail = cust.email; customerName = cust.name; }
                }
                let interpreterEmail = null, interpreterName = null;
                if (contractFull.interpreter_id) {
                    const { data: itp } = await sb.from('01_회원').select('email, name').eq('id', contractFull.interpreter_id).single();
                    if (itp) { interpreterEmail = itp.email; interpreterName = itp.name; }
                }
                if (customerEmail) {
                    await emailPaymentCompleteToCustomer({
                        customerEmail, customerName,
                        expo: contractFull.exhibition_name,
                        paymentType, amount: actualAmount,
                        totalAmount: contractFull.total_amount
                    });
                }
                if (interpreterEmail) {
                    await emailPaymentCompleteToInterpreter({
                        interpreterEmail, interpreterName,
                        expo: contractFull.exhibition_name,
                        paymentType,
                        customerCompany: contractFull.client_company
                    });
                }
            }
        } catch (mailErr) {
            console.error('[verify-payment] 이메일 발송 단계 오류 (무시):', mailErr && mailErr.message);
        }

        return res.status(200).json(Object.assign({ success: true }, rpcResult || {}));
    } catch (e) {
        console.error('verify-payment 예외:', e);
        return res.status(500).json({ success: false, error: e.message || '결제 검증 실패' });
    }
}

// ────────────────────────── portone-webhook ──────────────────────────
function verifySignature(rawBody, headers, secret) {
    const id = headers['webhook-id'];
    const timestamp = headers['webhook-timestamp'];
    const sigHeader = headers['webhook-signature'];
    if (!id || !timestamp || !sigHeader || !secret) return false;

    const tsNum = parseInt(timestamp, 10);
    if (!Number.isFinite(tsNum)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - tsNum) > 300) return false;

    const payload = id + '.' + timestamp + '.' + rawBody;
    const secretRaw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    let secretBuf;
    try { secretBuf = Buffer.from(secretRaw, 'base64'); }
    catch (e) { secretBuf = Buffer.from(secretRaw, 'utf8'); }

    const expected = crypto.createHmac('sha256', secretBuf).update(payload).digest('base64');

    const sigList = sigHeader.split(' ');
    return sigList.some(function (sig) {
        const parts = sig.split(',');
        if (parts.length !== 2 || parts[0] !== 'v1') return false;
        try {
            const a = Buffer.from(parts[1], 'base64');
            const b = Buffer.from(expected, 'base64');
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch (e) { return false; }
    });
}

async function handleWebhook(req, res, rawBody) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!SERVICE_KEY || !PORTONE_SECRET || !WEBHOOK_SECRET) {
        console.error('Webhook env 누락');
        return res.status(500).json({ error: 'Server config' });
    }

    if (!verifySignature(rawBody, req.headers, WEBHOOK_SECRET)) {
        console.error('PortOne webhook 서명 검증 실패');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    let event;
    try { event = JSON.parse(rawBody); }
    catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    const type = event.type || '';
    const paymentId = event.data && event.data.paymentId;
    if (!paymentId) return res.status(200).json({ ok: true, ignored: true });

    try {
        if (type === 'Transaction.Paid') {
            const portoneRes = await fetch(
                'https://api.portone.io/payments/' + encodeURIComponent(paymentId),
                { headers: { 'Authorization': 'PortOne ' + PORTONE_SECRET } }
            );
            if (!portoneRes.ok) {
                console.error('webhook PortOne 조회 실패:', portoneRes.status);
                return res.status(500).json({ ok: false });
            }
            const payment = await portoneRes.json();
            if (payment.status !== 'PAID') return res.status(200).json({ ok: true, skipped: true });

            let customData = payment.customData;
            if (typeof customData === 'string') {
                try { customData = JSON.parse(customData); } catch (e) { customData = {}; }
            }
            const contractId = customData && customData.contractId;
            const paymentType = (customData && customData.paymentType) || 'deposit';
            if (!contractId) {
                console.error('webhook customData 누락:', paymentId);
                return res.status(200).json({ ok: false, error: 'No contractId' });
            }
            if (!['deposit', 'balance', 'full'].includes(paymentType)) {
                return res.status(200).json({ ok: false, error: 'Invalid paymentType' });
            }

            const methodType = (payment.method && payment.method.type)
                ? String(payment.method.type).toLowerCase() : 'virtual';
            const amount = payment.amount && payment.amount.total;

            const { data: rpcData, error: rpcErr } = await sb.rpc('process_payment', {
                p_contract_id: contractId,
                p_payment_type: paymentType,
                p_amount: amount,
                p_method: methodType,
                p_merchant_uid: payment.id,
                p_imp_uid: payment.id
            });
            if (rpcErr) {
                console.error('webhook process_payment 실패:', rpcErr);
                return res.status(500).json({ ok: false });
            }
            // 중복 처리(이미 client verify-payment로 처리된 결제) 시 메일 발송 생략
            const isDuplicate = rpcData && rpcData.success === false;
            if (!isDuplicate) {
                try {
                    const { data: contractFull } = await sb
                        .from('42_통역계약')
                        .select('customer_id, interpreter_id, exhibition_name, client_company, total_amount')
                        .eq('id', contractId).single();
                    if (contractFull) {
                        let custInfo = null, itpInfo = null;
                        if (contractFull.customer_id) {
                            const r = await sb.from('01_회원').select('email, name').eq('id', contractFull.customer_id).single();
                            custInfo = r.data;
                        }
                        if (contractFull.interpreter_id) {
                            const r = await sb.from('01_회원').select('email, name').eq('id', contractFull.interpreter_id).single();
                            itpInfo = r.data;
                        }
                        if (custInfo && custInfo.email) {
                            await emailPaymentCompleteToCustomer({
                                customerEmail: custInfo.email, customerName: custInfo.name,
                                expo: contractFull.exhibition_name,
                                paymentType, amount,
                                totalAmount: contractFull.total_amount
                            });
                        }
                        if (itpInfo && itpInfo.email) {
                            await emailPaymentCompleteToInterpreter({
                                interpreterEmail: itpInfo.email, interpreterName: itpInfo.name,
                                expo: contractFull.exhibition_name,
                                paymentType,
                                customerCompany: contractFull.client_company
                            });
                        }
                    }
                } catch (mailErr) {
                    console.error('[webhook] 이메일 발송 단계 오류 (무시):', mailErr && mailErr.message);
                }
            } else {
                console.log('[webhook] 결제 중복 — 메일 발송 생략 (client verify-payment에서 이미 처리)');
            }
        }
        else if (type === 'Transaction.Cancelled' || type === 'Transaction.PartialCancelled') {
            await sb.from('47_결제기록')
                .update({
                    status: 'refunded',
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('imp_uid', paymentId);
        }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('portone-webhook 예외:', e);
        return res.status(200).json({ ok: false, error: e.message });
    }
}

// ────────────────────────── 디스패처 ──────────────────────────
module.exports = async function handler(req, res) {
    let rawBody;
    try { rawBody = await readRawBody(req); }
    catch (e) { return res.status(400).json({ error: 'Invalid body' }); }

    const route = req.query._route || '';
    switch (route) {
        case 'verify-payment': return handleVerifyPayment(req, res, rawBody);
        case 'portone-webhook': return handleWebhook(req, res, rawBody);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
