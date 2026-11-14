#!/usr/bin/env node
/**
 * End-to-end check of the website editor, so problems are found here
 * rather than by the volunteers trying to use it.
 *
 * Checks, in the order a person actually hits them:
 *   1. every public page loads
 *   2. the editor page loads and offers a sign in
 *   3. the editor's settings file is served as text, not as a download
 *   4. the sign in popup starts GitHub's flow
 *   5. the popup sends Decap's handshake ping BEFORE the token
 *   6. each page still carries its editable regions
 *
 * Usage: node tools/selftest.js
 */
const { chromium } = require('playwright');

const SITE = 'https://sipartsfoundation.org';
const WORKER = 'https://sip-decap-oauth.shauna-276.workers.dev';

const PAGES = {
  '/unmasking/': 13,
  '/studio.html': 1,
  '/selfadvocacy/': 2,
  '/perfectly-imperfect/': 3,
  '/events/': 1,
  '/survey/': 1,
  '/signin/': 1,
};

const results = [];
const ok = (n, d = '') => results.push({ pass: true, n, d });
const bad = (n, d = '') => results.push({ pass: false, n, d });

(async () => {
  const bust = () => '?cb=' + Date.now() + Math.random();

  for (const [path, regions] of Object.entries(PAGES)) {
    const res = await fetch(SITE + path + bust());
    const html = await res.text();
    const found = (html.match(/cms:start/g) || []).length;
    if (!res.ok) bad(`page ${path}`, `HTTP ${res.status}`);
    else if (found !== regions) bad(`page ${path}`, `${found} editable regions, expected ${regions}`);
    else ok(`page ${path}`, `${found} editable regions`);
  }

  const cfg = await fetch(`${SITE}/admin/config.yml` + bust());
  const ctype = cfg.headers.get('content-type') || '';
  if (/yaml|text\/plain/.test(ctype)) ok('editor settings content type', ctype);
  else bad('editor settings content type', `${ctype} — the editor will refuse to load`);

  const auth = await fetch(`${WORKER}/auth`, { redirect: 'manual' });
  const loc = auth.headers.get('location') || '';
  if (auth.status === 302 && loc.startsWith('https://github.com/login/oauth/authorize'))
    ok('sign in redirects to GitHub');
  else bad('sign in redirects to GitHub', `status ${auth.status}`);

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${SITE}/admin/` + bust(), { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    const hasLogin = await page.getByText('Login with GitHub').count();
    hasLogin ? ok('editor loads and offers sign in') : bad('editor loads and offers sign in', 'no sign in button');
    errors.length ? bad('editor javascript errors', errors.join('; ')) : ok('no editor javascript errors');

    const popupWait = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    if (hasLogin) await page.getByText('Login with GitHub').click();
    const popup = await popupWait;
    if (popup && /github\.com/.test(popup.url())) ok('sign in opens GitHub');
    else bad('sign in opens GitHub', popup ? popup.url() : 'no popup opened');

    // The handshake order is what broke before: the popup must announce
    // itself first, or the editor is not yet listening for the token.
    const order = [];
    const p2 = await ctx.newPage();
    await p2.goto(`${SITE}/admin/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p2.exposeFunction('record', m => order.push(m));
    await p2.evaluate(() => {
      window.addEventListener('message', e => {
        if (typeof e.data === 'string' && e.data.startsWith('authoriz')) {
          window.record(e.data.split(':').slice(0, 3).join(':'));
          if (e.data === 'authorizing:github') e.source.postMessage(e.data, e.origin);
        }
      }, false);
      window.open('https://sip-decap-oauth.shauna-276.workers.dev/callback', 'p', 'width=500,height=600');
    });
    await p2.waitForTimeout(6000);
    if (order[0] === 'authorizing:github' && order.length > 1)
      ok('sign in handshake order', order.join(' then '));
    else bad('sign in handshake order', order.length ? order.join(' then ') : 'editor received nothing');
  } finally {
    await browser.close();
  }

  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? '  (' + r.d + ')' : ''}`);
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
