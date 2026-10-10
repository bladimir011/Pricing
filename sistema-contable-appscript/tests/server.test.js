'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, DIST } = require('../build.js');
const { createRuntime } = require('./gas-mock.js');
const E = require('../../sistema-contable/public/js/engine.js');
const Seed = require('../../sistema-contable/public/js/seed.js');

build();
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} ≠ ${b}`);
const fresh = () => createRuntime(DIST);
const loginAdmin = rt => rt.run('login', 'admin', 'uni2026');
/** Ingresa como admin y abre la empresa 1. */
function openAdmin(rt) {
  const l = loginAdmin(rt);
  const o = rt.run('openEmpresa', l.token, 1);
  return { token: l.token, empresas: l.empresas, db: o.db, rev: o.rev };
}
const col = (rt, sheet, name) => rt.sheet(sheet).rows()[0].indexOf(name);

/** Resumen contable comparable entre dos bases (asientos y saldos). */
function resumen(db) {
  const c = E.compute(db);
  return JSON.stringify({ n: c.entries.length, lines: c.entries.map(e => e.lines.map(l => [l.cuenta, l.debe, l.haber])), neto: E.resultadosFuncion(c).neto });
}

test('instalación: crea las hojas, la empresa 1, el usuario admin y carga los datos de ejemplo', () => {
  const rt = fresh();
  const html = rt.ctx.doGet().getContent();
  assert.ok(!/<\?!?=?\s*include/.test(html), 'no quedan scriptlets sin procesar');
  ['window.AppBackend', 'Engine', 'loginForm', 'XlsxWriter', 'window.MANUAL', 'companyScreen', 'uni_tema', 'data-theme-switch'].forEach(x => assert.ok(html.includes(x), 'la página incluye ' + x));
  ['Empresas', 'Usuarios', 'Bitacora', 'Compras', 'ComprasDetalle', 'Ventas', 'VentasDetalle', 'Asientos', 'AsientosDetalle', 'OrdenesTrabajo', 'Trabajadores', 'ConceptosCIF', 'Inductores', 'Cuentas'].forEach(n => assert.ok(rt.sheet(n), 'existe la hoja ' + n));
  assert.ok(!rt.sheet('Config'), 'ya no se usa la hoja Config');
  assert.ok(!rt.sheet('Hoja 1'), 'se elimina la hoja vacía por defecto');
  assert.equal(rt.sheet('Empresas').rows()[1][col(rt, 'Empresas', 'razon')], 'OMEGA SAC');
  assert.equal(rt.sheet('Compras').rows()[0][0], 'empresaId', 'cada tabla tiene la columna empresaId');
  const users = rt.sheet('Usuarios').rows();
  assert.equal(users[1][0], 'admin');
  assert.equal(users[1][col(rt, 'Usuarios', 'empresas')], '*');
  assert.notEqual(users[1][col(rt, 'Usuarios', 'hash')], 'uni2026', 'la contraseña no se guarda en texto plano');
  const filas = rt.sheet('Compras').getLastRow();
  rt.ctx.instalar();
  assert.equal(rt.sheet('Compras').getLastRow(), filas, 'ejecutar instalar otra vez no borra datos');
});

test('login y apertura de empresa: devuelve las empresas del usuario y la base completa', () => {
  const rt = fresh();
  assert.match(rt.run('login', 'admin', 'mala').error, /incorrectos/);
  const l = loginAdmin(rt);
  assert.ok(l.token && l.user.rol === 'ADMIN');
  assert.deepEqual(l.empresas.map(e => [e.id, e.razon]), [[1, 'OMEGA SAC']]);
  assert.equal(l.db, undefined, 'el login ya no envía la base: se abre por empresa');
  const r = rt.run('openEmpresa', l.token, 1);
  assert.ok(r.rev >= 1);
  assert.equal(resumen(r.db), resumen(Seed.create()), 'los datos leídos de Sheets dan la misma contabilidad que los datos de ejemplo');
  assert.equal(r.db.compras[0].items.length, 3);
  assert.deepEqual(r.db.compras[1].items[0], { tipo: 'MATERIAL', materialId: 1, cantidad: 1500, costoUnit: 6.2 });
  assert.equal(r.db.empresa.ruc, '20000000001', 'el RUC sigue siendo texto');
  assert.equal(r.db.ordenes[0].fechaInicio, '2026-10-02', 'las fechas siguen en formato aaaa-mm-dd');
  assert.equal(r.db.trabajadores[0].asigFam, true);
  assert.equal(r.db.requisiciones[5].otId, null);
  assert.equal(r.db.empresa.igvPct, 18);
  assert.equal(r.db.cierre.realizado, false);
  assert.match(rt.run('openEmpresa', l.token, 99).error, /no existe/);
});

test('guardar: solo escribe lo que cambió, valida stock y controla conflictos', () => {
  const rt = fresh();
  const { token, db, rev } = openAdmin(rt);
  const compras = db.compras.concat([{ id: 99, fecha: '2026-10-25', tipoDoc: '01', documento: 'F009-00001', proveedor: 'Proveedor Prueba SAC', ruc: '20123123123', condicion: 'CREDITO', items: [{ tipo: 'MATERIAL', materialId: 1, cantidad: 100, costoUnit: 7 }] }]);
  const r = rt.run('saveChanges', token, 1, { compras }, rev);
  assert.equal(r.rev, rev + 1);
  const det = rt.sheet('ComprasDetalle').rows();
  const dc = n => col(rt, 'ComprasDetalle', n);
  assert.ok(det.some(row => row[dc('compraId')] === 99 && row[dc('tipo')] === 'MATERIAL' && row[dc('cantidad')] === 100 && row[dc('empresaId')] === 1), 'el detalle se guarda en ComprasDetalle');
  assert.equal(rt.sheet('Compras').rows().find(row => row[col(rt, 'Compras', 'id')] === 99)[col(rt, 'Compras', 'ruc')], '20123123123', 'RUC como texto');
  const back = rt.run('getDb', token, 1);
  assert.equal(back.db.compras.length, 11);
  assert.equal(E.compute(back.db).kMat.items.M1.saldoCant, 1100, 'el kardex refleja la compra');
  assert.ok(rt.sheet('Bitacora').rows().some(row => row[2] === 'Guardar' && row[3] === 'empresa 1: compras'), 'queda en la bitácora');

  const c = rt.run('saveChanges', token, 1, { compras: db.compras }, rev);
  assert.equal(c.conflict, true, 'conflicto: rev desactualizado');
  assert.equal(c.db.compras.length, 11, 'devuelve los datos vigentes');

  const req = back.db.requisiciones.concat([{ id: 77, fecha: '2026-10-22', numero: 'RQ-077', otId: 3, materialId: 3, cantidad: 9999 }]);
  assert.match(rt.run('saveChanges', token, 1, { requisiciones: req }, back.rev).error, /Stock insuficiente/);
  assert.equal(rt.run('saveChanges', token, 1, { hackeo: 1 }, back.rev).rev, back.rev, 'claves no permitidas se ignoran');
});

test('multiempresa: crear, separar datos, cuentas propias, asignar usuarios y eliminar', () => {
  const rt = fresh();
  const { token, db } = openAdmin(rt);
  const filasCompras = rt.sheet('Compras').getLastRow();

  // Empresa 2: copia de las tablas maestras (plan de cuentas, materiales, CIF...) sin movimientos
  let list = rt.run('createEmpresa', token, 1, { razon: 'Textil Andina SAC', ruc: '20999999991', periodo: '2026-11', modo: 'copia' });
  assert.deepEqual(list.map(e => e.razon), ['OMEGA SAC', 'Textil Andina SAC']);
  const e2 = rt.run('openEmpresa', token, 2);
  assert.equal(e2.db.empresa.razon, 'Textil Andina SAC');
  assert.equal(e2.db.empresa.periodo, '2026-11');
  assert.equal(e2.db.compras.length, 0, 'la empresa nueva no tiene documentos');
  assert.equal(e2.db.materiales.length, db.materiales.length, 'copia los materiales');
  assert.equal(e2.db.conceptosCIF.length, db.conceptosCIF.length, 'copia los conceptos CIF');
  assert.equal(rt.sheet('Compras').getLastRow(), filasCompras, 'los documentos de la empresa 1 siguen intactos');

  // Cada empresa maneja sus propias cuentas y asientos
  const cuentas = e2.db.cuentas.concat([{ id: 900, codigo: '4699', nombre: 'Otras cuentas por pagar Textil' }]);
  const r1 = rt.run('saveChanges', token, 2, { cuentas }, e2.rev);
  const asientos = [{ id: 1, fecha: '2026-11-05', tipo: 'Operación', actividad: 'Financiamiento', glosa: 'Préstamo recibido', lineas: [{ cuenta: '1041', debe: 5000, haber: 0, aux: '' }, { cuenta: '4699', debe: 0, haber: 5000, aux: '' }] }];
  rt.run('saveChanges', token, 2, { asientos }, r1.rev);
  const d2 = rt.run('getDb', token, 2).db;
  assert.ok(d2.cuentas.some(x => x.codigo === '4699'));
  assert.equal(d2.asientos[0].lineas.length, 2);
  assert.equal(d2.asientos[0].actividad, 'Financiamiento');
  const f2 = E.flujoEfectivo(E.compute(d2));
  near(f2.secciones.find(s => s.actividad === 'Financiamiento').neto, 5000, 'el asiento manual va a financiamiento en el flujo');
  const d1 = rt.run('getDb', token, 1).db;
  assert.ok(!d1.cuentas.some(x => x.codigo === '4699'), 'la cuenta nueva no aparece en la empresa 1');
  assert.equal(resumen(d1), resumen(Seed.create()), 'la empresa 1 no cambia');
  assert.equal(rt.run('getSheetInfo', token, 2).hojas.find(h => h.hoja === 'AsientosDetalle').filas, 2);

  // Empresa 3 vacía y empresa 4 con datos de ejemplo
  rt.run('createEmpresa', token, 1, { razon: 'Servicios Lima EIRL', modo: 'vacia' });
  list = rt.run('createEmpresa', token, 1, { razon: 'Demo Ejemplo SAC', modo: 'ejemplo' });
  assert.equal(list.length, 4);
  assert.equal(rt.run('getDb', token, 3).db.materiales.length, 0);
  assert.equal(rt.run('getDb', token, 4).db.compras.length, 10);
  assert.match(rt.run('createEmpresa', token, 1, { razon: 'X' }).error, /razón social/);
  assert.match(rt.run('createEmpresa', token, 1, { razon: 'Mala SAC', ruc: '123' }).error, /RUC/);

  // Usuario con dos empresas (1 y 2) y otro solo con la 3
  assert.equal(rt.run('saveUser', token, 1, { usuario: 'jorihuela', nombre: 'Jennifer', rol: 'CONTADOR', activo: true, clave: 'clave123', nuevo: true, empresas: [1, 2] }).ok, true);
  assert.equal(rt.run('saveUser', token, 1, { usuario: 'otro', nombre: 'Otro', rol: 'CONTADOR', activo: true, clave: 'clave123', nuevo: true, empresas: [3] }).ok, true);
  assert.match(rt.run('saveUser', token, 1, { usuario: 'sinemp', nombre: 'x', rol: 'CONTADOR', activo: true, clave: 'clave123', nuevo: true, empresas: [] }).error, /al menos una empresa/);
  assert.equal(rt.sheet('Usuarios').rows().find(r => r[0] === 'jorihuela')[col(rt, 'Usuarios', 'empresas')], '1,2');
  const j = rt.run('login', 'jorihuela', 'clave123');
  assert.deepEqual(j.empresas.map(e => e.id), [1, 2], 've solo sus empresas');
  assert.ok(rt.run('openEmpresa', j.token, 2).db);
  assert.match(rt.run('openEmpresa', j.token, 3).error, /no tiene acceso/);
  assert.match(rt.run('saveChanges', j.token, 3, { compras: [] }, 1).error, /no tiene acceso/);
  assert.match(rt.run('createEmpresa', j.token, 1, { razon: 'Nueva SAC' }).error, /ADMIN/);
  assert.deepEqual(rt.run('listUsers', token, 1).find(u => u.usuario === 'jorihuela').empresas, [1, 2]);

  // Eliminar empresa: no la abierta, sí otra; sus filas y su asignación desaparecen; el ID no se reutiliza
  assert.match(rt.run('deleteEmpresa', token, 1, 1).error, /abierta/);
  assert.match(rt.run('deleteEmpresa', j.token, 1, 2).error, /ADMIN/);
  list = rt.run('deleteEmpresa', token, 1, 3);
  assert.deepEqual(list.map(e => e.id), [1, 2, 4]);
  assert.equal(rt.run('login', 'otro', 'clave123').empresas.length, 0, 'el usuario de la empresa eliminada queda sin empresas');
  list = rt.run('createEmpresa', token, 1, { razon: 'Posterior SAC', modo: 'vacia' });
  assert.equal(list[list.length - 1].id, 5, 'no se reutiliza el ID 3');
  assert.equal(rt.run('login', 'otro', 'clave123').empresas.length, 0, 'no hereda acceso a la empresa nueva');
  list = rt.run('deleteEmpresa', token, 1, 2);
  assert.ok(!rt.sheet('AsientosDetalle').rows().slice(1).some(r => r[0] === 2), 'se borran las filas de la empresa 2');
  assert.equal(resumen(rt.run('getDb', token, 1).db), resumen(Seed.create()), 'la empresa 1 sigue intacta');
});

test('periodo cerrado y perfiles de usuario', () => {
  const rt = fresh();
  const { token, db, rev } = openAdmin(rt);
  const r1 = rt.run('saveChanges', token, 1, { cierre: { realizado: true, fecha: '2026-10-31' } }, rev);
  assert.equal(r1.rev, rev + 1);
  assert.equal(rt.sheet('Empresas').rows()[1][col(rt, 'Empresas', 'cierreRealizado')], true);
  assert.match(rt.run('saveChanges', token, 1, { compras: [] }, r1.rev).error, /cerrado/);
  const r2 = rt.run('saveChanges', token, 1, { cierre: { realizado: false } }, r1.rev);
  assert.equal(rt.run('getDb', token, 1).db.cierre.realizado, false);

  assert.equal(rt.run('saveUser', token, 1, { usuario: 'lector', nombre: 'Profesor', rol: 'CONSULTA', activo: true, clave: 'consulta1', nuevo: true, empresas: [1] }).ok, true);
  assert.equal(rt.run('saveUser', token, 1, { usuario: 'conta', nombre: 'Contador', rol: 'CONTADOR', activo: true, clave: 'contador1', nuevo: true, empresas: [1] }).ok, true);
  assert.match(rt.run('saveUser', token, 1, { usuario: 'conta', nombre: 'x', rol: 'CONTADOR', activo: true, clave: 'contador1', nuevo: true, empresas: [1] }).error, /Ya existe/);
  const lector = rt.run('login', 'lector', 'consulta1');
  assert.equal(lector.user.rol, 'CONSULTA');
  assert.match(rt.run('saveChanges', lector.token, 1, { compras: db.compras }, r2.rev).error, /solo consulta/);
  assert.match(rt.run('listUsers', lector.token, 1).error, /ADMIN/);
  const conta = rt.run('login', 'conta', 'contador1');
  assert.equal(rt.run('saveChanges', conta.token, 1, { tesoreria: db.tesoreria.slice(0, 2) }, r2.rev).rev, r2.rev + 1);
  assert.match(rt.run('resetDemo', conta.token, 1).error, /ADMIN/);

  assert.equal(rt.run('changePassword', conta.token, 1, 'contador1', 'nueva123').ok, true);
  assert.match(rt.run('login', 'conta', 'contador1').error, /incorrectos/);
  assert.ok(rt.run('login', 'conta', 'nueva123').token);

  assert.match(rt.run('deleteUser', token, 1, 'admin').error, /propio/);
  assert.match(rt.run('saveUser', token, 1, { usuario: 'admin', nombre: 'A', rol: 'CONTADOR', activo: true, clave: '', nuevo: false, empresas: [1] }).error, /al menos un usuario ADMIN/);
  assert.equal(rt.run('deleteUser', token, 1, 'lector').ok, true);
  assert.deepEqual(rt.run('listUsers', token, 1).map(u => u.usuario).sort(), ['admin', 'conta']);

  assert.equal(rt.run('getDb', 'token-falso', 1).error, 'SESION_VENCIDA');
  rt.run('logout', token);
  assert.equal(rt.run('getDb', token, 1).error, 'SESION_VENCIDA');
});

test('restaurar backup, datos de ejemplo y base vacía (solo en la empresa abierta)', () => {
  const rt = fresh();
  const { token, db } = openAdmin(rt);
  rt.run('createEmpresa', token, 1, { razon: 'Segunda SAC', modo: 'ejemplo' });
  const empty = E.emptyDb();
  empty.empresa = { ...db.empresa, cajaInicial: 0 };
  const r = rt.run('replaceDb', token, 1, empty);
  assert.equal(r.db.compras.length, 0);
  assert.equal(r.db.empresa.razon, 'OMEGA SAC');
  assert.equal(rt.run('getDb', token, 2).db.compras.length, 10, 'la otra empresa conserva sus datos');
  assert.match(rt.run('replaceDb', token, 1, { foo: 1 }).error, /backup/);
  const d = rt.run('resetDemo', token, 1);
  assert.equal(resumen(d.db), resumen(Seed.create()));
  const d2 = rt.run('resetDemo', token, 2);
  assert.equal(d2.db.empresa.razon, 'Segunda SAC', 'los datos de ejemplo conservan la razón social de la empresa');
});

test('edición manual en Sheets: fechas convertidas por Sheets se leen bien', () => {
  const rt = fresh();
  const { token } = openAdmin(rt);
  const sh = rt.sheet('Ventas');
  const c = col(rt, 'Ventas', 'fecha') + 1;
  sh.getRange(2, c).setNumberFormat('General').setValue('2026-10-27'); // Sheets lo convierte en fecha
  rt.ctx.onEdit({ range: sh.getRange(2, c) });
  assert.equal(rt.run('getDb', token, 1).db.ventas[0].fecha, '2026-10-27');
});

test('reportes contables (R_) y hoja de cálculo de costeo (C_)', () => {
  const rt = fresh();
  const { token, db } = openAdmin(rt);
  const r = rt.run('generarReportes', token, 1);
  const costeo = E.costeoSheets(E.compute(db));
  assert.equal(r.hojas.filter(h => h.startsWith('R_')).length, 12);
  assert.equal(r.hojas.filter(h => h.startsWith('C_')).length, costeo.length);
  r.hojas.forEach(h => assert.ok(rt.sheet(h).getLastRow() > 4, h + ' tiene datos'));
  const diario = rt.sheet('R_LibroDiario').rows();
  const head = diario[3];
  const tot = diario[diario.length - 1];
  assert.equal(tot[2], 'TOTALES');
  near(tot[head.indexOf('Debe')], tot[head.indexOf('Haber')], 'el libro diario cuadra');
  assert.ok(diario.some(row => row[head.indexOf('Actividad')] === 'Financiamiento' || row[head.indexOf('Actividad')] === 'Inversión'), 'el diario muestra la actividad del flujo');
  const bc = rt.sheet('R_BalanceComprobacion').rows();
  const res = bc[bc.length - 1];
  near(res[6], 11477.8, 'resultado según inventario');
  near(res[8], 11477.8, 'resultado por naturaleza');
  near(res[10], 11477.8, 'resultado por función');
  assert.equal(rt.sheet('R_Ratios').getLastRow(), 4 + E.ratios(E.compute(db)).length);

  // La hoja de costeo C_ coincide con la vista "Hoja de cálculo de costeo" de la aplicación
  const ot = rt.sheet('C_' + costeo[0].name).rows();
  assert.deepEqual(ot[3], costeo[0].cols.map(x => x.l));
  assert.equal(ot.length, 4 + costeo[0].rows.length);
  const solo = rt.run('generarCosteo', token, 1);
  assert.ok(solo.hojas.every(h => h.startsWith('C_')) && solo.hojas.length === costeo.length);

  const info = rt.run('getSheetInfo', token, 1);
  assert.ok(info.url.includes('SHEET-TEST') && info.hojas.find(h => h.hoja === 'Compras').filas === 10);
});

test('menú de la hoja: pide la empresa; funciones de menú y privadas no se pueden usar desde la web', () => {
  const rt = fresh();
  assert.throws(() => rt.run('restaurarDatosEjemplo'), /getUi/);
  assert.throws(() => rt.run('restablecerAdmin'), /getUi/);
  assert.throws(() => rt.run('readDb_'), /no disponible/);
  assert.throws(() => rt.run('generarReportes_'), /no disponible/);
  rt.uiAvailable = true;
  rt.ctx.restablecerAdmin();
  assert.ok(rt.run('login', 'admin', 'uni2026').token);
  rt.promptAnswer = '1';
  rt.ctx.generarReportesDesdeMenu();
  assert.ok(rt.sheet('R_LibroDiario') && rt.sheet('C_' + E.costeoSheets(E.compute(Seed.create()))[0].name));
  rt.promptAnswer = '7';
  rt.ctx.restaurarDatosEjemplo();
  assert.ok(rt.uiCalls.some(a => /No existe la empresa 7/.test(a[1])));
});

test('la base de ejemplo cabe en la caché de Apps Script', () => {
  const rt = fresh();
  openAdmin(rt);
  assert.ok(rt.cache.has('db_1'), 'se guarda en caché (< 100 KB)');
});

test('migración: una base de la versión de una sola empresa pasa a ser la empresa 1 sin perder datos', () => {
  // Código de la versión anterior (Config + tablas sin empresaId), guardado en tests/fixtures
  const oldDist = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-old-'));
  fs.writeFileSync(path.join(oldDist, 'Code.gs'), fs.readFileSync(path.join(__dirname, 'fixtures', 'Code-una-empresa.gs'), 'utf8'));
  ['Engine.gs', 'Seed.gs'].forEach(f => fs.copyFileSync(path.join(DIST, f), path.join(oldDist, f)));

  const old = createRuntime(oldDist);
  const l = old.run('login', 'admin', 'uni2026');
  const emp = { ...l.db.empresa, razon: 'OMEGA MIGRADA SAC' };
  const s1 = old.run('saveChanges', l.token, { empresa: emp }, l.rev);
  old.run('saveChanges', l.token, { cierre: { realizado: true, fecha: '2026-10-31' } }, s1.rev);
  old.run('saveUser', l.token, { usuario: 'conta', nombre: 'Contador', rol: 'CONTADOR', activo: true, clave: 'contador1', nuevo: true });
  assert.ok(old.sheet('Config'));

  const rt = createRuntime(DIST, { from: old });
  const a = loginAdmin(rt);
  assert.deepEqual(a.empresas.map(e => [e.id, e.razon]), [[1, 'OMEGA MIGRADA SAC']]);
  assert.ok(!rt.sheet('Config') && rt.sheet('Empresas'), 'Config se convierte en la hoja Empresas');
  const o = rt.run('openEmpresa', a.token, 1);
  assert.equal(o.db.empresa.razon, 'OMEGA MIGRADA SAC');
  assert.deepEqual(o.db.cierre, { realizado: true, fecha: '2026-10-31' });
  assert.equal(resumen({ ...o.db, cierre: { realizado: false } }), resumen(Seed.create()), 'los documentos migrados dan la misma contabilidad');
  const c = rt.run('login', 'conta', 'contador1');
  assert.deepEqual(c.empresas.map(e => e.id), [1], 'los usuarios anteriores quedan asignados a la empresa 1');

  // Al crear otra empresa, las filas antiguas (sin empresaId) se conservan como empresa 1
  rt.run('saveChanges', a.token, 1, { cierre: { realizado: false } }, o.rev);
  rt.run('createEmpresa', a.token, 1, { razon: 'Nueva SAC', modo: 'ejemplo' });
  assert.equal(rt.run('getDb', a.token, 1).db.compras.length, 10);
  assert.equal(rt.run('getDb', a.token, 2).db.compras.length, 10);
  assert.equal(rt.sheet('Compras').getLastRow(), 21);
  fs.rmSync(oldDist, { recursive: true, force: true });
});
