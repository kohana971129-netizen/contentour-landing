// ══════════════ 국가별 통역사 네트워크 ══════════════
// index.html에서 support.html로 이동됨

const interpData = {
    us: { country: '미국', flag: 'us', lang: '영어 (English)', link: 'interpreters.html?country=us', interpreters: [] },
    jp: { country: '일본', flag: 'jp', lang: '일본어 (日本語)', link: 'interpreters.html?country=jp', interpreters: [] },
    cn: { country: '중국', flag: 'cn', lang: '중국어 (中文)', link: 'interpreters.html?country=cn', interpreters: [] },
    de: { country: '독일', flag: 'de', lang: '독일어 (Deutsch)', link: 'interpreters.html?country=de', interpreters: [] },
    vn: { country: '베트남', flag: 'vn', lang: '베트남어 (Tiếng Việt)', link: 'interpreters.html?country=vn', interpreters: [] },
    ae: { country: '아랍에미레이트', flag: 'ae', lang: '아랍어 (العربية)', link: 'interpreters.html?country=ae', interpreters: [] },
    th: { country: '태국', flag: 'th', lang: '태국어 (ภาษาไทย)', link: 'interpreters.html?country=th', interpreters: [] }
};

function fmtPrice(arr) {
    var v = Array.isArray(arr) ? arr[0] : arr;
    return '₩' + v.toLocaleString() + '~';
}

var avatarGradients = [
    ['#1565c0','#42a5f5'], ['#0d47a1','#1e88e5'], ['#e65100','#ff9800'],
    ['#2e7d32','#66bb6a'], ['#6a1b9a','#ab47bc'], ['#c62828','#ef5350'],
    ['#00838f','#4dd0e1'], ['#4e342e','#8d6e63'], ['#283593','#5c6bc0'],
    ['#00695c','#26a69a'], ['#ad1457','#ec407a'], ['#37474f','#78909c']
];

function getInitial(name) {
    if (!name) return '?';
    return name.replace(/\s/g, '').charAt(0);
}

function avatarHtml(photo, name, size) {
    size = size || 68;
    if (photo && photo.startsWith('http')) return '<img src="' + photo + '" alt="' + name + '" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.15);" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<div style=&quot;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:linear-gradient(145deg,#1565c0,#42a5f5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:' + Math.round(size * 0.38) + 'px;border:3px solid #fff;&quot;>' + getInitial(name) + '</div>\'">';
    var idx = 0;
    for (var i = 0; i < name.length; i++) idx += name.charCodeAt(i);
    var grad = avatarGradients[idx % avatarGradients.length];
    var fs = Math.round(size * 0.38);
    var shadow = 'box-shadow:0 4px 14px ' + grad[0] + '40;';
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:linear-gradient(145deg,' + grad[0] + ',' + grad[1] + ');display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:' + fs + 'px;letter-spacing:-1px;border:3px solid #fff;' + shadow + '">' + getInitial(name) + '</div>';
}

var row1 = ['jp', 'cn', 'de', 'vn'];
var row2 = ['us', 'ae', 'th'];
var currentOpen = null;
var _dbLoaded = false;
var _dbLoadPromise = null;

