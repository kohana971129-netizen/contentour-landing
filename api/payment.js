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
        // 결제 컬럼 모두 조회 — 서버에서 expected amount 재계산 (클라이언트 expectedAmount 신뢰 X)
        const { data: contract, error: cErr } = await sb
            .from('42_통역계약')
            .select('customer_id, interpreter_id, total_amount, deposit_amount, balance_amount, deposit_status, balance_status')
            .eq('id', contractId).single();
        if (cErr || !contract) return res.status(404).json({ success: false, error: '계약을 찾을 수 없습니다.' });
        if (contract.customer_id !== user.id) {
            return res.status(403).json({ success: false, error: '본인 계약만 결제 가능합니다.' });
        }

        // ── 서버에서 paymentType별 정확한 금액 재계산 (클라이언트 메모리 변조 방어) ──
        let serverExpected = null;
        if (paymentType === 'full') {
            serverExpected = Number(contract.total_amount) || 0;
        } else if (paymentType === 'deposit') {
            // A안 100% 선결제: deposit_amount가 비어있으면 total_amount 전액
            serverExpected = Number(contract.deposit_amount || contract.total_amount) || 0;
        } else if (paymentType === 'balance') {
            serverExpected = Number(contract.balance_amount) || 0;
        }
        if (serverExpected <= 0) {
            return res.status(400).json({ success: false, error: '계약에 결제할 금액이 없습니다.' });
        }
        // 클라이언트가 보낸 expectedAmount 검증 (서버 계산과 불일치 = 변조 의심)
        if (expectedAmount !== serverExpected) {
            console.error('[verify-payment] 클라이언트 expectedAmount 불일치 (변조 의심):', {
                contractId, paymentType,
                clientExpected: expectedAmount,
                serverExpected
            });
            return res.status(400).json({ success: false, error: '계약 금액과 일치하지 않습니다.' });
        }
        // 중복 결제 차단 (이미 paid 상태에서 재결제 시도)
        if ((paymentType === 'deposit' || paymentType === 'full') && contract.deposit_status === 'paid') {
            return res.status(400).json({ success: false, error: '이미 선결제가 완료된 계약입니다.' });
        }
        if (paymentType === 'balance' && contract.balance_status === 'paid') {
            return res.status(400).json({ success: false, error: '이미 잔금이 완료된 계약입니다.' });
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
        // PortOne 실제 결제 금액도 서버 계약 금액과 일치해야 함 (이중 방어 — 클라이언트가 expected까지 조작해도 차단)
        if (typeof actualAmount !== 'number' || actualAmount !== serverExpected) {
            console.error('[verify-payment] PortOne actualAmount 불일치 (변조/저액결제 의심):', {
                contractId, paymentType, paymentId,
                actualAmount, serverExpected
            });
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
        if (rpcResult && rpcResult.success === false) {
            // 중복 처리일 수 있음 — webhook(Transaction.Paid)이 먼저 결제를 확정하면 RPC는 success:false를 반환한다.
            // 계약의 해당 결제 상태가 이미 paid면 성공으로 간주(멱등) → 고객에게 거짓 "결제 실패" 표시 방지.
            const { data: recheck } = await sb
                .from('42_통역계약')
                .select('deposit_status, balance_status')
                .eq('id', contractId).single();
            const alreadyPaid = recheck && (
                ((paymentType === 'deposit' || paymentType === 'full') && recheck.deposit_status === 'paid') ||
                (paymentType === 'balance' && recheck.balance_status === 'paid')
            );
            if (alreadyPaid) return res.status(200).json({ success: true, alreadyProcessed: true });
            return res.status(400).json(rpcResult);
        }

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
            const nowIso = new Date().toISOString();
            await sb.from('47_결제기록')
                .update({
                    status: 'refunded',
                    cancelled_at: nowIso,
                    updated_at: nowIso
                })
                .eq('imp_uid', paymentId);

            // 전액 취소(부분취소 제외)인 경우, 계약이 "결제됨"으로 남는 불일치 방지를 위해
            // 해당 결제 상태와 계약 상태도 함께 되돌린다. (PortOne 측 직접 취소 등 admin 취소 흐름을 거치지 않은 경우 대비)
            if (type === 'Transaction.Cancelled') {
                try {
                    const { data: payRec } = await sb.from('47_결제기록')
                        .select('contract_id, payment_type')
                        .eq('imp_uid', paymentId)
                        .limit(1).single();
                    if (payRec && payRec.contract_id) {
                        const patch = { status: 'cancelled', cancelled_at: nowIso, updated_at: nowIso };
                        if (payRec.payment_type === 'deposit' || payRec.payment_type === 'full') {
                            patch.deposit_status = 'cancelled';
                            patch.deposit_paid_at = null;
                        } else if (payRec.payment_type === 'balance') {
                            patch.balance_status = 'cancelled';
                            patch.balance_paid_at = null;
                        }
                        await sb.from('42_통역계약').update(patch).eq('id', payRec.contract_id);
                    }
                } catch (e) {
                    console.warn('[webhook] 전액 취소 시 계약 상태 복원 경고 (무시):', e && e.message);
                }
            }
        }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('portone-webhook 예외:', e);
        return res.status(200).json({ ok: false, error: e.message });
    }
}

