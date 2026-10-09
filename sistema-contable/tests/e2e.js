/*
 * Prueba end-to-end en navegador real (Chromium vía Playwright).
 * Uso: node tests/e2e.js [carpetaCapturas]
 * Requiere Playwright instalado (local o global).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    const g = execSync('npm root -g').toString().trim();
    return require(path.join(g, 'playwright'));
  }
}

const ROOT = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const shots = process.argv[2];

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { resp.writeHead(404); return resp.end(); }
      resp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    }).listen(0, () => res(srv));
  });
}

let failures = 0;
const check = (cond, msg) => { if (cond) console.log('  ✔ ' + msg); else { failures++; console.log('  ✖ ' + msg); } };

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

  console.log('Login');
  await page.goto(url);
  await page.fill('#loginPass', 'malo');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#loginError:not(.hidden)');
  check(await page.isVisible('#loginError'), 'contraseña incorrecta muestra error');
  await page.fill('#loginPass', 'uni2026');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#app:not(.hidden)');
  check(await page.isVisible('#app'), 'ingresa con admin / uni2026');

  console.log('Todos los módulos del menú');
  const views = await page.$$eval('.nav[data-view]', b => b.map(x => [x.dataset.view, x.textContent]));
  check(views.length >= 35, `el menú tiene ${views.length} opciones`);
  for (const [v, label] of views) {
    await page.click(`.nav[data-view="${v}"]`);
    const broken = await page.$('text=No se pudo abrir el módulo');
    const title = await page.textContent('#pageTitle');
    check(!broken && title === label, `abre "${label}"`);
    if (shots) await page.screenshot({ path: path.join(shots, `${v}.png`), fullPage: true });
  }
  if (views.some(([v]) => v === 'tablas')) {
    for (const tab of ['cuentas', 'materiales', 'productos', 'activos', 'inductores', 'cif', 'inicial', 'terceros']) {
      await page.evaluate(t => window.__app.navigate('tablas', { tab: t }), tab);
      check(!(await page.$('text=No se pudo abrir el módulo')), `tablas maestras: pestaña ${tab}`);
    }
  }

  console.log('Compra de materia prima → kardex y cuenta 24');
  const before = await page.evaluate(() => window.__app.ctx().kMat.items.M1.saldoCant);
  await page.click('.nav[data-view="compras"]');
  await page.fill('#f_fecha', '2026-10-25');
  await page.fill('#f_documento', 'F009-00001');
  await page.fill('#f_proveedor', 'Proveedor E2E SAC');
  await page.fill('#f_ruc', '20123123123');
  await page.selectOption('#items .item-row [name="materialId"]', '1');
  await page.fill('#items .item-row [name="cantidad"]', '100');
  await page.fill('#items .item-row [name="costoUnit"]', '7');
  await page.click('#cSave');
  const after = await page.evaluate(() => { const c = window.__app.ctx(); return { k: c.kMat.items.M1.saldoCant, v: c.kMat.items.M1.saldoTotal, cta: c.Lpre['24101'].saldo }; });
  check(after.k === before + 100, `kardex de madera aumenta 100 (${before} → ${after.k})`);
  check(Math.abs(after.v - after.cta) < 0.01, 'kardex = cuenta 24101');

  console.log('Requisición con stock insuficiente se rechaza');
  const nReq = await page.evaluate(() => window.__app.db.requisiciones.length);
  await page.click('.nav[data-view="requisiciones"]');
  await page.fill('#f_fecha', '2026-10-25');
  await page.selectOption('#f_materialId', '3');
  await page.selectOption('#f_otId', '3');
  await page.fill('#f_cantidad', '9999');
  await page.click('[data-crud-save="rq"]');
  const msg = await page.textContent('.modal p');
  check(msg.includes('Stock insuficiente'), 'muestra alerta de stock insuficiente');
  await page.click('.modal [data-r="1"]');
  check(await page.evaluate(() => window.__app.db.requisiciones.length) === nReq, 'no graba la requisición');

  console.log('Requisición válida');
  await page.fill('#f_cantidad', '10');
  await page.click('[data-crud-save="rq"]');
  check(await page.evaluate(() => window.__app.db.requisiciones.length) === nReq + 1, 'graba la requisición');

  console.log('Cuadraturas en pantalla');
  await page.click('.nav[data-view="comprobacion"]');
  check((await page.$$('.summary-bar .pill.ok')).length === 2, 'balance de comprobación: resultados coinciden');
  await page.click('.nav[data-view="situacion"]');
  check(!!(await page.$('.pill.ok')), 'estado de situación cuadra');
  await page.click('.nav[data-view="flujo"]');
  check(!!(await page.$('.pill.ok')), 'flujo de efectivo = cuenta 10');
  await page.click('.nav[data-view="estadoCostos"]');
  check(!!(await page.$('.pill.ok')), 'estado de costos = cuenta 69');

  console.log('Exportar CSV');
  await page.click('.nav[data-view="diario"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check(csv.includes('Denominación') && csv.split('\n').length > 50, 'descarga el libro diario en CSV');

  console.log('Cierre del ejercicio');
  await page.click('.nav[data-view="cierre"]');
  await page.click('#doClose');
  await page.click('.modal [data-r="1"]');
  check((await page.textContent('#periodBadge')).includes('CERRADO'), 'periodo cerrado');
  const closedOk = await page.evaluate(() => {
    const c = window.__app.ctx();
    return Object.values(c.L).filter(a => /^[6789]/.test(a.codigo)).every(a => Math.abs(a.saldo) < 0.01);
  });
  check(closedOk, 'cuentas 6, 7, 8 y 9 quedan saldadas');
  await page.click('.nav[data-view="config"]');
  await page.click('#cfgSave');
  check(!!(await page.$('.toast.err')), 'no permite modificar con el periodo cerrado');
  await page.click('.nav[data-view="cierre"]');
  await page.click('#reopen');
  await page.click('.modal [data-r="1"]');
  check(!(await page.textContent('#periodBadge')).includes('CERRADO'), 'revierte el cierre');

  console.log('Persistencia y vista móvil');
  await page.reload();
  check(await page.isVisible('#loginScreen'), 'al recargar pide login');
  await page.fill('#loginPass', 'uni2026');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#app:not(.hidden)');
  check(await page.evaluate(() => window.__app.db.compras.some(c => c.documento === 'F009-00001')), 'los datos persisten en localStorage');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#menuBtn');
  await page.click('.nav[data-view="dashboard"]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, 'sin scroll horizontal en móvil');
  if (shots) await page.screenshot({ path: path.join(shots, 'mobile.png'), fullPage: false });

  check(dialogs.length === 0, 'no usa alert/confirm nativos');
  check(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(failures ? `\n${failures} verificación(es) fallida(s)` : '\nTodas las verificaciones E2E pasaron');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