function toggleInterp(code, cardEl) {
    // DB 통역사 로드 완료 전이면 대기 후 재실행
    if (!_dbLoaded && _dbLoadPromise) {
        _dbLoadPromise.then(function() { toggleInterp(code, cardEl); });
        return;
    }
    var isRow1 = row1.includes(code);
    var panel = document.getElementById(isRow1 ? 'interpPanel' : 'interpPanel2');
    var otherPanel = document.getElementById(isRow1 ? 'interpPanel2' : 'interpPanel');

    if (otherPanel && otherPanel.classList.contains('open')) {
        otherPanel.classList.remove('open');
        document.querySelectorAll('.country-card.active').forEach(function (c) {
            var cc = c.dataset.country;
            if (cc && (isRow1 ? row2 : row1).includes(cc)) c.classList.remove('active');
        });
    }

    if (currentOpen === code) {
        panel.classList.remove('open');
        cardEl.classList.remove('active');
        currentOpen = null;
        return;
    }

    var sameRow = isRow1 ? row1 : row2;
    document.querySelectorAll('.country-card.active').forEach(function (c) {
        var cc = c.dataset.country;
        if (cc && sameRow.includes(cc)) c.classList.remove('active');
    });

    var d = interpData[code];
    if (!d) return;

    cardEl.classList.add('active');
    currentOpen = code;

    panel.innerHTML =
        '<div class="interp-panel__head">' +
            '<div class="interp-panel__title">' +
                '<img src="https://flagcdn.com/w40/' + d.flag + '.png" srcset="https://flagcdn.com/w80/' + d.flag + '.png 2x" alt="' + d.country + '">' +
                '<span>' + d.country + ' 전문 통역사</span>' +
                '<em>' + d.lang + '</em>' +
            '</div>' +
            '<button class="interp-panel__close" onclick="closeInterp(\'' + code + '\')" aria-label="통역사 패널 닫기">&times;</button>' +
        '</div>' +
        '<div class="interp-panel__grid">' +
        (d.interpreters.length === 0 ?
            '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#8a95a8;">' +
                '<div style="font-size:2rem;margin-bottom:10px;">🔍</div>' +
                '<div style="font-weight:700;margin-bottom:6px;">' + d.country + ' 통역사를 모집 중입니다</div>' +
                '<div style="font-size:0.85rem;">현재 등록된 통역사가 없습니다.<br><a href="interpreter-apply.html" style="color:#1565c0;font-weight:600;">통역사 지원하기 &rarr;</a></div>' +
            '</div>' : '') +
            d.interpreters.map(function (p, idx) {
                return '<div class="ip-card" onclick="event.stopPropagation();openIpModal(\'' + code + '\',' + idx + ')">' +
                    '<div class="ip-card__top">' +
                        '<div class="ip-card__avatar">' + avatarHtml(p.photo, p.name, 56) + '</div>' +
                        '<div>' +
                            '<div class="ip-card__name">' + p.name + '</div>' +
                            '<div class="ip-card__role">' + p.role + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ip-card__intro">' + p.intro + '</div>' +
                    '<div class="ip-card__tags">' +
                        p.tags.map(function (t) { return '<span class="ip-card__tag">' + t + '</span>'; }).join('') +
                        '<span class="ip-card__tag field">' + p.fieldTag + '</span>' +
                    '</div>' +
                    '<div class="ip-card__price">' +
                        '<span class="ip-card__price-label">부스 통역</span>' +
                        '<span class="ip-card__price-value">' + fmtPrice(p.prices.booth) + '</span>' +
                        '<span class="ip-card__price-unit">/일</span>' +
                    '</div>' +
                    '<div class="ip-card__stats">' +
                        '<div class="ip-card__stat"><div class="ip-card__stat-num">' + p.cases + '</div><div class="ip-card__stat-label">파견 건수</div></div>' +
                        '<div class="ip-card__stat"><div class="ip-card__stat-num">' + p.rating + '</div><div class="ip-card__stat-label">평점</div></div>' +
                        '<div class="ip-card__stat"><div class="ip-card__stat-num">' + p.years + '년</div><div class="ip-card__stat-label">경력</div></div>' +
                    '</div>' +
                '</div>';
            }).join('') +
        '</div>' +
        '<div class="interp-panel__more">' +
            '<a href="interpreters.html?country=' + code + '">' + d.country + ' 통역사 전체 보기 &rarr;</a>' +
        '</div>';

    panel.classList.remove('open');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            panel.classList.add('open');
            setTimeout(function () { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
        });
    });
}

function closeInterp(code) {
    var isRow1 = row1.includes(code);
    var panel = document.getElementById(isRow1 ? 'interpPanel' : 'interpPanel2');
    if (panel) panel.classList.remove('open');
    document.querySelectorAll('.country-card.active').forEach(function (c) { c.classList.remove('active'); });
    currentOpen = null;
}

