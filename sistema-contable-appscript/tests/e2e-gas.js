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
/** Fila de una hoja como objeto, según los encabezados de la fila 1. */
const rowsOf = (rt, name) => { const v = rt.sheet(name).rows(); return v.slice(1).map(r => Object.fromEntries(v[0].map((h, i) => [h, r[i]]))); };

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
  check(['sheets', 'usuarios', 'empresas', 'hojaCalculo', 'manual'].every(v => menu.includes(v)) && menu.length >= 40, `menú con Google Sheets, empresas, hoja de costeo y manual (${menu.length})`);
  check(await page.evaluate(() => window.__app.empresaId) === 1, 'con una sola empresa la abre directamente');

  console.log('Todos los módulos');
  for (const v of menu) {
    await page.click(`.nav[data-view="${v}"]`);
    await page.waitForTimeout(v === 'sheets' || v === 'usuarios' ? 400 : 40);
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
  const fila = rowsOf(rt, 'Compras').find(r => r.documento === 'F009-00001');
  check(!!fila && fila.ruc === '20123123123' && fila.empresaId === 1, 'la compra está en la hoja Compras (empresa 1, RUC como texto)');
  check(rowsOf(rt, 'ComprasDetalle').some(r => r.compraId === fila.id && r.cantidad === 100), 'el ítem está en la hoja ComprasDetalle');
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
  const odb = rt.run('openEmpresa', other.token, 1);
  rt.run('saveChanges', other.token, 1, { tesoreria: odb.db.tesoreria.slice(0, 3) }, odb.rev);
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
  check(!!rt.sheet('R_LibroDiario') && !!rt.sheet('R_Kardex') && !!rt.sheet('R_HojaCostos') && !!rt.sheet('R_Ratios'), 'crea las hojas R_ (diario, kardex, hoja de costos, ratios…)');
  check(!!rt.sheet('C_Resumen OT') && !!rt.sheet('C_Distribución CIF'), 'crea las hojas C_ de la hoja de cálculo de costeo');
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
  check(rowsOf(rt, 'Usuarios').some(r => r.usuario === 'profesor' && r.rol === 'CONSULTA' && r.empresas === '1'), 'crea el usuario en la hoja Usuarios con su empresa');
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

  console.log('Persistencia');
  await page.reload();
  await login('admin', 'uni2026');
  await page.waitForSelector('#app:not(.hidden)');
  check(await page.evaluate(() => window.__app.db.compras.some(c => c.documento === 'F009-00001')), 'los datos vienen de Google Sheets al volver a entrar');

  console.log('Multiempresa en Google Sheets');
  await page.click('.nav[data-view="empresas"]');
  await page.fill('#nRazon', 'Textil Andina SAC');
  await page.fill('#nRuc', '20999888777');
  await page.selectOption('#nModo', 'copia');
  await page.click('#nSave');
  await page.waitForSelector('[data-eopen]', { timeout: 15000 });
  check(rowsOf(rt, 'Empresas').map(e => e.razon).join('|') === 'OMEGA SAC|Textil Andina SAC', 'la empresa nueva está en la hoja Empresas');
  if (shots) await page.screenshot({ path: path.join(shots, 'gas-empresas.png') });
  await page.click('[data-eopen="2"]');
  await page.waitForFunction(() => window.__app.empresaId === 2, null, { timeout: 15000 });
  check(await page.evaluate(() => window.__app.db.compras.length === 0 && window.__app.db.materiales.length > 0), 'abre la empresa 2 con sus propias tablas');
  await page.click('.nav[data-view="config"]');
  await page.fill('#f_direccion', 'Jr. Textil 100, Lima');
  await page.click('#cfgSave');
  check((await savedOk()).includes('Guardado'), 'guarda cambios de la empresa 2');
  check(rowsOf(rt, 'Empresas').find(e => e.id === 2).direccion === 'Jr. Textil 100, Lima' && rowsOf(rt, 'Empresas').find(e => e.id === 1).direccion !== 'Jr. Textil 100, Lima', 'el cambio solo afecta a la empresa 2');
  await page.click('#switchCompanyBtn');
  await page.waitForSelector('.company-card[data-pick="1"]');
  check((await page.$$('.company-card')).length === 2, 'pantalla para elegir empresa');
  if (shots) await page.screenshot({ path: path.join(shots, 'gas-elegir-empresa.png') });
  await page.click('.company-card[data-pick="1"]');
  await page.waitForFunction(() => window.__app.empresaId === 1, null, { timeout: 15000 });
  check(await page.evaluate(() => window.__app.db.compras.some(c => c.documento === 'F009-00001')), 'vuelve a OMEGA SAC con sus datos');

  console.log('Temas, hoja de cálculo de costeo y manual');
  await page.click('.topbar [data-theme-switch] button[data-t="dim"]');
  check(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dim', 'tema Tenue');
  await page.click('.nav[data-view="hojaCalculo"]');
  await page.waitForSelector('[data-hoja]');
  rt.sheets.delete('C_Resumen OT');
  await page.click('#gsBtn');
  await page.waitForSelector('#gsOut .ok-note', { timeout: 15000 });
  check(!!rt.sheet('C_Resumen OT'), 'envía la hoja de costeo a Google Sheets (hojas C_)');
  if (shots) await page.screenshot({ path: path.join(shots, 'gas-hoja-costeo.png') });
  await page.click('#helpBtn');
  await page.waitForSelector('.manual');
  check((await page.textContent('#content')).toLowerCase().includes('hoja de cálculo'), 'el botón Ayuda abre el manual en la sección de la pantalla');
  await page.click('.topbar [data-theme-switch] button[data-t="light"]');

  console.log('Usuario con dos empresas');
  rt.run('saveUser', other.token, 1, { usuario: 'jorihuela', nombre: 'Jennifer', rol: 'CONTADOR', activo: true, clave: 'clave123', nuevo: true, empresas: [1, 2] });
  await page.click('#logoutBtn');
  await login('jorihuela', 'clave123');
  await page.waitForSelector('#companyScreen:not(.hidden)');
  check((await page.$$('.company-card')).length === 2, 'al ingresar elige entre sus 2 empresas');
  await page.click('.company-card[data-pick="2"]');
  await page.waitForFunction(() => window.__app.empresaId === 2, null, { timeout: 15000 });
  check((await page.textContent('#sideCompany')).includes('Textil'), 'trabaja en Textil Andina SAC');
  await page.click('#logoutBtn');

  console.log('Sesión vencida');
  await login('admin', 'uni2026');
  await page.waitForSelector('#companyScreen:not(.hidden)');
  await page.click('.company-card[data-pick="1"]');
  await page.waitForFunction(() => window.__app.empresaId === 1, null, { timeout: 15000 });
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
