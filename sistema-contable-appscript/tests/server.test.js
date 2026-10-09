'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { build, DIST } = require('../build.js');
const { createRuntime } = require('./gas-mock.js');
const E = require('../../sistema-contable/public/js/engine.js');
const Seed = require('../../sistema-contable/public/js/seed.js');

build();
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} ≠ ${b}`);
const fresh = () => createRuntime(DIST);
const loginAdmin = rt => rt.run('login', 'admin', 'uni2026');

/** Resumen contable comparable entre dos bases (asientos y saldos). */
function resumen(db) {
  const c = E.compute(db);
  return JSON.stringify({ n: c.entries.length, lines: c.entries.map(e => e.lines.map(l => [l.cuenta, l.debe, l.haber])), neto: E.resultadosFuncion(c).neto });
}

test('instalación: crea las hojas, el usuario admin y carga los datos de ejemplo', () => {
  const rt = fresh();
  const html = rt.ctx.doGet().getContent();
  assert.ok(!html.includes('<?'), 'no quedan scriptlets sin procesar');
  assert.ok(html.includes('window.AppBackend') && html.includes('Engine') && html.includes('loginForm'), 'la página incluye scripts y estilos');
  ['Config', 'Usuarios', 'Bitacora', 'Compras', 'ComprasDetalle', 'Ventas', 'VentasDetalle', 'Asientos', 'AsientosDetalle', 'OrdenesTrabajo', 'Trabajadores', 'ConceptosCIF', 'Inductores'].forEach(n => assert.ok(rt.sheet(n), 'existe la hoja ' + n));
  assert.ok(!rt.sheet('Hoja 1'), 'se elimina la hoja vacía por defecto');
  assert.equal(rt.sheet('Usuarios').rows()[1][0], 'admin');
  assert.notEqual(rt.sheet('Usuarios').rows()[1][4], 'uni2026', 'la contraseña no se guarda en texto plano');
  // ejecutar instalar otra vez no borra datos
  const filas = rt.sheet('Compras').getLastRow();
  rt.ctx.instalar();
  assert.equal(rt.sheet('Compras').getLastRow(), filas);
});

test('login: rechaza clave incorrecta y devuelve la base completa', () => {
  const rt = fresh();
  assert.match(rt.run('login', 'admin', 'mala').error, /incorrectos/);
  const r = loginAdmin(rt);
  assert.ok(r.token && r.user.rol === 'ADMIN' && r.rev >= 1);
  assert.equal(resumen(r.db), resumen(Seed.create()), 'los datos leídos de Sheets dan la misma contabilidad que los datos de ejemplo');
  assert.equal(r.db.compras[0].items.length, 3);
  assert.deepEqual(r.db.compras[1].items[0], { tipo: 'MATERIAL', materialId: 1, cantidad: 1500, costoUnit: 6.2 });
  assert.equal(r.db.empresa.ruc, '20000000001', 'el RUC sigue siendo texto');
  assert.equal(r.db.ordenes[0].fechaInicio, '2026-10-02', 'las fechas siguen en formato aaaa-mm-dd');
  assert.equal(r.db.trabajadores[0].asigFam, true);
  assert.equal(r.db.requisiciones[5].otId, null);
  assert.equal(r.db.empresa.igvPct, 18);
});

test('guardar: solo escribe lo que cambió, valida stock y controla conflictos', () => {
  const rt = fresh();
  const { token, db, rev } = loginAdmin(rt);
  const compras = db.compras.concat([{ id: 99, fecha: '2026-10-25', tipoDoc: '01', documento: 'F009-00001', proveedor: 'Proveedor Prueba SAC', ruc: '20123123123', condicion: 'CREDITO', items: [{ tipo: 'MATERIAL', materialId: 1, cantidad: 100, costoUnit: 7 }] }]);
  const r = rt.run('saveChanges', token, { compras }, rev);
  assert.equal(r.rev, rev + 1);
  const det = rt.sheet('ComprasDetalle').rows();
  assert.ok(det.some(row => row[0] === 99 && row[2] === 'MATERIAL' && row[4] === 100), 'el detalle se guarda en ComprasDetalle');
  assert.equal(rt.sheet('Compras').rows().find(row => row[0] === 99)[5], '20123123123', 'RUC como texto');
  const back = rt.run('getDb', token);
  assert.equal(back.db.compras.length, 11);
  assert.equal(E.compute(back.db).kMat.items.M1.saldoCant, 1100, 'el kardex refleja la compra');
  assert.ok(rt.sheet('Bitacora').rows().some(row => row[2] === 'Guardar' && row[3] === 'compras'), 'queda en la bitácora');

  // conflicto: rev desactualizado
  const c = rt.run('saveChanges', token, { compras: db.compras }, rev);
  assert.equal(c.conflict, true);
  assert.equal(c.db.compras.length, 11, 'devuelve los datos vigentes');

  // stock insuficiente
  const req = back.db.requisiciones.concat([{ id: 77, fecha: '2026-10-22', numero: 'RQ-077', otId: 3, materialId: 3, cantidad: 9999 }]);
  assert.match(rt.run('saveChanges', token, { requisiciones: req }, back.rev).error, /Stock insuficiente/);

  // claves no permitidas se ignoran
  assert.equal(rt.run('saveChanges', token, { hackeo: 1 }, back.rev).rev, back.rev);
});

test('periodo cerrado y perfiles de usuario', () => {
  const rt = fresh();
  const { token, db, rev } = loginAdmin(rt);
  const r1 = rt.run('saveChanges', token, { cierre: { realizado: true, fecha: '2026-10-31' } }, rev);
  assert.equal(r1.rev, rev + 1);
  assert.match(rt.run('saveChanges', token, { compras: [] }, r1.rev).error, /cerrado/);
  const r2 = rt.run('saveChanges', token, { cierre: { realizado: false } }, r1.rev);
  assert.equal(rt.run('getDb', token).db.cierre.realizado, false);

  assert.equal(rt.run('saveUser', token, { usuario: 'lector', nombre: 'Profesor', rol: 'CONSULTA', activo: true, clave: 'consulta1', nuevo: true }).ok, true);
  assert.equal(rt.run('saveUser', token, { usuario: 'conta', nombre: 'Contador', rol: 'CONTADOR', activo: true, clave: 'contador1', nuevo: true }).ok, true);
  assert.match(rt.run('saveUser', token, { usuario: 'conta', nombre: 'x', rol: 'CONTADOR', activo: true, clave: 'contador1', nuevo: true }).error, /Ya existe/);
  const lector = rt.run('login', 'lector', 'consulta1');
  assert.equal(lector.user.rol, 'CONSULTA');
  assert.match(rt.run('saveChanges', lector.token, { compras: db.compras }, r2.rev).error, /solo consulta/);
  assert.match(rt.run('listUsers', lector.token).error, /ADMIN/);
  const conta = rt.run('login', 'conta', 'contador1');
  assert.equal(rt.run('saveChanges', conta.token, { tesoreria: db.tesoreria.slice(0, 2) }, r2.rev).rev, r2.rev + 1);
  assert.match(rt.run('resetDemo', conta.token).error, /ADMIN/);

  assert.equal(rt.run('changePassword', conta.token, 'contador1', 'nueva123').ok, true);
  assert.match(rt.run('login', 'conta', 'contador1').error, /incorrectos/);
  assert.ok(rt.run('login', 'conta', 'nueva123').token);

  assert.match(rt.run('deleteUser', token, 'admin').error, /propio/);
  assert.match(rt.run('saveUser', token, { usuario: 'admin', nombre: 'A', rol: 'CONTADOR', activo: true, clave: '', nuevo: false }).error, /al menos un usuario ADMIN/);
  assert.equal(rt.run('deleteUser', token, 'lector').ok, true);
  assert.deepEqual(rt.run('listUsers', token).map(u => u.usuario).sort(), ['admin', 'conta']);

  assert.equal(rt.run('getDb', 'token-falso').error, 'SESION_VENCIDA');
  rt.run('logout', token);
  assert.equal(rt.run('getDb', token).error, 'SESION_VENCIDA');
});

test('restaurar backup, datos de ejemplo y base vacía', () => {
  const rt = fresh();
  const { token, db } = loginAdmin(rt);
  const empty = E.emptyDb();
  empty.empresa = { ...db.empresa, cajaInicial: 0 };
  const r = rt.run('replaceDb', token, empty);
  assert.equal(r.db.compras.length, 0);
  assert.equal(r.db.empresa.razon, 'OMEGA SAC');
  assert.equal(rt.sheet('Compras').getLastRow(), 1, 'solo queda el encabezado');
  assert.match(rt.run('replaceDb', token, { foo: 1 }).error, /backup/);
  const d = rt.run('resetDemo', token);
  assert.equal(resumen(d.db), resumen(Seed.create()));
});

test('edición manual en Sheets: fechas convertidas por Sheets se leen bien', () => {
  const rt = fresh();
  const { token } = loginAdmin(rt);
  const sh = rt.sheet('Ventas');
  sh.getRange(2, 2).setNumberFormat('General').setValue('2026-10-27'); // Sheets lo convierte en fecha
  rt.ctx.onEdit({ range: sh.getRange(2, 2) });
  const r = rt.run('getDb', token);
  assert.equal(r.db.ventas[0].fecha, '2026-10-27');
});

test('reportes contables en hojas R_', () => {
  const rt = fresh();
  const { token } = loginAdmin(rt);
  const r = rt.run('generarReportes', token);
  assert.equal(r.hojas.length, 11);
  r.hojas.forEach(h => assert.ok(rt.sheet(h).getLastRow() > 4, h + ' tiene datos'));
  const diario = rt.sheet('R_LibroDiario').rows();
  const tot = diario[diario.length - 1];
  assert.equal(tot[2], 'TOTALES');
  near(tot[7], tot[8], 'el libro diario cuadra');
  const bc = rt.sheet('R_BalanceComprobacion').rows();
  const res = bc[bc.length - 1];
  near(res[6], 11477.8, 'resultado según inventario');
  near(res[8], 11477.8, 'resultado por naturaleza');
  near(res[10], 11477.8, 'resultado por función');
  const info = rt.run('getSheetInfo', token);
  assert.ok(info.url.includes('SHEET-TEST') && info.hojas.find(h => h.hoja === 'Compras').filas === 10);
});

test('funciones de menú no se pueden usar desde la web y las privadas no son accesibles', () => {
  const rt = fresh();
  assert.throws(() => rt.run('restaurarDatosEjemplo'), /getUi/);
  assert.throws(() => rt.run('restablecerAdmin'), /getUi/);
  assert.throws(() => rt.run('readDb_'), /no disponible/);
  rt.uiAvailable = true;
  rt.ctx.restablecerAdmin();
  assert.ok(rt.run('login', 'admin', 'uni2026').token);
});

test('la base de ejemplo cabe en la caché de Apps Script', () => {
  const rt = fresh();
  loginAdmin(rt);
  assert.ok(rt.cache.has('db'), 'se guarda en caché (< 100 KB)');
  assert.ok(path.basename(DIST) === 'dist');
});