// ══════════════ 통역사 상세 모달 ══════════════
function openIpModal(countryCode, idx) {
    var d = interpData[countryCode];
    if (!d) return;
    var p = d.interpreters[idx];
    if (!p) return;

    document.getElementById('ipModalHeader').innerHTML =
        '<button class="ip-modal__close" onclick="closeIpModal()" aria-label="통역사 상세 닫기">&times;</button>' +
        '<div class="ip-modal__photo">' + avatarHtml(p.photo, p.name, 90) + '</div>' +
        '<div class="ip-modal__header-info">' +
            '<div class="ip-modal__name">' + p.name + '</div>' +
            '<div class="ip-modal__role-text">' + p.role + '</div>' +
            '<div class="ip-modal__flag"><img src="https://flagcdn.com/w40/' + d.flag + '.png" alt="' + d.country + '"> ' + d.country + ' · ' + d.lang + '</div>' +
        '</div>';

    var html = '';
    html += '<div class="ip-modal__stats"><div class="ip-modal__stat"><div class="ip-modal__stat-num">' + p.years + '년</div><div class="ip-modal__stat-label">통역 경력</div></div><div class="ip-modal__stat"><div class="ip-modal__stat-num">' + p.cases + '건</div><div class="ip-modal__stat-label">파견 실적</div></div><div class="ip-modal__stat"><div class="ip-modal__stat-num">' + p.rating + '</div><div class="ip-modal__stat-label">평점</div></div><div class="ip-modal__stat"><div class="ip-modal__stat-num">' + p.satisfaction + '%</div><div class="ip-modal__stat-label">만족도</div></div></div>';
    html += '<div class="ip-modal__section"><div class="ip-modal__section-title">소개</div><div class="ip-modal__bio">' + p.bio + '</div></div>';
    html += '<div class="ip-modal__section"><div class="ip-modal__section-title">전문 분야</div><div class="ip-modal__tags">' + p.tags.map(function (t) { return '<span class="ip-modal__tag">' + t + '</span>'; }).join('') + '<span class="ip-modal__tag field">' + p.fieldTag + '</span></div></div>';
    html += '<div class="ip-modal__section"><div class="ip-modal__section-title">통역 단가 (1일 기준)</div><div class="ip-modal__price-table"><div class="ip-modal__price-row"><span class="ip-modal__price-type">🎯 부스 상주 통역</span><span class="ip-modal__price-val">' + fmtPrice(p.prices.booth) + '<small>/일</small></span></div><div class="ip-modal__price-row"><span class="ip-modal__price-type">🤝 미팅 동행 통역</span><span class="ip-modal__price-val">' + fmtPrice(p.prices.meeting) + '<small>/일</small></span></div><div class="ip-modal__price-row"><span class="ip-modal__price-type">🎤 컨퍼런스 통역</span><span class="ip-modal__price-val">' + fmtPrice(p.prices.conference) + '<small>/일</small></span></div><div class="ip-modal__price-row"><span class="ip-modal__price-type">⚡ 현장 운영 지원</span><span class="ip-modal__price-val">' + fmtPrice(p.prices.operation) + '<small>/일</small></span></div></div><div class="ip-modal__price-note">* 표시 금액은 기본 단가 범위이며, 전시 규모·기간·전문성에 따라 추가 금액이 발생할 수 있습니다.</div></div>';
    html += '<div class="ip-modal__section"><div class="ip-modal__section-title">주요 전시회 통역 경력</div><div class="ip-modal__history">' + (p.history || []).map(function (h) { return '<div class="ip-modal__history-item"><span class="ip-modal__history-year">' + h.year + '</span><div><div class="ip-modal__history-text">' + h.text + '</div><div class="ip-modal__history-sub">' + h.sub + '</div></div></div>'; }).join('') + '</div></div>';
    html += '<div class="ip-modal__cta" id="ipCtaArea"><button class="ip-modal__cta-btn" onclick="checkLoginAndInquiry(\'' + p.name.replace(/'/g, "\\'") + '\',\'' + d.lang.replace(/'/g, "\\'") + '\',\'' + (p.fieldTag || '').replace(/'/g, "\\'") + '\',\'' + d.country.replace(/'/g, "\\'") + '\',\'' + (p.photo || '').replace(/'/g, "\\'") + '\',\'' + (p.role || '').replace(/'/g, "\\'") + '\')">이 통역사에게 직접 견적 의뢰</button></div>';

    document.getElementById('ipModalBody').innerHTML = html;
    document.getElementById('ipModalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

// 로그인 상태 캐시
var _cachedUser = null;

async function checkLoginAndInquiry(name, lang, field, country, photo, role) {
    // 로그인 여부 확인
    if (window.sbClient) {
        try {
            var sess = await window.sbClient.auth.getSession();
            if (sess.data.session) {
                _cachedUser = sess.data.session;
                // 회원 정보 가져오기
                var profile = await window.ContentourAuth.getUserProfile();
                if (profile) {
                    _cachedUser._profile = profile;
                }
                showDirectInquiry(name, lang, field, country, photo, role);
                return;
            }
        } catch (e) { console.warn('세션 확인 실패:', e); }
    }
    // 비로그인 → 로그인 안내
    var area = document.getElementById('ipCtaArea');
    if (!area) return;
    area.innerHTML = '<div style="text-align:center;padding:20px;">' +
        '<div style="font-size:1.1rem;font-weight:700;margin-bottom:8px;color:#333;">로그인이 필요합니다</div>' +
        '<div style="font-size:0.85rem;color:#666;margin-bottom:16px;line-height:1.6;">직접 견적 의뢰는 회원만 이용할 수 있습니다.<br>로그인 후 다시 시도해주세요.</div>' +
        '<a href="client-auth.html" class="ip-modal__cta-btn" style="display:inline-block;text-decoration:none;margin-right:8px;">로그인 / 회원가입</a>' +
        '<button class="ip-modal__cta-btn" style="background:#f5f5f5;color:#333;" onclick="cancelDirectInquiry(\'' + name.replace(/'/g, "\\'") + '\',\'' + lang.replace(/'/g, "\\'") + '\',\'' + (field || '').replace(/'/g, "\\'") + '\',\'' + country.replace(/'/g, "\\'") + '\',\'' + (photo || '').replace(/'/g, "\\'") + '\',\'' + (role || '').replace(/'/g, "\\'") + '\')">취소</button>' +
        '</div>';
}

function showDirectInquiry(name, lang, field, country, photo, role) {
    var area = document.getElementById('ipCtaArea');
    if (!area) return;

    // 로그인된 회원 정보 자동 입력
    var pf = (_cachedUser && _cachedUser._profile) ? _cachedUser._profile : {};
    var prefillName = pf.name || '';
    var prefillEmail = pf.email || (pf.auth ? pf.auth.email : '') || '';
    var prefillPhone = pf.phone || '';
    var prefillCompany = pf.company || '';

    area.innerHTML = '<div class="diq"><div class="diq__head"><div class="diq__interp">' + (photo ? '<img src="' + photo + '" class="diq__photo">' : avatarHtml('', name, 48)) + '<div><div class="diq__name">' + name + '</div><div class="diq__role">' + role + ' · ' + lang + '</div></div></div><div class="diq__title">직접 견적 의뢰</div></div><div class="diq__form"><div class="diq__row"><div class="diq__field"><label>회사명 <span class="diq__req">*</span></label><input type="text" id="diq-company" placeholder="예: (주)콘텐츄어" value="' + prefillCompany + '"></div><div class="diq__field"><label>담당자명 <span class="diq__req">*</span></label><input type="text" id="diq-name" placeholder="예: 홍길동" value="' + prefillName + '"></div></div><div class="diq__row"><div class="diq__field"><label>이메일 <span class="diq__req">*</span></label><input type="email" id="diq-email" placeholder="예: gildong@company.com" value="' + prefillEmail + '"></div><div class="diq__field"><label>연락처 <span class="diq__req">*</span></label><input type="tel" id="diq-phone" placeholder="예: 010-0000-0000" value="' + prefillPhone + '"></div></div><div class="diq__row"><div class="diq__field"><label>전시회명 <span class="diq__req">*</span></label><input type="text" id="diq-expo" placeholder="예: MEDICA 2026"></div><div class="diq__field"><label>개최지</label><input type="text" id="diq-location" value="' + country + '" placeholder="예: 독일 / 뒤셀도르프"></div></div><div class="diq__row"><div class="diq__field"><label>전시 기간</label><input type="text" id="diq-period" placeholder="예: 2026.11.17 ~ 11.20"></div><div class="diq__field"><label>통역 형태</label><select id="diq-type"><option value="">선택</option><option value="부스 상주">부스 상주(상담 통역)</option><option value="미팅 동행">미팅 동행</option><option value="현장 운영">현장 운영</option><option value="기타">기타</option></select></div></div><div class="diq__field diq__full"><label>요청 내용 <span class="diq__req">*</span></label><textarea id="diq-message" rows="4" placeholder="통역사에게 전달할 요청 사항을 자유롭게 작성해주세요."></textarea></div><div class="diq__actions"><button class="diq__cancel" onclick="cancelDirectInquiry(\'' + name.replace(/'/g, "\\'") + '\',\'' + lang.replace(/'/g, "\\'") + '\',\'' + (field || '').replace(/'/g, "\\'") + '\',\'' + country.replace(/'/g, "\\'") + '\',\'' + (photo || '').replace(/'/g, "\\'") + '\',\'' + (role || '').replace(/'/g, "\\'") + '\')">취소</button><button class="diq__submit" onclick="submitDirectInquiry(\'' + name.replace(/'/g, "\\'") + '\',\'' + lang.replace(/'/g, "\\'") + '\',\'' + (field || '').replace(/'/g, "\\'") + '\')">견적 의뢰 보내기</button></div></div></div>';
    area.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelDirectInquiry(name, lang, field, country, photo, role) {
    var area = document.getElementById('ipCtaArea');
    if (!area) return;
    area.innerHTML = '<button class="ip-modal__cta-btn" onclick="showDirectInquiry(\'' + name.replace(/'/g, "\\'") + '\',\'' + lang.replace(/'/g, "\\'") + '\',\'' + (field || '').replace(/'/g, "\\'") + '\',\'' + country.replace(/'/g, "\\'") + '\',\'' + (photo || '').replace(/'/g, "\\'") + '\',\'' + (role || '').replace(/'/g, "\\'") + '\')">이 통역사에게 직접 견적 의뢰</button>';
}

async function submitDirectInquiry(interpName, lang, field) {
    var company = document.getElementById('diq-company').value.trim();
    var name = document.getElementById('diq-name').value.trim();
    var email = document.getElementById('diq-email').value.trim();
    var phone = document.getElementById('diq-phone').value.trim();
    var expo = document.getElementById('diq-expo').value.trim();
    var message = document.getElementById('diq-message').value.trim();
    if (!company || !name || !email || !phone || !expo || !message) { alert('필수 항목(*)을 모두 입력해주세요.'); return; }

    var location = document.getElementById('diq-location').value.trim();
    var period = document.getElementById('diq-period').value.trim();
    var type = document.getElementById('diq-type').value;

    // 통역사 DB ID 찾기 (DB에서 로드된 통역사인 경우)
    var interpreterId = null;
    Object.keys(interpData).forEach(function(code) {
        interpData[code].interpreters.forEach(function(p) {
            if (p.name === interpName && p._dbId) interpreterId = p._dbId;
        });
    });

    // 전송 버튼 비활성화
    var submitBtn = document.querySelector('.diq__submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '전송 중...'; }

    try {
        // 인증 토큰 가져오기
        var authToken = '';
        if (_cachedUser && _cachedUser.access_token) {
            authToken = _cachedUser.access_token;
        } else if (window.sbClient) {
            var sess = await window.sbClient.auth.getSession();
            if (sess.data.session) authToken = sess.data.session.access_token;
        }

        var res = await fetch('/api/direct-inquiry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken ? 'Bearer ' + authToken : ''
            },
            body: JSON.stringify({
                interpreterName: interpName,
                interpreterId: interpreterId,
                interpreterLang: lang,
                interpreterField: field,
                company: company,
                contactName: name,
                email: email,
                phone: phone,
                exhibitionName: expo,
                location: location,
                period: period,
                serviceType: type,
                message: message
            })
        });

        var result = await res.json();
        if (!res.ok) throw new Error(result.error || '전송 실패');

        var createdAtKR = new Date().toLocaleString('ko-KR');
        var area = document.getElementById('ipCtaArea');
        area.innerHTML = '<div class="diq__success"><div class="diq__success-icon">✅</div><div class="diq__success-title">견적 의뢰가 전송되었습니다!</div><div class="diq__success-info"><strong>' + interpName + '</strong> 통역사에게 직접 견적 의뢰가 전달되었습니다.<br>' + (result.notified ? '통역사에게 알림이 발송되었습니다.' : '확인 후 빠른 시일 내에 회신드리겠습니다.') + '</div><div class="diq__success-detail"><div>문의번호: <strong>' + (result.inquiryId || '-') + '</strong></div><div>전시회: ' + expo + '</div><div>접수시간: ' + createdAtKR + '</div></div><button class="ip-modal__cta-btn" onclick="closeIpModal()" style="margin-top:16px;">확인</button></div>';

    } catch (err) {
        console.error('직접 견적의뢰 전송 오류:', err);
        alert('전송에 실패했습니다. 잠시 후 다시 시도해주세요.\n(' + err.message + ')');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '견적 의뢰 보내기'; }
    }
}

function closeIpModal() {
    document.getElementById('ipModalOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeIpModal(); });

// 국가 카드 키보드 지원
document.querySelectorAll('.country-card[role="button"]').forEach(function (card) {
    card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
});

// ═══ DB 등록 통역사를 국가별 패널에 병합 (서버사이드 API 경유) ═══
_dbLoadPromise = (async function loadDbInterpreters() {
    try {
        var res = await fetch('/api/interpreters');
        if (!res.ok) throw new Error('API ' + res.status);
        var profiles = await res.json();
        if (!profiles || profiles.length === 0) { _dbLoaded = true; return; }

        profiles.forEach(function (p) {
            if (!p.country_code || !interpData[p.country_code]) return;
            var langs = Array.isArray(p.languages) ? p.languages : [];
            var specs = Array.isArray(p.specialties) ? p.specialties : [];
            var tags = langs.concat(specs).slice(0, 3);
            var rates = p.rate_by_type || {};
            var boothRate = rates.booth || rates['부스 상주'] || 250000;
            var meetingRate = rates.meeting || rates['미팅 동행'] || 300000;
            var confRate = rates.conference || rates['동시통역'] || 400000;
            var opRate = rates.operation || rates['현장 운영'] || 280000;

            var newInterp = {
                name: p.display_name || '통역사', photo: p.profile_image_url || '',
                role: langs.join('·') + ' 전문 통역사', intro: p.intro || '', tags: tags,
                fieldTag: p.field_tag || (specs[0] || ''), cases: p.cases_count || 0,
                rating: p.rating || 0, years: p.experience_years || 0, satisfaction: p.satisfaction || 0,
                prices: { booth: [boothRate, boothRate + 50000], meeting: [meetingRate, meetingRate + 50000], conference: [confRate, confRate + 50000], operation: [opRate, opRate + 50000] },
                bio: p.intro || '', history: [], _dbId: p.user_id, _fromDb: true
            };

            var existing = interpData[p.country_code].interpreters.findIndex(function (x) { return x.name === p.display_name; });
            if (existing >= 0) {
                var old = interpData[p.country_code].interpreters[existing];
                newInterp.history = old.history || [];
                if (!newInterp.intro && old.intro) newInterp.intro = old.intro;
                interpData[p.country_code].interpreters[existing] = newInterp;
            } else {
                interpData[p.country_code].interpreters.push(newInterp);
            }
        });
        console.log('[통역사] DB 프로필 ' + profiles.length + '명 병합 완료');
    } catch (e) {
        console.error('[통역사] DB 로드 실패:', e);
    } finally {
        _dbLoaded = true;
    }
})();
