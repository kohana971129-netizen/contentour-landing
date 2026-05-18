/* ============================================================
   리뷰 모더레이션 필터 (review-filter.js)
   - HARD: 명백한 욕설 → 작성 자체 차단
   - SOFT: 분쟁/주의 키워드 → 작성 허용 + 관리자 검토 대기 (is_public=false)
   - window.ReviewFilter.check(text) → { ok, blockedHard, flaggedSoft, hardMatches, softMatches }
   ============================================================ */
(function(){
  'use strict';

  // ── HARD 차단: 변형까지 잡도록 정규식. 정상 단어 오탐 최소화 위해
  //    "병신"·"등신" 등은 본 단어 + 흔한 변형만, 너무 범용적인 자모 분리는 제외
  var HARD = [
    /씨\s*[발벌바빠팔펄]/i,
    /시\s*[발벌바빠팔펄]/i,
    /[ㅅㅆ][\s.,~!]{0,3}[ㅂ]/,
    /존\s*나/i, /졸\s*라/i,
    /좆\s*같/i, /좇\s*같/i, /존\s*같/i,
    /병\s*신/i, /븅\s*신/i, /[ㅂ][\s.,~!]{0,3}[ㅅ]/,
    /개\s*[새색쉑]/i,
    /[ㅈ][\s.,~!]{0,3}[ㄴ]/,
    /[ㅁ][\s.,~!]{0,3}[ㅊ]/,
    /미\s*친\s*[놈년새]/i,
    /닥\s*쳐/i, /꺼\s*져/i,
    /지\s*[랄롤럴]/i,
    /쌍\s*[년놈]/i, /창\s*[년놈]/i,
    /[죽뒤]\s*어\s*[버라]/i, /뒈\s*져/i,
    /후\s*레/i, /후\s*장/i,
    /보\s*지/i, /자\s*지/i,
    /씹\s*[새색쉑할년놈]/i,
    /엿\s*[먹같]/i,
    /엠\s*창/i,
    /느\s*금\s*마/i,
    /니\s*애\s*미/i, /니\s*애\s*비/i,
    /[ㅗㅑ]\s*ㅗ/
  ];

  // ── SOFT 플래그: 분쟁성 키워드 — 통역사 플랫폼 특성 반영
  //    매칭되면 자동 차단이 아니라 관리자 검토 대기로 보류
  //    너무 엄격하면 정당한 비판도 보류되니 분쟁·법적·인격공격성 위주로만
  var SOFT = [
    // 법적·분쟁
    '사기', '사기꾼', '사기성', '사기당',
    '고소', '소송', '법적', '법적조치', '법적 조치', '고발',
    '손해배상', '피해보상', '배상',
    '환불', '환불해', '환불요청',
    '계약위반', '계약 위반',
    '횡령', '배임',
    '폭언', '폭행', '협박', '갑질',

    // 통역사 플랫폼 특화 — 신뢰·자격 직접 공격
    '무자격', '자격없', '자격 없', '실력없', '실력 없',
    '돌팔이', '엉터리', '가짜',
    '학력위조', '경력위조', '이력위조',
    '노쇼', 'no-show', 'noshow', '연락두절', '연락 두절', '잠수',
    '약속불이행', '약속 불이행', '약속 안 지',
    '책임회피', '책임 회피', '책임전가', '책임 전가',
    '인성', '인성쓰레기', '인성 쓰레기', '인성문제', '인성 문제',
    '뇌물', '리베이트', '뒷돈',
    '개인정보유출', '개인정보 유출', '정보유출',
    '성희롱', '성추행', '성폭력',

    // 신고 의지 표명 (악의성 시그널)
    '신고할', '신고함', '신고하겠', '폭로',
    '블랙리스트', '블랙 리스트', '경고함',

    // 통역 결과 자체 부정 (사실 확인 필요)
    '오역투성이', '엉터리 통역', '통역 못함', '통역 못해',

    // ── 부정 어조 일반 (정당한 비판도 일부 포함됨, 운영하며 조정) ──
    '최악', '최하', '최저',
    '별로', '별루',
    '실망', '실망스러',
    '후회', '후회된', '후회스러',
    '비추', '비추천',
    '형편없', '엉망',
    '끔찍', '소름',
    '다시는', '두번 다시', '두 번 다시',
    '시간낭비', '시간 낭비', '돈낭비', '돈 낭비',
    '안 좋', '안좋',
    '짜증', '화남', '화났',
    '불쾌', '기분 나쁘', '기분나쁘',
    '쓰레기 서비스', '쓰레기같'
  ];

  function normalize(text){
    // 공백·특수문자 일부 정규화 (단, 의미 보존)
    return String(text || '').toLowerCase();
  }

  function checkHard(text){
    var t = normalize(text);
    var matches = [];
    for (var i = 0; i < HARD.length; i++){
      var m = t.match(HARD[i]);
      if (m) matches.push(m[0].replace(/\s+/g, ''));
    }
    return matches;
  }

  function checkSoft(text){
    var t = normalize(text);
    var matches = [];
    for (var i = 0; i < SOFT.length; i++){
      var kw = SOFT[i].toLowerCase();
      if (t.indexOf(kw) !== -1) matches.push(SOFT[i]);
    }
    return matches;
  }

  function check(text){
    if (!text || typeof text !== 'string' || text.trim().length === 0){
      return { ok: true, blockedHard: false, flaggedSoft: false, hardMatches: [], softMatches: [] };
    }
    var hardMatches = checkHard(text);
    var softMatches = checkSoft(text);
    return {
      ok: hardMatches.length === 0,
      blockedHard: hardMatches.length > 0,
      flaggedSoft: softMatches.length > 0,
      hardMatches: hardMatches,
      softMatches: softMatches
    };
  }

  window.ReviewFilter = {
    check: check,
    checkHard: checkHard,
    checkSoft: checkSoft,
    HARD_RULES_COUNT: HARD.length,
    SOFT_KEYWORDS_COUNT: SOFT.length
  };
})();
