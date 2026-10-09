/*
 * Prueba end-to-end de la versión Apps Script: la página que genera doGet() corre en Chromium
 * y google.script.run se simula con llamadas HTTP al servidor (Code.gs) cargado en el simulador.
 * Uso: node tests/e2e-gas.js [carpetaCapturas]
 */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { build, DIST } = require('../build.js');
const { createRuntime } = require('./gas-mock.js');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
}

const SHIM = `<script>
(function () {
  window.google = { script: {} };
  Object.defineProperty(window.google.script, 'run', { get: function () { return makeRunner(); } });
  function makeRunner() {
    var ok = function () {}, fail = function () {};
    var p = new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (f) { ok = f; return p; };
        if (prop === 'withFailureHandler') return function (f) { fail = f; return p; };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch('/rpc', { method: 'POST', body: JSON.stringify({ fn: prop, args: args }) })
            .then(function (r) { return r.json(); })
            .then(function (x) { setTimeout(function () { x.__error ? fail(new Error(x.__error)) : ok(x.result); }, 30); });
        };
      }
    });
    return p;
  }
})();
</script>`;

let failures = 0;
const check = (cond, msg) => { if (cond) console.log('  ✔ ' + msg); else { failures++; console.log('  ✖ ' + msg); } };

(async () => {
  build();
  const rt = createRuntime(DIST);
  const calls = [];
  const srv = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = '';
      req.on('data', d => (body += d));
      req.on('end', () => {
        const { fn, args } = JSON.parse(body);
        calls.push(fn);
        let out;
        try { out = { result: rt.run(fn, ...args) }; } catch (e) { out = { __error: e.message }; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out === undefined ? {} : out));
      });
      return;
    }
    const html = rt.ctx.doGet().getContent().replace('<base target="_top">', '<base target="_top">' + SHIM);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }).listen(0);
  await new Promise(r => srv.on('listening', r));
  const url = `http://localhost:${srv.address().port}/`;
  const shots = process.argv[2];

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const login = async (u, p) => {
    await page.fill('#loginUser', u);
    await page.fill('#loginPass', p);
    await page.click('#loginForm button[type=submit]');
  };
  const savedOk = async () => {
    await page.waitForFunction(() => { const b = document.querySelector('#saveBadge'); return b && !b.hidden && /Guardado|Error/.test(b.textContent); }, null, { timeout: 15000 });
    return page.textContent('#saveBadge');
  };

  console.log('Login contra Google Sheets (simulado)');
  await page.goto(url);
  await login('admin', 'mala');
  await page.waitForSelector('#loginError:not(.hidden)');
  check((await page.textContent('#loginError')).includes('incorrectos'), 'clave incorrecta: mensaje del servidor');
  await login('admin', 'uni2026');
  await page.waitForSelector('#app:not(.hidden)');
  check(true, 'ingresa con admin / uni2026');
  check((await page.textContent('#userName')).includes('Administrador'), 'muestra el nombre del usuario');
  const menu = await page.$$eval('.nav[data-view]', b => b.map(x => x.dataset.view));
  check(menu.includes('sheets') && menu.includes('usuarios') && menu.length >= 38, `menú con opciones de Google Sheets (${menu.length})`);

  console.log('Todos los módulos');
  for (const v of menu) {
    await page.click(`.nav[data-view="${v}"]`);
    await page.waitForTimeout(v === 'sheets' || v === 'usuarios' ? 400 : 30);
    check(!(await page.$('text=No se pudo abrir el módulo')), `abre ${v}`);
  }

  console.log('Compra → se guarda en Google Sheets');
  await page.click('.nav[data-view="compras"]');
  await page.fill('#f_fecha', '2026-10-25');
  await page.fill('#f_documento', 'F009-00001');
  await page.fill('#f_proveedor', 'Proveedor E2E SAC');
  await page.fill('#f_ruc', '20123123123');
  await page.selectOption('#items .item-row [name="materialId"]', '1');
  await page.fill('#items .item-row [name="cantidad"]', '100');
  await page.fill('#items .item-row [name="costoUnit"]', '7');
  await page.click('#cSave');
  check((await savedOk()).includes('Guardado'), 'indicador "Guardado en Google Sheets"');
  const fila = rt.sheet('Compras').rows().find(r => r[3] === 'F009-00001');
  check(!!fila && fila[5] === '20123123123', 'la compra está en la hoja Compras (RUC como texto)');
  check(rt.sheet('ComprasDetalle').rows().some(r => r[0] === fila[0] && r[4] === 100), 'el ítem está en la hoja ComprasDetalle');
  if (shots) await page.screenshot({ path: path.join(shots, 'gas-compras.png') });

  console.log('Stock insuficiente se rechaza antes de llamar al servidor');
  const nSaves = calls.filter(c => c === 'saveChanges').length;
  await page.click('.nav[data-view="requisiciones"]');
  await page.fill('#f_fecha', '2026-10-25');
  await page.selectOption('#f_materialId', '3');
  await page.selectOption('#f_otId', '3');
  await page.fill('#f_cantidad', '9999');
  await page.click('[data-crud-save="rq"]');
  await page.waitForSelector('.modal p');
  check((await page.textContent('.modal p')).includes('Stock insuficiente'), 'aviso de stock insuficiente');
  await page.click('.modal [data-r="1"]');
  check(calls.filter(c => c === 'saveChanges').length === nSaves, 'no se envió nada al servidor');

  console.log('Conflicto: otro usuario cambia los datos');
  const other = rt.run('login', 'admin', 'uni2026');
  rt.run('saveChanges', other.token, { tesoreria: other.db.tesoreria.slice(0, 3) }, other.rev);
  await page.click('.nav[data-view="config"]');
  await page.fill('#f_razon', 'OMEGA SAC (editado)');
  await page.click('#cfgSave');
  await page.waitForSelector('.modal p', { timeout: 15000 });
  check((await page.textContent('.modal p')).includes('Otro usuario'), 'avisa el conflicto y recarga los datos');
  await page.click('.modal [data-r="1"]');
  check(await page.evaluate(() => window.__app.db.tesoreria.length) === 3, 'la página muestra los datos del otro usuario');

  console.log('Reportes en Google Sheets');
  await page.click('.nav[data-view="sheets"]');
  await page.waitForSelector('#shInfo table');
  check((await page.textContent('#shInfo')).includes('ComprasDetalle'), 'lista las hojas de la base de datos');
  await page.click('#genRep');
  await page.waitForSelector('#repOut .ok-note', { timeout: 20000 });
  check(!!rt.sheet('R_LibroDiario') && !!rt.sheet('R_Kardex') && !!rt.sheet('R_HojaCostos'), 'crea las hojas R_ (diario, kardex, hoja de costos…)');
  if (shots) await page.screenshot({ path: path.join(shots, 'gas-sheets.png') });

  console.log('Usuarios');
  await page.click('.nav[data-view="usuarios"]');
  await page.waitForSelector('#uSave');
  await page.fill('#uUser', 'profesor');
  await page.fill('#uName', 'Profesor del curso');
  await page.selectOption('#uRol', 'CONSULTA');
  await page.fill('#uPass', 'clave123');
  await page.click('#uSave');
  await page.waitForSelector('[data-udel="profesor"]', { timeout: 15000 });
  check(rt.sheet('Usuarios').rows().some(r => r[0] === 'profesor' && r[2] === 'CONSULTA'), 'crea el usuario en la hoja Usuarios');
  if (shots) await page.screenshot({ path: path.join(shots, 'gas-usuarios.png') });

  console.log('Perfil de solo consulta');
  await page.click('#logoutBtn');
  await login('profesor', 'clave123');
  await page.waitForSelector('#app:not(.hidden)');
  check((await page.textContent('#userRole')).includes('CONSULTA'), 'ingresa con perfil CONSULTA');
  await page.click('.nav[data-view="config"]');
  await page.click('#cfgSave');
  await page.waitForSelector('.toast.err');
  check((await page.textContent('.toast.err')).includes('solo consulta'), 'no permite modificar');

  console.log('Persistencia y sesión vencida');
  await page.reload();
  await login('admin', 'uni2026');
  await page.waitForSelector('#app:not(.hidden)');
  check(await page.evaluate(() => window.__app.db.compras.some(c => c.documento === 'F009-00001')), 'los datos vienen de Google Sheets al volver a entrar');
  rt.cache.clear();
  await page.click('.nav[data-view="config"]');
  await page.fill('#f_direccion', 'Av. Industrial 456, Lima');
  await page.click('#cfgSave');
  await page.waitForSelector('#loginScreen:not(.hidden)', { timeout: 15000 });
  check((await page.textContent('#loginError')).includes('venció'), 'sesión vencida: vuelve al login');

  check(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(failures ? `\n${failures} verificación(es) fallida(s)` : '\nTodas las verificaciones E2E (Apps Script) pasaron');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
