'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const Seed = require('../public/js/seed.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} ≠ ${b}`);

function invariants(db, label) {
  const c = E.compute(db);
  // Partida doble
  c.entries.forEach(e => near(e.debe, e.haber, `${label} asiento ${e.num} cuadra`));
  near(E.sumBy(c.entries, 'debe'), E.sumBy(c.entries, 'haber'), `${label} diario cuadra`);
  // Balance de comprobación: los tres resultados coinciden
  const bc = E.balanceComprobacion(c);
  near(bc.tot.debe, bc.tot.haber, `${label} sumas iguales`);
  near(bc.tot.deudor, bc.tot.acreedor, `${label} saldos iguales`);
  near(bc.resInventario, bc.resNaturaleza, `${label} inventario = naturaleza`);
  near(bc.resNaturaleza, bc.resFuncion, `${label} naturaleza = función`);
  // Estado de situación cuadra
  const es = E.estadoSituacion(c);
  near(es.tActivo, es.tPasPat, `${label} Activo = Pasivo + Patrimonio`);
  // Resultados por función = por naturaleza
  near(E.resultadosFuncion(c).neto, E.resultadosNaturaleza(c).neto, `${label} resultado función = naturaleza`);
  // Flujo de efectivo = saldo de la cuenta 10
  const f = E.flujoEfectivo(c);
  near(f.saldoFinal, f.saldoContable, `${label} flujo = cuenta 10`);
  // Kardex = cuentas 24 / 25 / 21
  [...Object.values(c.kMat.items), ...Object.values(c.kPT.items)].forEach(i =>
    near(i.saldoTotal, c.Lpre[i.cuenta] ? c.Lpre[i.cuenta].saldo : 0, `${label} kardex ${i.nombre} = cuenta ${i.cuenta}`));
  // Estado de costos: costo de ventas = cuenta 69
  const ec = E.estadoCostos(c);
  near(ec.costoVentas, ec.costoVentasContable, `${label} estado de costos = 69`);
  // Mayor de fábrica totalmente trasladado
  near(E.saldoPrefix(c.Lpre, '91') + E.saldoPrefix(c.Lpre, '92') + E.saldoPrefix(c.Lpre, '93'), 0, `${label} 91-93 saldadas`);
  // 23 por O/T en proceso = costo de la O/T
  db.ordenes.filter(o => o.estado !== 'TERMINADA').forEach(o => near(c.Lpre[E.otAccount(o)]?.saldo || 0, c.cost.porOT[o.id].total, `${label} 23 ${o.numero}`));
  assert.equal(E.validar(c).filter(v => v.nivel === 'error').length, 0, `${label} sin errores de validación`);
  return c;
}

test('datos de ejemplo (promedio): todas las cuadraturas', () => {
  invariants(Seed.create(), 'PROMEDIO');
});

test('datos de ejemplo (PEPS): todas las cuadraturas', () => {
  const db = Seed.create();
  db.empresa.metodo = 'PEPS';
  invariants(db, 'PEPS');
});

test('costo de materia prima directa por O/T: promedio vs PEPS', () => {
  const db = Seed.create();
  let c = E.compute(db);
  assert.equal(c.cost.porOT[1].md, 6590);   // 600 × 6.15 + 20 × 145
  assert.equal(c.cost.porOT[2].md, 10760);  // 800 × 6.15 + 160 × 22 + 16 × 145
  assert.equal(c.cost.porOT[3].md, 3990);   // 400 × 6.35 + 10 × 145
  db.empresa.metodo = 'PEPS';
  c = E.compute(db);
  assert.equal(c.cost.porOT[1].md, 6520);   // 500 × 6 + 100 × 6.2 + 2900
  assert.equal(c.cost.porOT[2].md, 10800);  // 800 × 6.2 + 3520 + 2320
  assert.equal(c.cost.porOT[3].md, 3930);   // 400 × 6.2 + 1450
});

test('la compra de MP actualiza el kardex y la cuenta 24 del material', () => {
  const db = Seed.create();
  const before = E.compute(db).kMat.items.M1;
  db.compras.push({ id: 99, fecha: '2026-10-25', tipoDoc: '01', documento: 'F001-99999', proveedor: 'Prueba SAC', ruc: '20999999999', condicion: 'CREDITO', items: [{ tipo: 'MATERIAL', materialId: 1, cantidad: 100, costoUnit: 7 }] });
  const c = invariants(db, 'compra extra');
  const after = c.kMat.items.M1;
  assert.equal(after.saldoCant, before.saldoCant + 100);
  near(after.saldoTotal, before.saldoTotal + 700, 'valor kardex');
  near(c.Lpre['24101'].saldo, after.saldoTotal, 'cuenta 24101');
  const asiento = c.entries.find(e => e.origen.kind === 'compra' && e.origen.id === 99 && e.sub === 0);
  assert.deepEqual(asiento.lines.map(l => [l.cuenta, l.debe, l.haber]), [['6021', 700, 0], ['40111', 126, 0], ['4212', 0, 826]]);
  const alm = c.entries.find(e => e.origen.kind === 'compra' && e.origen.id === 99 && e.sub === 1);
  assert.deepEqual(alm.lines.map(l => [l.cuenta, l.debe, l.haber]), [['24101', 700, 0], ['6121', 0, 700]]);
});

test('planilla: clasificación MOD / MOI / ADM / VEN y destino contable', () => {
  const db = Seed.create();
  const c = E.compute(db);
  const pl = c.pl;
  const juan = pl.find(w => w.nombre === 'Juan Quispe');
  assert.equal(juan.bruto, 1913);        // 1800 + asignación familiar 113
  assert.equal(juan.onp, 248.69);        // 13 %
  assert.equal(juan.neto, 1664.31);
  assert.equal(juan.essalud, 172.17);    // 9 %
  const destino = c.entries.find(e => e.origen.kind === 'planilla' && e.sub === 1);
  const by = Object.fromEntries(destino.lines.map(l => [l.cuenta, l.debe || l.haber]));
  near(by['921'], E.sumBy(pl.filter(w => w.clasificacion === 'MOD'), 'costo'), 'MOD a 92');
  near(by['931'], E.sumBy(pl.filter(w => w.clasificacion === 'MOI'), 'costo'), 'MOI a 93');
  near(by['941'], E.sumBy(pl.filter(w => w.clasificacion === 'ADM'), 'costo'), 'ADM a 94');
  near(by['951'], E.sumBy(pl.filter(w => w.clasificacion === 'VEN'), 'costo'), 'VEN a 95');
  // La MOD completa se asigna a las O/T
  near(E.sumBy(Object.values(c.cost.porOT), 'mod'), by['921'], 'MOD asignada a O/T');
});

test('CIF: cada concepto tiene inductor y se distribuye completo a las O/T', () => {
  const db = Seed.create();
  const c = E.compute(db);
  db.conceptosCIF.forEach(cc => assert.ok(E.byId(db.inductores, cc.inductorId), `${cc.nombre} tiene inductor`));
  c.cost.pools.forEach(p => near(p.asignado.reduce((s, v) => s + v, 0), p.monto, `CIF ${p.concepto.nombre} distribuido`));
  near(E.sumBy(c.cost.pools, 'monto'), 9948, 'CIF total del periodo');
  // Energía: 1450 / 1250 kWh → OT-001 400 kWh = 464
  const energia = c.cost.pools.find(p => p.concepto.codigo === 'CIF-03');
  assert.equal(energia.asignado[0], 464);
  // El CIF pasa por gasto (6x) → 93 → 23
  const t1 = c.entries.find(e => e.origen.kind === 'ot' && e.origen.id === 1 && e.sub === 0 && e.ord === 6);
  const l = Object.fromEntries(t1.lines.map(x => [x.cuenta, x.debe || x.haber]));
  near(l['23101'], c.cost.porOT[1].total, 'cargo a 23 de la OT-001');
  near(l['931'], c.cost.porOT[1].cif, 'abono a 93 de la OT-001');
});

test('stock insuficiente bloquea la grabación', () => {
  const db = Seed.create();
  db.requisiciones.push({ id: 50, fecha: '2026-10-22', numero: 'RQ-050', otId: 3, materialId: 3, cantidad: 1000 });
  const errs = E.blockingErrors(db);
  assert.ok(errs.some(e => e.includes('Stock insuficiente')), 'detecta stock negativo');
  const db2 = Seed.create();
  db2.ventas.push({ id: 9, fecha: '2026-10-31', tipoDoc: '01', documento: 'F001-00099', cliente: 'X', ruc: '', condicion: 'CREDITO', items: [{ productoId: 2, cantidad: 500, precioUnit: 100 }] });
  assert.ok(E.blockingErrors(db2).length > 0, 'no se vende más de lo producido');
});

test('cierre del ejercicio: cancela resultados y traslada la utilidad a 59', () => {
  const db = Seed.create();
  const neto = E.resultadosFuncion(E.compute(db)).neto;
  db.cierre = { realizado: true };
  const c = E.compute(db);
  Object.values(c.L).forEach(a => {
    if (/^[6789]/.test(a.codigo)) near(a.saldo, 0, `cuenta ${a.codigo} saldada tras el cierre`);
  });
  near(-c.L['5911'].saldo, neto, 'utilidad en 5911');
  near(E.sumBy(c.entries, 'debe'), E.sumBy(c.entries, 'haber'), 'diario cuadra con cierre');
  // Los EEFF se siguen calculando antes del cierre
  near(E.resultadosFuncion(c).neto, neto, 'resultado en EEFF');
  invariants(db, 'cerrado');
});

test('base vacía no rompe el motor', () => {
  const c = E.compute(E.emptyDb());
  assert.equal(c.entries.length, 0);
  near(E.estadoSituacion(c).diferencia, 0, 'balance vacío');
});

test('asignación con redondeo cuadra al céntimo', () => {
  const parts = E.allocate(100, [1, 1, 1]);
  near(parts.reduce((a, b) => a + b, 0), 100, 'suma 100');
  assert.deepEqual(E.allocate(50, [0, 0]), [0, 0]);
});
