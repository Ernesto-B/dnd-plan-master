const puppeteer = require('puppeteer');
const pdfTemplate = require('../templates/pdfTemplate');
const { isElectronRuntime } = require('./appPaths');

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

const PDF_OPTIONS = {
  format: 'Letter',
  margin: { top: '0.45in', right: '0.45in', bottom: '0.45in', left: '0.45in' },
  printBackground: true,
};

async function generateWithPuppeteer(html) {
  const browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf(PDF_OPTIONS);
  } finally {
    await browser.close();
  }
}

async function generateFromHtml(html) {
  if (isElectronRuntime()) {
    const electronPdfGenerator = require('./electronPdfGenerator');
    return await electronPdfGenerator.generateFromHtml(html);
  }

  return await generateWithPuppeteer(html);
}

async function generate(data) {
  return generateFromHtml(pdfTemplate.render(data));
}

module.exports = { generate, generateFromHtml };
