const puppeteer = require('puppeteer');
const path = require('path');

const tabs = [
  { id: 'common', name: '서비스_이용약관' },
  { id: 'customer', name: '고객사_이용약관' },
  { id: 'interpreter', name: '통역사_이용약관' },
  { id: 'operation', name: '서비스_운영정책' },
  { id: 'privacy', name: '개인정보처리방침' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const filePath = 'file:///' + path.resolve(__dirname, 'terms.html').replace(/\\/g, '/');
  const outputDir = path.resolve(__dirname, 'pdf');

  const fs = require('fs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  for (const tab of tabs) {
    const page = await browser.newPage();
    await page.goto(filePath, { waitUntil: 'networkidle0' });

    // Bypass password gate
    await page.evaluate(() => {
      const gate = document.getElementById('pwGate');
      if (gate) gate.style.display = 'none';
      sessionStorage.setItem('_ct_auth', '1');
    });

    // Activate the tab and expand all cards
    await page.evaluate((tabId) => {
      // Switch tab
      document.querySelectorAll('.terms-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.terms-section').forEach(s => s.classList.remove('active'));
      const sec = document.getElementById('sec-' + tabId);
      if (sec) sec.classList.add('active');

      const tabMap = { common: 0, customer: 1, interpreter: 2, operation: 3, privacy: 4 };
      const tabEls = document.querySelectorAll('.terms-tab');
      if (tabEls[tabMap[tabId]]) tabEls[tabMap[tabId]].classList.add('active');

      // Expand all accordion cards in the active section
      if (sec) {
        sec.querySelectorAll('.terms-card__body').forEach(body => {
          body.classList.add('open');
        });
        sec.querySelectorAll('.terms-card__toggle').forEach(toggle => {
          toggle.classList.add('open');
        });
      }
    }, tab.id);

    // Hide non-active sections and header tabs for cleaner PDF
    await page.evaluate(() => {
      // Make all sections visible via print-friendly styles
      const style = document.createElement('style');
      style.textContent = `
        .terms-section { display: none !important; }
        .terms-section.active { display: block !important; }
        .terms-header { position: relative !important; }
        .terms-tabs { display: none !important; }
        .terms-card__body { max-height: none !important; overflow: visible !important; }
        .terms-card__body.open { padding: 20px 24px !important; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `;
      document.head.appendChild(style);
    });

    const outputPath = path.join(outputDir, `${tab.name}.pdf`);
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });

    console.log(`OK: ${outputPath}`);
    await page.close();
  }

  await browser.close();
  console.log('All PDFs generated!');
})();
