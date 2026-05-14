// favicon-32.png + apple-touch-icon.png 생성
// 네이비 배경 + 흰 로고 (브라우저 탭에서 작은 사이즈로 가독성 유지)
// 실행: node generate-favicon.js

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const logoB64 = fs.readFileSync(path.resolve(__dirname, 'assets/footer_logo.png')).toString('base64');
const logoDataUrl = 'data:image/png;base64,' + logoB64;

async function render(size, outName, padding) {
    const html = `
<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${size}px;height:${size}px;overflow:hidden}
body{background:linear-gradient(135deg,#0a2a5e 0%,#1565c0 100%);display:flex;align-items:center;justify-content:center;}
img{width:${size - padding * 2}px;height:${size - padding * 2}px;object-fit:contain;}
</style></head><body>
<img src="${logoDataUrl}" alt="">
</body></html>`;

    const browser = await puppeteer.launch({
        defaultViewport: { width: size, height: size, deviceScaleFactor: 1 }
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({
        path: path.resolve(__dirname, 'assets', outName),
        type: 'png',
        omitBackground: true,
        clip: { x: 0, y: 0, width: size, height: size }
    });
    await browser.close();
    console.log('Generated:', outName, size + 'x' + size);
}

(async () => {
    await render(32, 'favicon-32.png', 4);
    await render(180, 'apple-touch-icon.png', 24);
})().catch(e => { console.error(e); process.exit(1); });