// ────────────────────────── manual-transfer-request (고객 무통장 신청) ──────────────────────────
async function handleManualTransferRequest(req, res, rawBody) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!SERVICE_KEY) return res.status(500).json({ success: false, error: '서버 설정 오류 (env 누락)' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: '인증 실패' });

    let body;
    try { body = JSON.parse(rawBody || '{}'); }
    catch (e) { return res.status(400).json({ success: false, error: 'Invalid JSON' }); }

    const { contractId, paymentType } = body;
    const holder = String(body.depositorName || '').trim().slice(0, 100);
    if (!contractId || !paymentType) return res.status(400).json({ success: false, error: '필수 파라미터 누락' });
    if (!['deposit', 'full'].includes(paymentType)) return res.status(400).json({ success: false, error: '유효하지 않은 결제 유형' });
    if (!holder) return res.status(400).json({ success: false, error: '입금자명을 입력해주세요.' });

    try {
        const { data: contract, error: cErr } = await sb
            .from('42_통역계약')
            .select('customer_id, exhibition_name, client_company, total_amount, deposit_amount, deposit_status')
            .eq('id', contractId).single();
        if (cErr || !contract) return res.status(404).json({ success: false, error: '계약을 찾을 수 없습니다.' });
        if (contract.customer_id !== user.id) return res.status(403).json({ success: false, error: '본인 계약만 신청 가능합니다.' });
        if (contract.deposit_status === 'paid') return res.status(400).json({ success: false, error: '이미 결제가 완료된 계약입니다.' });

        // 금액은 서버에서 계약 기준으로 산정 (A안 100% 선결제)
        const amount = Number(contract.deposit_amount || contract.total_amount) || 0;
        if (amount <= 0) return res.status(400).json({ success: false, error: '계약에 결제할 금액이 없습니다.' });

        // 중복 신청 방지
        const { data: existing } = await sb.from('47_결제기록')
            .select('id').eq('contract_id', contractId).eq('pg_provider', 'manual').eq('status', 'manual_pending').limit(1);
        if (existing && existing.length) {
            return res.status(200).json({ success: true, status: 'manual_pending', duplicate: true });
        }

        const merchantUid = 'MANUAL_' + contractId + '_' + Date.now();
        const { error: insErr } = await sb.from('47_결제기록').insert({
            contract_id: contractId,
            customer_id: user.id,
            payment_type: paymentType,
            amount: amount,
            method: 'transfer',
            pg_provider: 'manual',
            status: 'manual_pending',
            merchant_uid: merchantUid,
            metadata: { depositor_name: holder, requested_at: new Date().toISOString() }
        });
        if (insErr) { console.error('manual-transfer-request insert 실패:', insErr); return res.status(500).json({ success: false, error: '신청 저장 실패' }); }

        // 관리자 전원 알림
        try {
            const { data: admins } = await sb.from('01_회원').select('id').eq('role', 'admin');
            if (admins && admins.length) {
                const rows = admins.map(function (a) {
                    return {
                        user_id: a.id, notification_type: 'service',
                        title: '💸 무통장 입금 신청',
                        message: (contract.client_company || '고객사') + ' · ' + (contract.exhibition_name || '계약') + ' · ' + amount.toLocaleString() + '원 (입금자: ' + holder + ') — 입금 확인 후 승인해주세요.',
                        is_read: false
                    };
                });
                await sb.from('24_알림').insert(rows);
            }
        } catch (e) { console.error('manual-transfer 관리자 알림 실패(무시):', e && e.message); }

        return res.status(200).json({ success: true, status: 'manual_pending' });
    } catch (e) {
        console.error('manual-transfer-request 예외:', e);
        return res.status(500).json({ success: false, error: e.message || '오류' });
    }
}

