// Password gate — server-side verification via /api/verify-pw
(function () {
    var gate = document.getElementById('pwGate');
    if (!gate) return;

    // Already authenticated in this session
    if (sessionStorage.getItem('_ct_auth') === '1') {
        gate.style.display = 'none';
        return;
    }

    window.checkPw = async function () {
        var input = document.getElementById('pwInput');
        var pw = input.value;
        if (!pw) return;

        var btn = gate.querySelector('button');
        if (btn) { btn.disabled = true; btn.textContent = '확인 중...'; }

        try {
            var res = await fetch('/api/verify-pw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw })
            });
            var data = await res.json();

            if (data.ok) {
                sessionStorage.setItem('_ct_auth', '1');
                gate.style.display = 'none';
            } else {
                document.getElementById('pwError').textContent = '비밀번호가 올바르지 않습니다.';
                input.style.borderColor = '#c62828';
                setTimeout(function () {
                    document.getElementById('pwError').textContent = '';
                    input.style.borderColor = '#e0e5ec';
                }, 4000);
            }
        } catch (e) {
            document.getElementById('pwError').textContent = '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
            setTimeout(function () {
                document.getElementById('pwError').textContent = '';
            }, 4000);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '확인'; }
        }
    };

    document.getElementById('pwInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') checkPw();
    });
})();