// ────────────────────────── manual-transfer-confirm (관리자 승인/반려) ──────────────────────────
async function handleManualTransferConfirm(req, res, rawBody) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!SERVICE_KEY) return res.status(500).json({ success: false, error: '서버 설정 오류 (env 누락)' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: '인증 실패' });
    const { data: profile } = await sb.from('01_회원').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });

    let body;
    try { body = JSON.parse(rawBody || '{}'); }
    catch (e) { return res.status(400).json({ success: false, error: 'Invalid JSON' }); }

    const { paymentRecordId, action } = body;
    if (!paymentRecordId || !['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: '필수 파라미터 누락' });

    try {
        const { data: rec, error: rErr } = await sb.from('47_결제기록')
            .select('id, contract_id, customer_id, amount, pg_provider, status')
            .eq('id', paymentRecordId).single();
        if (rErr || !rec) return res.status(404).json({ success: false, error: '결제 신청을 찾을 수 없습니다.' });
        if (rec.pg_provider !== 'manual') return res.status(400).json({ success: false, error: '무통장 신청이 아닙니다.' });
        if (rec.status !== 'manual_pending') return res.status(400).json({ success: false, error: '이미 처리된 신청입니다.' });

        const nowIso = new Date().toISOString();

        if (action === 'approve') {
            const patch = { deposit_status: 'paid', deposit_paid_at: nowIso, status: 'deposit_paid', updated_at: nowIso };
            const { error: upErr } = await sb.from('42_통역계약').update(patch).eq('id', rec.contract_id);
            if (upErr) { console.error('manual approve 계약 update 실패:', upErr); return res.status(500).json({ success: false, error: '계약 갱신 실패' }); }
            await sb.from('47_결제기록').update({ status: 'paid', paid_at: nowIso, updated_at: nowIso }).eq('id', rec.id);
            try {
                await sb.from('24_알림').insert({
                    user_id: rec.customer_id, notification_type: 'service',
                    title: '✅ 입금 확인 완료',
                    message: '무통장 입금이 확인되어 결제가 완료되었습니다. (' + (Number(rec.amount) || 0).toLocaleString() + '원)',
                    is_read: false
                });
            } catch (e) {}
            return res.status(200).json({ success: true, action: 'approve' });
        } else {
            const why = String(body.reason || '').trim().slice(0, 500);
            await sb.from('47_결제기록').update({ status: 'rejected', cancelled_at: nowIso, cancel_reason: why || '입금 미확인', updated_at: nowIso }).eq('id', rec.id);
            try {
                await sb.from('24_알림').insert({
                    user_id: rec.customer_id, notification_type: 'service',
                    title: '⚠️ 무통장 입금 미확인',
                    message: '무통장 입금 신청이 반려되었습니다.' + (why ? ' 사유: ' + why : ' 입금 내역 확인 후 다시 신청해주세요.'),
                    is_read: false
                });
            } catch (e) {}
            return res.status(200).json({ success: true, action: 'reject' });
        }
    } catch (e) {
        console.error('manual-transfer-confirm 예외:', e);
        return res.status(500).json({ success: false, error: e.message || '오류' });
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
        case 'manual-transfer-request': return handleManualTransferRequest(req, res, rawBody);
        case 'manual-transfer-confirm': return handleManualTransferConfirm(req, res, rawBody);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
