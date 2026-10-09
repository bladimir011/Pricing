/* Motor contable · generado por build.js desde sistema-contable/public/js/engine.js. No editar aquí: editar el original. */
/*
 * Motor contable y de costos (lógica pura, sin DOM).
 * Todos los asientos se GENERAN a partir de los documentos (compras, requisiciones,
 * planilla, O/T, ventas, tesorería...) más los asientos manuales. Así el Diario,
 * el Mayor, el Kardex y los EEFF siempre quedan sincronizados.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  const SCHEMA = 5;
  const EPS = 1e-9;
  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const r4 = n => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
  const num = v => Number(v) || 0;
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const byId = (arr, id) => (arr || []).find(x => Number(x.id) === Number(id));
  const sumBy = (arr, f) => r2(arr.reduce((s, x) => s + num(typeof f === 'function' ? f(x) : x[f]), 0));

  // ---------------------------------------------------------------- Plan de cuentas
  const BASE_CHART = [
    ['1041', 'Cuentas corrientes operativas (Bancos)'],
    ['1212', 'Facturas por cobrar - emitidas en cartera'],
    ['3331', 'Maquinarias y equipos de explotación'],
    ['3351', 'Muebles'],
    ['3361', 'Equipo para procesamiento de información'],
    ['3913', 'Depreciación acumulada - IME costo'],
    ['40111', 'IGV - Cuenta propia'],
    ['40171', 'Impuesto a la renta - Tercera categoría'],
    ['40173', 'Impuesto a la renta - Quinta categoría'],
    ['4031', 'Instituciones públicas - ESSALUD'],
    ['4032', 'Instituciones públicas - ONP'],
    ['4111', 'Sueldos y salarios por pagar'],
    ['4170', 'Administradoras de fondos de pensiones (AFP)'],
    ['4212', 'Facturas por pagar - emitidas'],
    ['4511', 'Préstamos de instituciones financieras'],
    ['5011', 'Capital social - acciones'],
    ['5911', 'Utilidades acumuladas'],
    ['5921', 'Pérdidas acumuladas'],
    ['6021', 'Compras de materias primas'],
    ['6031', 'Compras de materiales auxiliares'],
    ['6121', 'Variación de existencias - materias primas'],
    ['6131', 'Variación de existencias - materiales auxiliares'],
    ['6211', 'Sueldos y salarios'],
    ['6271', 'Régimen de prestaciones de salud (ESSALUD)'],
    ['634', 'Mantenimiento y reparaciones'],
    ['635', 'Alquileres'],
    ['6361', 'Energía eléctrica'],
    ['637', 'Publicidad, publicaciones y relaciones públicas'],
    ['639', 'Otros servicios prestados por terceros'],
    ['6814', 'Depreciación de IME - costo'],
    ['6921', 'Costo de ventas - productos manufacturados'],
    ['7021', 'Ventas de productos manufacturados'],
    ['7111', 'Variación de productos terminados'],
    ['7131', 'Variación de productos en proceso'],
    ['791', 'Cargas imputables a cuentas de costos y gastos'],
    ['881', 'Impuesto a la renta - corriente'],
    ['891', 'Resultado del ejercicio - utilidad'],
    ['892', 'Resultado del ejercicio - pérdida'],
    ['911', 'Materia prima directa (MD)'],
    ['921', 'Mano de obra directa (MOD)'],
    ['931', 'Costos indirectos de fabricación (CIF)'],
    ['941', 'Gastos de administración'],
    ['951', 'Gastos de ventas'],
    ['971', 'Gastos financieros']
  ];

  const ELEMENTOS = {
    10: 'Efectivo y equivalentes de efectivo', 12: 'Cuentas por cobrar comerciales - terceros',
    14: 'Cuentas por cobrar al personal', 16: 'Cuentas por cobrar diversas', 20: 'Mercaderías',
    21: 'Productos terminados', 23: 'Productos en proceso', 24: 'Materias primas',
    25: 'Materiales auxiliares, suministros y repuestos', 33: 'Propiedad, planta y equipo',
    39: 'Depreciación y amortización acumulada', 40: 'Tributos y aportes por pagar',
    41: 'Remuneraciones por pagar', 42: 'Cuentas por pagar comerciales', 45: 'Obligaciones financieras',
    50: 'Capital', 59: 'Resultados acumulados', 60: 'Compras', 61: 'Variación de existencias',
    62: 'Gastos de personal', 63: 'Servicios prestados por terceros', 64: 'Gastos por tributos',
    65: 'Otros gastos de gestión', 67: 'Gastos financieros', 68: 'Valuación y deterioro de activos',
    69: 'Costo de ventas', 70: 'Ventas', 71: 'Variación de la producción almacenada',
    75: 'Otros ingresos de gestión', 77: 'Ingresos financieros', 79: 'Cargas imputables a cuentas de costos',
    88: 'Impuesto a la renta', 89: 'Determinación del resultado del ejercicio',
    91: 'Materia prima directa', 92: 'Mano de obra directa', 93: 'Costos indirectos de fabricación',
    94: 'Gastos de administración', 95: 'Gastos de ventas', 97: 'Gastos financieros'
  };

  const DESTINOS = { CIF: '931', ADM: '941', VEN: '951', FIN: '971' };
  const DESTINO_LABEL = { CIF: 'CIF (93)', ADM: 'Administración (94)', VEN: 'Ventas (95)', FIN: 'Financiero (97)' };
  const CLASIF_TRAB = { MOD: 'Mano de obra directa', MOI: 'Mano de obra indirecta', ADM: 'Personal administrativo', VEN: 'Personal de ventas' };
  const TIPOS_DOC = { '01': 'Factura', '03': 'Boleta de venta', '02': 'Recibo por honorarios', '12': 'Ticket', '14': 'Recibo de servicios públicos' };
  const TES_TIPOS = {
    COBRO_CLIENTE: { dir: 'I', cuenta: '1212', act: 'Operación', label: 'Cobranza a clientes' },
    PAGO_PROVEEDOR: { dir: 'E', cuenta: '4212', act: 'Operación', label: 'Pago a proveedores' },
    PAGO_PLANILLA: { dir: 'E', cuenta: '4111', act: 'Operación', label: 'Pago de remuneraciones' },
    PAGO_TRIBUTOS: { dir: 'E', cuenta: '40111', act: 'Operación', label: 'Pago de tributos y aportes' },
    PRESTAMO: { dir: 'I', cuenta: '4511', act: 'Financiamiento', label: 'Préstamos bancarios recibidos' },
    AMORTIZACION: { dir: 'E', cuenta: '4511', act: 'Financiamiento', label: 'Amortización de préstamos' },
    APORTE: { dir: 'I', cuenta: '5011', act: 'Financiamiento', label: 'Aportes de capital' },
    OTRO_INGRESO: { dir: 'I', cuenta: '', act: 'Operación', label: 'Otros cobros' },
    OTRO_EGRESO: { dir: 'E', cuenta: '', act: 'Operación', label: 'Otros pagos' }
  };
  const ORIGENES = {
    apertura: 'Apertura', compra: 'Compra', requisicion: 'Requisición', planilla: 'Planilla',
    tesoreria: 'Tesorería', depreciacion: 'Depreciación', ot: 'Orden de trabajo', venta: 'Venta',
    manual: 'Manual', ir: 'Impuesto a la renta', cierre: 'Cierre'
  };

  const matAccount = m => (m.tipo === 'MI' ? '251' : '241') + pad(m.id);
  const ptAccount = p => '211' + pad(p.id);
  const otAccount = o => '231' + pad(o.id);

  function accType(code) {
    const c = String(code)[0], two = String(code).slice(0, 2);
    if (two === '39') return 'Activo (contracuenta)';
    if ('123'.includes(c)) return 'Activo';
    if (c === '4') return 'Pasivo';
    if (c === '5') return 'Patrimonio';
    if (c === '6') return 'Gasto';
    if (two === '79') return 'Cargas imputables';
    if (c === '7') return 'Ingreso';
    if (c === '8') return 'Saldos intermedios';
    if (c === '9') return 'Analítica (costos y gastos)';
    return 'Otro';
  }

  function chart(db) {
    const map = new Map();
    BASE_CHART.forEach(([c, n]) => map.set(c, { codigo: c, nombre: n, origen: 'PCGE' }));
    (db.cuentas || []).forEach(a => { if (!map.has(a.codigo)) map.set(a.codigo, { codigo: a.codigo, nombre: a.nombre, origen: 'Usuario', id: a.id }); });
    db.materiales.forEach(m => map.set(matAccount(m), { codigo: matAccount(m), nombre: (m.tipo === 'MI' ? 'Material auxiliar - ' : 'Materia prima - ') + m.nombre, origen: 'Material' }));
    db.productos.forEach(p => map.set(ptAccount(p), { codigo: ptAccount(p), nombre: 'Producto terminado - ' + p.nombre, origen: 'Producto' }));
    db.ordenes.forEach(o => map.set(otAccount(o), { codigo: otAccount(o), nombre: 'Productos en proceso - ' + o.numero, origen: 'O/T' }));
    return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(a => ({ ...a, tipo: accType(a.codigo) }));
  }

  // ---------------------------------------------------------------- Fechas
  function periodStart(db) { return db.empresa.periodo + '-01'; }
  function periodEnd(db) {
    const [y, m] = db.empresa.periodo.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------- Utilidades
  /** Reparte `total` según pesos, redondeando a céntimos y cuadrando la diferencia. */
  function allocate(total, weights) {
    const W = weights.reduce((a, b) => a + num(b), 0);
    if (W <= 0) return weights.map(() => 0);
    let acc = 0;
    const out = weights.map(w => { const v = r2(total * num(w) / W); acc = r2(acc + v); return v; });
    const diff = r2(total - acc);
    if (diff) {
      const i = weights.reduce((bi, w, j) => (num(w) > num(weights[bi]) ? j : bi), 0);
      out[i] = r2(out[i] + diff);
    }
    return out;
  }

  function itemMonto(it) {
    if (it.tipo === 'MATERIAL') return r2(num(it.cantidad) * num(it.costoUnit));
    return r2(num(it.monto));
  }

  function compraTotals(c, igvPct) {
    const subtotal = sumBy(c.items, itemMonto);
    const igv = c.tipoDoc === '02' ? 0 : r2(subtotal * igvPct / 100);
    return { subtotal, igv, total: r2(subtotal + igv) };
  }

  function ventaTotals(v, igvPct) {
    const subtotal = sumBy(v.items, it => r2(num(it.cantidad) * num(it.precioUnit)));
    const igv = r2(subtotal * igvPct / 100);
    return { subtotal, igv, total: r2(subtotal + igv) };
  }

  // ---------------------------------------------------------------- Kardex
  function cmpMov(a, b) { return a.fecha.localeCompare(b.fecha) || a.ord - b.ord || a.seq - b.seq; }

  /** Ejecuta un kardex con método PROMEDIO (ponderado móvil) o PEPS. */
  function runKardex(movs, method) {
    const layers = [];
    let sCant = 0, sTot = 0;
    const rows = [], costs = {}, errors = [];
    const base = m => ({ fecha: m.fecha, doc: m.doc, tipoOp: m.tipoOp, detalle: m.detalle, ref: m.ref });
    const cu = (t, q) => (q > EPS ? t / q : 0);
    for (const m of movs) {
      if (m.tipo === 'E') {
        const total = r2(m.total != null ? m.total : m.cant * m.cu);
        sCant = r4(sCant + m.cant); sTot = r2(sTot + total);
        layers.push({ cant: m.cant, total });
        rows.push({ ...base(m), eCant: m.cant, eCU: cu(total, m.cant), eTot: total, sCant, sCU: cu(sTot, sCant), sTot });
        continue;
      }
      if (m.cant > sCant + EPS) {
        errors.push({ ref: m.ref, fecha: m.fecha, doc: m.doc, msg: `Stock insuficiente: se requiere ${r4(m.cant)} y hay ${r4(sCant)}` });
      }
      let costTotal = 0;
      if (method === 'PEPS') {
        let need = m.cant;
        const parts = [];
        while (need > EPS && layers.length) {
          const L = layers[0];
          const take = Math.min(need, L.cant);
          const val = take >= L.cant - EPS ? L.total : r2(L.total * take / L.cant);
          L.cant = r4(L.cant - take); L.total = r2(L.total - val);
          if (L.cant <= EPS) layers.shift();
          need = r4(need - take);
          parts.push({ cant: take, total: val });
        }
        if (need > EPS) parts.push({ cant: need, total: 0 });
        for (const p of parts) {
          sCant = r4(sCant - p.cant); sTot = r2(sTot - p.total); costTotal = r2(costTotal + p.total);
          rows.push({ ...base(m), oCant: p.cant, oCU: cu(p.total, p.cant), oTot: p.total, sCant, sCU: cu(sTot, sCant), sTot });
        }
      } else {
        const avg = cu(sTot, sCant);
        const val = Math.abs(m.cant - sCant) <= EPS ? sTot : r2(m.cant * avg);
        sCant = r4(sCant - m.cant); sTot = r2(sTot - val); costTotal = val;
        // el promedio mantiene una sola capa
        layers.length = 0;
        if (sCant > EPS) layers.push({ cant: sCant, total: sTot });
        rows.push({ ...base(m), oCant: m.cant, oCU: cu(val, m.cant), oTot: val, sCant, sCU: cu(sTot, sCant), sTot });
      }
      costs[m.ref] = r2((costs[m.ref] || 0) + costTotal);
    }
    return { rows, costs, errors, sCant, sTot };
  }

  function summarizeItem(rows) {
    const s = { inicial: 0, entradas: 0, salidas: 0, inicialCant: 0, entradasCant: 0, salidasCant: 0 };
    rows.forEach(r => {
      if (r.tipoOp === '16') { s.inicial = r2(s.inicial + r.eTot); s.inicialCant += r.eCant; }
      else if (r.eCant != null) { s.entradas = r2(s.entradas + r.eTot); s.entradasCant += r.eCant; }
      if (r.oCant != null) { s.salidas = r2(s.salidas + r.oTot); s.salidasCant += r.oCant; }
    });
    return s;
  }

  function kardexMateriales(db) {
    const movs = {}, items = {}, costs = {}, errors = [];
    const push = (k, m) => (movs[k] = movs[k] || []).push(m);
    const ps = periodStart(db);
    db.inventarioInicial.forEach(ii => push('M' + ii.materialId, {
      fecha: ps, ord: 0, seq: ii.id, tipo: 'E', cant: num(ii.cantidad), total: r2(num(ii.cantidad) * num(ii.costoUnit)),
      doc: 'Inv. inicial', tipoOp: '16', detalle: 'Saldo inicial', ref: 'II' + ii.id
    }));
    db.compras.forEach(c => c.items.forEach((it, i) => {
      if (it.tipo !== 'MATERIAL') return;
      push('M' + it.materialId, {
        fecha: c.fecha, ord: 1, seq: c.id * 100 + i, tipo: 'E', cant: num(it.cantidad), total: itemMonto(it),
        doc: c.documento, tipoOp: '02', detalle: 'Compra - ' + c.proveedor, ref: 'C' + c.id + '-' + i
      });
    }));
    db.requisiciones.forEach(r => {
      const ot = byId(db.ordenes, r.otId);
      push('M' + r.materialId, {
        fecha: r.fecha, ord: 2, seq: r.id, tipo: 'S', cant: num(r.cantidad), doc: r.numero, tipoOp: '10',
        detalle: ot ? 'Salida a producción ' + ot.numero : 'Salida a producción (CIF)', ref: 'RQ' + r.id
      });
    });
    db.materiales.forEach(m => {
      const k = runKardex((movs['M' + m.id] || []).sort(cmpMov), db.empresa.metodo);
      Object.assign(costs, k.costs);
      k.errors.forEach(e => errors.push({ ...e, item: m.nombre }));
      items['M' + m.id] = {
        key: 'M' + m.id, clase: m.tipo, ref: m, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad,
        cuenta: matAccount(m), rows: k.rows, saldoCant: k.sCant, saldoTotal: k.sTot, ...summarizeItem(k.rows)
      };
    });
    return { items, costs, errors };
  }

  function kardexProductos(db, ctx) {
    const movs = {}, items = {}, costs = {}, errors = [];
    const push = (k, m) => (movs[k] = movs[k] || []).push(m);
    db.ordenes.forEach(o => {
      const R = ctx.cost.porOT[o.id];
      if (o.estado !== 'TERMINADA' || !o.fechaFin || !R || R.total <= 0) return;
      push('P' + o.productoId, {
        fecha: o.fechaFin, ord: 7, seq: o.id, tipo: 'E', cant: num(o.cantidad), total: R.total,
        doc: o.numero, tipoOp: '19', detalle: 'Ingreso de producción terminada', ref: 'OT' + o.id
      });
    });
    db.ventas.forEach(v => v.items.forEach((it, i) => push('P' + it.productoId, {
      fecha: v.fecha, ord: 8, seq: v.id * 100 + i, tipo: 'S', cant: num(it.cantidad),
      doc: v.documento, tipoOp: '01', detalle: 'Venta - ' + v.cliente, ref: 'V' + v.id + '-' + i
    })));
    db.productos.forEach(p => {
      const k = runKardex((movs['P' + p.id] || []).sort(cmpMov), db.empresa.metodo);
      Object.assign(costs, k.costs);
      k.errors.forEach(e => errors.push({ ...e, item: p.nombre }));
      items['P' + p.id] = {
        key: 'P' + p.id, clase: 'PT', ref: p, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad,
        cuenta: ptAccount(p), rows: k.rows, saldoCant: k.sCant, saldoTotal: k.sTot, ...summarizeItem(k.rows)
      };
    });
    return { items, costs, errors };
  }

  // ---------------------------------------------------------------- Planilla
  function planillaCalc(db) {
    const e = db.empresa;
    const asig = r2(num(e.rmv) * num(e.asigFamPct) / 100);
    return db.trabajadores.map(t => {
      const basico = r2(num(t.sueldo)), af = t.asigFam ? asig : 0, bruto = r2(basico + af);
      const pension = r2(bruto * (t.sistema === 'ONP' ? num(e.onpPct) : num(e.afpPct)) / 100);
      const renta5 = r2(num(t.renta5));
      const desc = r2(pension + renta5), neto = r2(bruto - desc);
      const essalud = r2(Math.max(bruto, num(e.rmv)) * num(e.essaludPct) / 100);
      return { ...t, basico, af, bruto, onp: t.sistema === 'ONP' ? pension : 0, afp: t.sistema === 'ONP' ? 0 : pension, pension, renta5, desc, neto, essalud, costo: r2(bruto + essalud) };
    });
  }

  // ---------------------------------------------------------------- Depreciación
  function depreciacion(db) {
    const ps = periodStart(db);
    return db.activos.map(a => {
      const aplica = !!db.empresa.registrarDepreciacion && a.fecha < ps;
      return { ...a, aplica, mensual: aplica ? r2(num(a.costo) * num(a.tasa) / 100 / 12) : 0 };
    });
  }

  // ---------------------------------------------------------------- Costeo por órdenes
  function costeo(db, ctx) {
    const ots = db.ordenes;
    const porOT = {};
    ots.forEach(o => (porOT[o.id] = { ot: o, md: 0, mod: 0, cif: 0, mdDet: [], modDet: [], cifDet: [] }));

    db.requisiciones.forEach(r => {
      const m = byId(db.materiales, r.materialId);
      const R = porOT[r.otId];
      if (!m || m.tipo !== 'MP' || !R) return;
      const c = ctx.kMat.costs['RQ' + r.id] || 0;
      R.md = r2(R.md + c);
      R.mdDet.push({ fecha: r.fecha, numero: r.numero, material: m.nombre, unidad: m.unidad, cantidad: num(r.cantidad), cu: num(r.cantidad) ? c / num(r.cantidad) : 0, total: c });
    });

    const horasOT = {};
    ots.forEach(o => (horasOT[o.id] = 0));
    let modNoAbs = 0;
    const modSinHoras = [];
    ctx.pl.filter(w => w.clasificacion === 'MOD').forEach(w => {
      const hs = db.horas.filter(h => Number(h.trabajadorId) === Number(w.id) && porOT[h.otId]);
      const tot = hs.reduce((s, h) => s + num(h.horas), 0);
      if (!tot) { modNoAbs = r2(modNoAbs + w.costo); modSinHoras.push(w.nombre); return; }
      const parts = allocate(w.costo, hs.map(h => num(h.horas)));
      hs.forEach((h, i) => {
        const R = porOT[h.otId];
        R.mod = r2(R.mod + parts[i]);
        R.modDet.push({ trabajador: w.nombre, cargo: w.cargo, horas: num(h.horas), tarifa: w.costo / tot, total: parts[i] });
        horasOT[h.otId] += num(h.horas);
      });
    });

    const pools = db.conceptosCIF.map(c => ({ concepto: c, inductor: byId(db.inductores, c.inductorId), monto: 0, fuentes: [] }));
    const sinConcepto = [];
    const addPool = (cifId, f) => {
      const p = pools.find(x => Number(x.concepto.id) === Number(cifId));
      if (!p) { sinConcepto.push(f); return; }
      p.monto = r2(p.monto + f.monto);
      p.fuentes.push(f);
    };
    const pe = periodEnd(db);
    db.compras.forEach(c => c.items.forEach(it => {
      if (it.tipo === 'SERVICIO' && it.destino === 'CIF') addPool(it.cifId, { fecha: c.fecha, origen: 'Compra ' + c.documento, detalle: it.descripcion, cuenta: it.cuenta, monto: itemMonto(it) });
    }));
    db.requisiciones.forEach(r => {
      const m = byId(db.materiales, r.materialId);
      if (m && m.tipo === 'MI') addPool(m.cifId, { fecha: r.fecha, origen: r.numero, detalle: 'Consumo de ' + m.nombre, cuenta: '6131', monto: ctx.kMat.costs['RQ' + r.id] || 0 });
    });
    ctx.pl.filter(w => w.clasificacion === 'MOI').forEach(w => addPool(w.cifId, { fecha: pe, origen: 'Planilla', detalle: w.nombre + ' (' + w.cargo + ')', cuenta: '6211/6271', monto: w.costo }));
    ctx.dep.filter(a => a.aplica && a.area === 'PRODUCCION').forEach(a => addPool(a.cifId, { fecha: pe, origen: 'Depreciación', detalle: a.nombre, cuenta: '6814', monto: a.mensual }));

    const baseOf = (ind, o) => {
      if (!ind) return 0;
      switch (ind.fuente) {
        case 'UNIDADES': return num(o.cantidad);
        case 'HORAS_MOD': return horasOT[o.id] || 0;
        case 'COSTO_MD': return porOT[o.id].md;
        default: {
          const b = db.basesInductor.find(x => Number(x.otId) === Number(o.id) && Number(x.inductorId) === Number(ind.id));
          return b ? num(b.valor) : 0;
        }
      }
    };
    const bases = {};
    db.inductores.forEach(ind => { bases[ind.id] = {}; ots.forEach(o => (bases[ind.id][o.id] = baseOf(ind, o))); });

    let cifNoAbs = 0;
    pools.forEach(p => {
      const w = ots.map(o => baseOf(p.inductor, o));
      const W = w.reduce((a, b) => a + b, 0);
      p.baseTotal = W;
      p.tasa = W ? p.monto / W : 0;
      p.bases = w;
      p.asignado = allocate(p.monto, w);
      p.noAbs = W ? 0 : p.monto;
      cifNoAbs = r2(cifNoAbs + p.noAbs);
      ots.forEach((o, i) => {
        if (!p.asignado[i] && !w[i]) return;
        const R = porOT[o.id];
        R.cif = r2(R.cif + p.asignado[i]);
        R.cifDet.push({ codigo: p.concepto.codigo, concepto: p.concepto.nombre, inductor: p.inductor ? p.inductor.nombre : '-', unidad: p.inductor ? p.inductor.unidad : '', base: w[i], tasa: p.tasa, total: p.asignado[i] });
      });
    });

    ots.forEach(o => {
      const R = porOT[o.id];
      R.total = r2(R.md + R.mod + R.cif);
      R.unit = num(o.cantidad) ? R.total / num(o.cantidad) : 0;
      R.horas = horasOT[o.id];
    });
    return { porOT, pools, bases, horasOT, modNoAbs, modSinHoras, cifNoAbs, sinConcepto };
  }

  // ---------------------------------------------------------------- Libro diario (generado)
  const D = (cuenta, monto, aux) => ({ cuenta, debe: r2(monto), haber: 0, aux: aux || '' });
  const H = (cuenta, monto, aux) => ({ cuenta, debe: 0, haber: r2(monto), aux: aux || '' });

  function buildJournal(db, ctx) {
    const e = db.empresa, ps = periodStart(db), pe = periodEnd(db);
    const out = [];
    const add = o => {
      const merged = [];
      o.lines.forEach(l => {
        if (!r2(l.debe) && !r2(l.haber)) return;
        merged.push({ cuenta: String(l.cuenta), debe: r2(l.debe), haber: r2(l.haber), aux: l.aux || '' });
      });
      if (!merged.length) return;
      out.push({ sub: 0, tipo: 'Operación', actividad: '', flujo: '', ...o, lines: merged });
    };

    // Apertura
    const ap = [];
    if (num(e.cajaInicial)) ap.push(D('1041', e.cajaInicial));
    ctx.dep.forEach(a => { if (a.fecha < ps) ap.push(D(a.cuenta, a.costo)); });
    db.inventarioInicial.forEach(ii => {
      const m = byId(db.materiales, ii.materialId);
      if (m) ap.push(D(matAccount(m), r2(num(ii.cantidad) * num(ii.costoUnit))));
    });
    const apTot = sumBy(ap, 'debe');
    if (apTot) {
      ap.push(H('5011', apTot));
      add({ fecha: ps, ord: 0, seq: 0, tipo: 'Apertura', glosa: 'Asiento de apertura: aporte de capital en efectivo, activos fijos e inventario inicial', origen: { kind: 'apertura', id: 0, label: 'Apertura' }, lines: ap });
    }

    // Compras
    db.compras.forEach(c => {
      const t = compraTotals(c, e.igvPct);
      const docName = (TIPOS_DOC[c.tipoDoc] || 'Doc.') + ' ' + c.documento;
      const origen = { kind: 'compra', id: c.id, label: 'Compra ' + c.documento };
      const byAcc = {};
      const addAcc = (cu, m) => (byAcc[cu] = r2((byAcc[cu] || 0) + m));
      let hasActivo = false;
      c.items.forEach(it => {
        const m = itemMonto(it);
        if (it.tipo === 'MATERIAL') {
          const mat = byId(db.materiales, it.materialId);
          addAcc(mat && mat.tipo === 'MI' ? '6031' : '6021', m);
        } else {
          if (it.tipo === 'ACTIVO') hasActivo = true;
          addAcc(it.cuenta || (it.tipo === 'ACTIVO' ? '3331' : '639'), m);
        }
      });
      const L = Object.entries(byAcc).map(([cu, m]) => D(cu, m));
      L.push(D('40111', t.igv), H('4212', t.total, c.proveedor));
      add({ fecha: c.fecha, ord: 1, seq: c.id, sub: 0, glosa: `Compra según ${docName} - ${c.proveedor}`, origen, lines: L });

      const alm = [];
      c.items.filter(it => it.tipo === 'MATERIAL').forEach(it => {
        const mat = byId(db.materiales, it.materialId);
        if (!mat) return;
        alm.push(D(matAccount(mat), itemMonto(it)), H(mat.tipo === 'MI' ? '6131' : '6121', itemMonto(it)));
      });
      if (alm.length) add({ fecha: c.fecha, ord: 1, seq: c.id, sub: 1, glosa: `Ingreso al almacén de materiales - ${c.documento}`, origen, lines: alm });

      const des = [];
      c.items.filter(it => it.tipo === 'SERVICIO').forEach(it => des.push(D(DESTINOS[it.destino] || '941', itemMonto(it))));
      if (des.length) {
        des.push(H('791', sumBy(des, 'debe')));
        add({ fecha: c.fecha, ord: 1, seq: c.id, sub: 2, glosa: `Destino del gasto - ${c.documento}`, origen, lines: des });
      }
      if (c.condicion === 'CONTADO') {
        add({
          fecha: c.fecha, ord: 1, seq: c.id, sub: 3, glosa: `Pago al contado de ${c.documento}`, origen,
          actividad: hasActivo ? 'Inversión' : 'Operación',
          flujo: hasActivo ? 'Compra de propiedades, planta y equipo' : 'Pago a proveedores de bienes y servicios',
          lines: [D('4212', t.total, c.proveedor), H('1041', t.total)]
        });
      }
    });

    // Requisiciones (consumo de materiales)
    db.requisiciones.forEach(r => {
      const m = byId(db.materiales, r.materialId);
      if (!m) return;
      const cost = ctx.kMat.costs['RQ' + r.id] || 0;
      const ot = byId(db.ordenes, r.otId);
      const origen = { kind: 'requisicion', id: r.id, label: 'Requisición ' + r.numero };
      const varAcc = m.tipo === 'MI' ? '6131' : '6121';
      add({ fecha: r.fecha, ord: 2, seq: r.id, sub: 0, glosa: `Consumo de ${m.nombre} según ${r.numero}${ot ? ' - ' + ot.numero : ''}`, origen, lines: [D(varAcc, cost), H(matAccount(m), cost)] });
      const dest = m.tipo === 'MI' ? '931' : '911';
      add({ fecha: r.fecha, ord: 2, seq: r.id, sub: 1, glosa: `Destino del consumo a ${dest === '911' ? 'materia prima directa' : 'CIF (material indirecto)'} - ${r.numero}`, origen, lines: [D(dest, cost), H('791', cost)] });
    });

    // Planilla
    if (ctx.pl.length) {
      const pl = ctx.pl;
      const origen = { kind: 'planilla', id: 0, label: 'Planilla ' + e.periodo };
      add({
        fecha: pe, ord: 3, seq: 0, sub: 0, glosa: `Planilla de remuneraciones del periodo ${e.periodo}`, origen,
        lines: [
          D('6211', sumBy(pl, 'bruto')), D('6271', sumBy(pl, 'essalud')),
          H('4031', sumBy(pl, 'essalud')), H('4032', sumBy(pl, 'onp')), H('4170', sumBy(pl, 'afp')),
          H('40173', sumBy(pl, 'renta5')), H('4111', sumBy(pl, 'neto'))
        ]
      });
      const des = [
        D('921', sumBy(pl.filter(w => w.clasificacion === 'MOD'), 'costo')),
        D('931', sumBy(pl.filter(w => w.clasificacion === 'MOI'), 'costo')),
        D('941', sumBy(pl.filter(w => w.clasificacion === 'ADM'), 'costo')),
        D('951', sumBy(pl.filter(w => w.clasificacion === 'VEN'), 'costo'))
      ];
      des.push(H('791', sumBy(pl, 'costo')));
      add({ fecha: pe, ord: 3, seq: 0, sub: 1, glosa: 'Destino de la planilla: MOD (92), MOI (93), administración (94) y ventas (95)', origen, lines: des });
    }

    // Tesorería
    db.tesoreria.forEach(t => {
      const tt = TES_TIPOS[t.tipo] || TES_TIPOS.OTRO_EGRESO;
      const cuenta = t.cuenta || tt.cuenta || '639';
      const lines = tt.dir === 'I' ? [D('1041', t.monto), H(cuenta, t.monto, t.aux)] : [D(cuenta, t.monto, t.aux), H('1041', t.monto)];
      add({
        fecha: t.fecha, ord: 4, seq: t.id, glosa: t.glosa || `${tt.label}${t.aux ? ' - ' + t.aux : ''}${t.documento ? ' (' + t.documento + ')' : ''}`,
        origen: { kind: 'tesoreria', id: t.id, label: tt.label }, actividad: t.actividad || tt.act, flujo: tt.label, lines
      });
    });

    // Asientos manuales
    db.asientos.forEach(a => add({
      fecha: a.fecha, ord: 4, seq: 1000 + a.id, tipo: a.tipo || 'Operación', glosa: a.glosa,
      origen: { kind: 'manual', id: a.id, label: 'Asiento manual' }, actividad: a.actividad || 'Operación', flujo: a.glosa,
      lines: a.lineas.map(l => ({ cuenta: l.cuenta, debe: num(l.debe), haber: num(l.haber), aux: l.aux }))
    }));

    // Depreciación
    const deps = ctx.dep.filter(a => a.aplica && a.mensual > 0);
    if (deps.length) {
      const origen = { kind: 'depreciacion', id: 0, label: 'Depreciación ' + e.periodo };
      const tot = sumBy(deps, 'mensual');
      add({ fecha: pe, ord: 5, seq: 0, sub: 0, tipo: 'Ajuste', glosa: `Depreciación del periodo ${e.periodo}`, origen, lines: [D('6814', tot), H('3913', tot)] });
      const areaAcc = { PRODUCCION: '931', ADMINISTRACION: '941', VENTAS: '951' };
      const byA = {};
      deps.forEach(a => { const k = areaAcc[a.area] || '941'; byA[k] = r2((byA[k] || 0) + a.mensual); });
      const L = Object.entries(byA).map(([k, v]) => D(k, v));
      L.push(H('791', tot));
      add({ fecha: pe, ord: 5, seq: 0, sub: 1, tipo: 'Ajuste', glosa: 'Destino de la depreciación por área (planta → CIF)', origen, lines: L });
    }

    // Órdenes de trabajo: transferencia a 23 y terminación a 21
    db.ordenes.forEach(o => {
      const R = ctx.cost.porOT[o.id];
      if (!R || R.total <= 0) return;
      const terminada = o.estado === 'TERMINADA' && o.fechaFin;
      const f = terminada ? o.fechaFin : pe;
      const origen = { kind: 'ot', id: o.id, label: o.numero };
      add({
        fecha: f, ord: 6, seq: o.id, sub: 0, glosa: `Costo acumulado de la ${o.numero} (MD + MOD + CIF) a productos en proceso`, origen,
        lines: [D(otAccount(o), R.total), H('7131', R.total), D('791', R.total), H('911', R.md), H('921', R.mod), H('931', R.cif)]
      });
      if (terminada) {
        const p = byId(db.productos, o.productoId);
        add({
          fecha: f, ord: 7, seq: o.id, sub: 0, glosa: `Terminación de la ${o.numero}: ${num(o.cantidad)} ${p ? p.nombre : ''} a productos terminados`, origen,
          lines: [D(p ? ptAccount(p) : '211', R.total), H('7111', R.total), D('7131', R.total), H(otAccount(o), R.total)]
        });
      }
    });

    // Ventas
    db.ventas.forEach(v => {
      const t = ventaTotals(v, e.igvPct);
      const origen = { kind: 'venta', id: v.id, label: 'Venta ' + v.documento };
      add({ fecha: v.fecha, ord: 8, seq: v.id, sub: 0, glosa: `Venta según ${(TIPOS_DOC[v.tipoDoc] || 'Doc.')} ${v.documento} - ${v.cliente}`, origen, lines: [D('1212', t.total, v.cliente), H('7021', t.subtotal), H('40111', t.igv)] });
      const cl = [];
      v.items.forEach((it, i) => {
        const p = byId(db.productos, it.productoId);
        const c = ctx.kPT.costs['V' + v.id + '-' + i] || 0;
        if (p) cl.push(D('6921', c), H(ptAccount(p), c));
      });
      add({ fecha: v.fecha, ord: 8, seq: v.id, sub: 1, glosa: `Costo de ventas de ${v.documento}`, origen, lines: cl });
      if (v.condicion === 'CONTADO') add({ fecha: v.fecha, ord: 8, seq: v.id, sub: 2, glosa: `Cobro al contado de ${v.documento}`, origen, actividad: 'Operación', flujo: 'Cobranza de ventas al contado', lines: [D('1041', t.total), H('1212', t.total, v.cliente)] });
    });

    sortAndNumber(out);

    // Impuesto a la renta (simplificado: tasa sobre la utilidad contable)
    if (e.calcularIR) {
      const rai = resultFromEntries(out, false);
      if (rai > 0) {
        const ir = r2(rai * num(e.irPct) / 100);
        add({ fecha: pe, ord: 9, seq: 0, tipo: 'Ajuste', glosa: `Impuesto a la renta ${num(e.irPct)}% sobre la utilidad contable`, origen: { kind: 'ir', id: 0, label: 'Impuesto a la renta' }, lines: [D('881', ir), H('40171', ir)] });
      }
    }

    // Cierre del ejercicio
    if (db.cierre && db.cierre.realizado) {
      const L = ledger(out);
      const origen = { kind: 'cierre', id: 0, label: 'Cierre' };
      const rev = a => (a.saldo > 0 ? H(a.codigo, a.saldo) : D(a.codigo, -a.saldo));
      const analit = Object.values(L).filter(a => a.saldo && (a.codigo[0] === '9' || a.codigo.startsWith('79'))).map(rev);
      add({ fecha: pe, ord: 10, seq: 0, tipo: 'Cierre', glosa: 'Cierre de cuentas analíticas (clase 9) contra la cuenta 79', origen, lines: analit });
      const resAccs = Object.values(L).filter(a => a.saldo && isResultAccount(a.codigo, true));
      const res = r2(-resAccs.reduce((s, a) => s + a.saldo, 0));
      const lines = resAccs.map(rev);
      if (res >= 0) lines.push(H('891', res)); else lines.push(D('892', -res));
      add({ fecha: pe, ord: 10, seq: 1, tipo: 'Cierre', glosa: 'Cancelación de cuentas de resultados y determinación del resultado del ejercicio', origen, lines });
      if (res > 0) add({ fecha: pe, ord: 10, seq: 2, tipo: 'Cierre', glosa: 'Traslado de la utilidad del ejercicio a resultados acumulados', origen, lines: [D('891', res), H('5911', res)] });
      if (res < 0) add({ fecha: pe, ord: 10, seq: 2, tipo: 'Cierre', glosa: 'Traslado de la pérdida del ejercicio a resultados acumulados', origen, lines: [D('5921', -res), H('892', -res)] });
    }

    sortAndNumber(out);
    return out;
  }

  function sortAndNumber(arr) {
    arr.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ord - b.ord || a.seq - b.seq || a.sub - b.sub);
    arr.forEach((x, i) => {
      x.num = i + 1;
      x.debe = sumBy(x.lines, 'debe');
      x.haber = sumBy(x.lines, 'haber');
    });
  }

  /** Cuentas de resultados: clase 6, clase 7 (salvo 79) y, opcionalmente, 88. */
  function isResultAccount(code, include88) {
    const c = code[0], two = code.slice(0, 2);
    return c === '6' || (c === '7' && two !== '79') || (include88 && two === '88');
  }

  function resultFromEntries(entries, include88) {
    let s = 0;
    entries.forEach(e => e.lines.forEach(l => { if (isResultAccount(l.cuenta, include88)) s += l.haber - l.debe; }));
    return r2(s);
  }

  function ledger(entries) {
    const L = {};
    entries.forEach(e => e.lines.forEach(l => {
      const a = L[l.cuenta] || (L[l.cuenta] = { codigo: l.cuenta, debe: 0, haber: 0, movs: [] });
      a.debe = r2(a.debe + l.debe);
      a.haber = r2(a.haber + l.haber);
      a.movs.push({ num: e.num, fecha: e.fecha, glosa: e.glosa, debe: l.debe, haber: l.haber, aux: l.aux, origen: e.origen });
    }));
    Object.values(L).forEach(a => (a.saldo = r2(a.debe - a.haber)));
    return L;
  }

  function saldoPrefix(L, prefixes) {
    const ps = [].concat(prefixes);
    return r2(Object.values(L).filter(a => ps.some(p => a.codigo.startsWith(p))).reduce((s, a) => s + a.saldo, 0));
  }

  // ---------------------------------------------------------------- Cálculo integral
  function compute(db) {
    const ctx = { db, ps: periodStart(db), pe: periodEnd(db) };
    ctx.chart = chart(db);
    ctx.chartMap = Object.fromEntries(ctx.chart.map(a => [a.codigo, a]));
    ctx.pl = planillaCalc(db);
    ctx.kMat = kardexMateriales(db);
    ctx.dep = depreciacion(db);
    ctx.cost = costeo(db, ctx);
    ctx.kPT = kardexProductos(db, ctx);
    ctx.entries = buildJournal(db, ctx);
    ctx.pre = ctx.entries.filter(x => x.tipo !== 'Cierre');
    ctx.L = ledger(ctx.entries);
    ctx.Lpre = ledger(ctx.pre);
    ctx.accName = code => (ctx.chartMap[code] ? ctx.chartMap[code].nombre : (ELEMENTOS[String(code).slice(0, 2)] || 'Cuenta ' + code));
    return ctx;
  }

  // ---------------------------------------------------------------- Reportes
  function balanceComprobacion(ctx) {
    const rows = Object.values(ctx.Lpre).filter(a => a.debe || a.haber).sort((a, b) => a.codigo.localeCompare(b.codigo)).map(a => {
      const sd = Math.max(a.saldo, 0), sa = Math.max(-a.saldo, 0);
      const c = a.codigo[0], two = a.codigo.slice(0, 2);
      const r = { codigo: a.codigo, nombre: ctx.accName(a.codigo), debe: a.debe, haber: a.haber, deudor: r2(sd), acreedor: r2(sa), activo: 0, pasivo: 0, perdidaN: 0, gananciaN: 0, perdidaF: 0, gananciaF: 0 };
      if ('12345'.includes(c)) { r.activo = r.deudor; r.pasivo = r.acreedor; }
      if (isResultAccount(a.codigo, true)) { r.perdidaN = r.deudor; r.gananciaN = r.acreedor; }
      if (two === '69' || (c === '7' && !['71', '72', '79'].includes(two)) || two === '88' || c === '9') { r.perdidaF = r.deudor; r.gananciaF = r.acreedor; }
      return r;
    });
    const keys = ['debe', 'haber', 'deudor', 'acreedor', 'activo', 'pasivo', 'perdidaN', 'gananciaN', 'perdidaF', 'gananciaF'];
    const tot = {};
    keys.forEach(k => (tot[k] = sumBy(rows, k)));
    return {
      rows, tot,
      resInventario: r2(tot.activo - tot.pasivo),
      resNaturaleza: r2(tot.gananciaN - tot.perdidaN),
      resFuncion: r2(tot.gananciaF - tot.perdidaF)
    };
  }

  const RUBROS = {
    10: ['AC', 'Efectivo y equivalentes de efectivo'], 12: ['AC', 'Cuentas por cobrar comerciales - terceros'],
    14: ['AC', 'Cuentas por cobrar al personal'], 16: ['AC', 'Cuentas por cobrar diversas'],
    20: ['AC', 'Mercaderías'], 21: ['AC', 'Productos terminados'], 23: ['AC', 'Productos en proceso'],
    24: ['AC', 'Materias primas'], 25: ['AC', 'Materiales auxiliares, suministros y repuestos'],
    33: ['ANC', 'Propiedad, planta y equipo'], 39: ['ANC', '(-) Depreciación acumulada'],
    40: ['PC', 'Tributos, contraprestaciones y aportes por pagar'], 41: ['PC', 'Remuneraciones por pagar'],
    42: ['PC', 'Cuentas por pagar comerciales - terceros'], 45: ['PNC', 'Obligaciones financieras'],
    50: ['PAT', 'Capital'], 52: ['PAT', 'Capital adicional'], 58: ['PAT', 'Reservas'], 59: ['PAT', 'Resultados acumulados']
  };

  function estadoSituacion(ctx) {
    const bc = balanceComprobacion(ctx);
    const secs = { AC: {}, ANC: {}, PC: {}, PNC: {}, PAT: {} };
    const push = (sec, rubro, codigo, val) => {
      const r = secs[sec][rubro] || (secs[sec][rubro] = { rubro, valor: 0, cuentas: [] });
      r.valor = r2(r.valor + val);
      r.cuentas.push({ codigo, nombre: ctx.accName(codigo), valor: val });
    };
    Object.values(ctx.Lpre).filter(a => a.saldo && '12345'.includes(a.codigo[0])).sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(a => {
      const c = a.codigo[0], two = a.codigo.slice(0, 2), map = RUBROS[two];
      if ('123'.includes(c)) push(map ? map[0] : (c === '3' ? 'ANC' : 'AC'), map ? map[1] : 'Otros activos', a.codigo, a.saldo);
      else if (c === '4') {
        if (a.saldo > 0) push('AC', 'Tributos y otras cuentas por cobrar', a.codigo, a.saldo);
        else push(map ? map[0] : 'PC', map ? map[1] : 'Otras cuentas por pagar', a.codigo, -a.saldo);
      } else push('PAT', map ? map[1] : 'Otras partidas patrimoniales', a.codigo, -a.saldo);
    });
    const resultado = bc.resNaturaleza;
    const list = s => Object.values(secs[s]);
    const t = s => sumBy(list(s), 'valor');
    const patrimonio = list('PAT');
    patrimonio.push({ rubro: 'Resultado del ejercicio', valor: resultado, cuentas: [] });
    const out = {
      AC: list('AC'), ANC: list('ANC'), PC: list('PC'), PNC: list('PNC'), PAT: patrimonio,
      tAC: t('AC'), tANC: t('ANC'), tPC: t('PC'), tPNC: t('PNC'), tPAT: r2(t('PAT') + resultado), resultado
    };
    out.tActivo = r2(out.tAC + out.tANC);
    out.tPasivo = r2(out.tPC + out.tPNC);
    out.tPasPat = r2(out.tPasivo + out.tPAT);
    out.diferencia = r2(out.tActivo - out.tPasPat);
    return out;
  }

  function resultadosFuncion(ctx) {
    const L = ctx.Lpre, s = p => saldoPrefix(L, p);
    const ventas = -s('70'), cv = s('69'), ub = r2(ventas - cv);
    const ga = s('94'), gv = s('95'), noAbs = r2(s('91') + s('92') + s('93'));
    const gf = s('97');
    const otrosIng = -r2(s('73') + s('74') + s('75') + s('76') + s('77') + s('78'));
    const rai = resultFromEntries(ctx.pre, false);
    const uo = r2(ub - ga - gv - noAbs);
    const otros = r2(rai - (uo - gf + otrosIng));
    const ir = s('88');
    return { ventas, cv, ub, ga, gv, noAbs, uo, gf, otrosIng, otros, rai, ir, neto: r2(rai - ir) };
  }

  function resultadosNaturaleza(ctx) {
    const L = ctx.Lpre, s = p => saldoPrefix(L, p);
    const ventas = -s('70'), cv = s('69'), varProd = -s('71'), prodInm = -s('72');
    const produccion = r2(ventas - cv + varProd + prodInm);
    const consumo = r2(s('60') + s('61')), servicios = s('63');
    const va = r2(produccion - consumo - servicios);
    const personal = s('62'), tributos = s('64');
    const ebe = r2(va - personal - tributos);
    const deprec = s('68');
    const rai = resultFromEntries(ctx.pre, false);
    const otros = r2(rai - (ebe - deprec));
    const ir = s('88');
    return { ventas, cv, varProd, prodInm, produccion, consumo, servicios, va, personal, tributos, ebe, deprec, otros, rai, ir, neto: r2(rai - ir) };
  }

  function flujoEfectivo(ctx) {
    const groups = { 'Operación': {}, 'Inversión': {}, 'Financiamiento': {} };
    let saldoInicial = 0;
    ctx.pre.forEach(e => {
      const amt = r2(e.lines.filter(l => l.cuenta.startsWith('10')).reduce((s, l) => s + l.debe - l.haber, 0));
      if (!amt) return;
      if (e.origen.kind === 'apertura') { saldoInicial = r2(saldoInicial + amt); return; }
      const act = groups[e.actividad] ? e.actividad : 'Operación';
      const lab = e.flujo || e.glosa;
      groups[act][lab] = r2((groups[act][lab] || 0) + amt);
    });
    const secciones = Object.entries(groups).map(([act, g]) => {
      const lineas = Object.entries(g).map(([concepto, monto]) => ({ concepto, monto }));
      return { actividad: act, lineas, neto: sumBy(lineas, 'monto') };
    });
    const aumento = sumBy(secciones, 'neto');
    const saldoFinal = r2(saldoInicial + aumento);
    return { secciones, aumento, saldoInicial, saldoFinal, saldoContable: saldoPrefix(ctx.Lpre, '10') };
  }

  function estadoCostos(ctx) {
    const mats = Object.values(ctx.kMat.items);
    const mp = mats.filter(i => i.clase === 'MP');
    const iiMP = sumBy(mp, 'inicial'), comprasMP = sumBy(mp, 'entradas'), ifMP = sumBy(mp, 'saldoTotal');
    const consumoMP = r2(iiMP + comprasMP - ifMP);
    const ots = Object.values(ctx.cost.porOT);
    const md = sumBy(ots, 'md'), mod = sumBy(ots, 'mod'), cif = sumBy(ots, 'cif');
    const cifDet = ctx.cost.pools.map(p => ({ concepto: p.concepto.nombre, monto: sumBy(p.asignado.map(v => ({ v })), 'v') }));
    const costoProd = r2(md + mod + cif);
    const iiPP = 0;
    const ifPP = sumBy(ots.filter(r => !(r.ot.estado === 'TERMINADA' && r.ot.fechaFin)), 'total');
    const cpt = r2(costoProd + iiPP - ifPP);
    const pts = Object.values(ctx.kPT.items);
    const iiPT = sumBy(pts, 'inicial'), ifPT = sumBy(pts, 'saldoTotal');
    const costoVentas = r2(cpt + iiPT - ifPT);
    return { iiMP, comprasMP, ifMP, consumoMP, md, mpSinOT: r2(consumoMP - md), mod, cif, cifDet, costoProd, iiPP, ifPP, cpt, iiPT, ifPT, costoVentas, costoVentasContable: saldoPrefix(ctx.Lpre, '69') };
  }

  function cambiosPatrimonio(ctx) {
    let capIni = 0, accIni = 0, aportes = 0, accMov = 0;
    ctx.pre.forEach(e => e.lines.forEach(l => {
      const v = r2(l.haber - l.debe);
      if (l.cuenta.startsWith('50')) { if (e.origen.kind === 'apertura') capIni += v; else aportes += v; }
      if (l.cuenta.startsWith('59')) { if (e.origen.kind === 'apertura') accIni += v; else accMov += v; }
    }));
    const res = resultadosFuncion(ctx).neto;
    const rows = [
      { concepto: 'Saldo inicial (apertura)', capital: r2(capIni), acumulados: r2(accIni), resultado: 0 },
      { concepto: 'Aportes de capital del periodo', capital: r2(aportes), acumulados: 0, resultado: 0 },
      { concepto: 'Otros movimientos de resultados acumulados', capital: 0, acumulados: r2(accMov), resultado: 0 },
      { concepto: 'Resultado del ejercicio', capital: 0, acumulados: 0, resultado: res }
    ];
    rows.forEach(r => (r.total = r2(r.capital + r.acumulados + r.resultado)));
    const fin = { concepto: 'Saldo final', capital: sumBy(rows, 'capital'), acumulados: sumBy(rows, 'acumulados'), resultado: sumBy(rows, 'resultado') };
    fin.total = r2(fin.capital + fin.acumulados + fin.resultado);
    return { rows, fin };
  }

  function ratios(ctx) {
    const es = estadoSituacion(ctx), rf = resultadosFuncion(ctx);
    const exist = sumBy(es.AC.filter(r => /Mercader|Productos|Materias|Materiales/.test(r.rubro)), 'valor');
    const div = (a, b) => (Math.abs(b) > EPS ? a / b : null);
    return [
      { grupo: 'Liquidez', nombre: 'Liquidez corriente', formula: 'Activo corriente / Pasivo corriente', valor: div(es.tAC, es.tPC), tipo: 'veces' },
      { grupo: 'Liquidez', nombre: 'Prueba ácida', formula: '(Activo corriente - Existencias) / Pasivo corriente', valor: div(es.tAC - exist, es.tPC), tipo: 'veces' },
      { grupo: 'Liquidez', nombre: 'Capital de trabajo', formula: 'Activo corriente - Pasivo corriente', valor: r2(es.tAC - es.tPC), tipo: 'soles' },
      { grupo: 'Solvencia', nombre: 'Endeudamiento total', formula: 'Pasivo total / Activo total', valor: div(es.tPasivo, es.tActivo), tipo: '%' },
      { grupo: 'Solvencia', nombre: 'Endeudamiento patrimonial', formula: 'Pasivo total / Patrimonio', valor: div(es.tPasivo, es.tPAT), tipo: 'veces' },
      { grupo: 'Rentabilidad', nombre: 'Margen bruto', formula: 'Utilidad bruta / Ventas', valor: div(rf.ub, rf.ventas), tipo: '%' },
      { grupo: 'Rentabilidad', nombre: 'Margen operativo', formula: 'Utilidad operativa / Ventas', valor: div(rf.uo, rf.ventas), tipo: '%' },
      { grupo: 'Rentabilidad', nombre: 'Margen neto', formula: 'Utilidad neta / Ventas', valor: div(rf.neto, rf.ventas), tipo: '%' },
      { grupo: 'Rentabilidad', nombre: 'ROA', formula: 'Utilidad neta / Activo total', valor: div(rf.neto, es.tActivo), tipo: '%' },
      { grupo: 'Rentabilidad', nombre: 'ROE', formula: 'Utilidad neta / Patrimonio', valor: div(rf.neto, es.tPAT), tipo: '%' }
    ];
  }

  /** Clasificación de costos en fijos y variables + análisis costo-volumen-utilidad. */
  function cvu(ctx) {
    const db = ctx.db;
    const items = [];
    const ots = Object.values(ctx.cost.porOT);
    items.push({ concepto: 'Materia prima directa', tipo: 'VARIABLE', area: 'Producción', monto: sumBy(ots, 'md') });
    items.push({ concepto: 'Mano de obra directa', tipo: 'VARIABLE', area: 'Producción', monto: sumBy(ots, 'mod') });
    ctx.cost.pools.forEach(p => items.push({ concepto: 'CIF - ' + p.concepto.nombre, tipo: p.concepto.comportamiento || 'FIJO', area: 'Producción', monto: p.monto }));
    const ga = saldoPrefix(ctx.Lpre, '94'), gv = saldoPrefix(ctx.Lpre, '95');
    items.push({ concepto: 'Gastos de administración (94)', tipo: 'FIJO', area: 'Administración', monto: ga });
    items.push({ concepto: 'Gastos de ventas (95)', tipo: 'FIJO', area: 'Ventas', monto: gv });
    const cifFijo = sumBy(ctx.cost.pools.filter(p => (p.concepto.comportamiento || 'FIJO') === 'FIJO'), 'monto');
    const cf = r2(cifFijo + ga + gv);

    const productos = db.productos.map(p => {
      const otsP = ots.filter(r => Number(r.ot.productoId) === Number(p.id));
      const unidadesProd = otsP.reduce((s, r) => s + num(r.ot.cantidad), 0);
      const cifVar = r2(otsP.reduce((s, r) => s + r.cifDet.filter(d => {
        const c = db.conceptosCIF.find(x => x.codigo === d.codigo);
        return c && c.comportamiento === 'VARIABLE';
      }).reduce((a, d) => a + d.total, 0), 0));
      const cvTotal = r2(sumBy(otsP, 'md') + sumBy(otsP, 'mod') + cifVar);
      const cvu = unidadesProd ? cvTotal / unidadesProd : 0;
      let uv = 0, ventas = 0;
      db.ventas.forEach(v => v.items.forEach(it => { if (Number(it.productoId) === Number(p.id)) { uv += num(it.cantidad); ventas += num(it.cantidad) * num(it.precioUnit); } }));
      const precio = uv ? ventas / uv : 0;
      return { producto: p.nombre, unidadesProd, unidadesVend: uv, ventas: r2(ventas), precio, cvu, mcu: precio - cvu };
    }).filter(x => x.unidadesVend > 0);
    const totU = productos.reduce((s, x) => s + x.unidadesVend, 0);
    productos.forEach(x => (x.mix = totU ? x.unidadesVend / totU : 0));
    const mcuPond = productos.reduce((s, x) => s + x.mix * x.mcu, 0);
    const peUnidades = mcuPond > 0 ? cf / mcuPond : null;
    productos.forEach(x => { x.peUnid = peUnidades != null ? peUnidades * x.mix : null; x.peSoles = x.peUnid != null ? x.peUnid * x.precio : null; });
    const peSoles = peUnidades != null ? productos.reduce((s, x) => s + x.peSoles, 0) : null;
    const ventasTot = sumBy(productos, 'ventas');
    const cvVendido = r2(productos.reduce((s, x) => s + x.cvu * x.unidadesVend, 0));
    const mc = r2(ventasTot - cvVendido);
    const utilVariable = r2(mc - cf);
    const utilAbsorbente = resultadosFuncion(ctx).uo;
    return {
      items, cv: sumBy(items.filter(i => i.tipo === 'VARIABLE'), 'monto'), cf, productos, mcuPond, peUnidades, peSoles,
      margenSeguridad: peSoles != null && ventasTot ? (ventasTot - peSoles) / ventasTot : null,
      ventasTot, cvVendido, mc, utilVariable, utilAbsorbente, diferencia: r2(utilAbsorbente - utilVariable)
    };
  }

  /** Saldos pendientes por tercero (auxiliar) de una cuenta (12 o 42). */
  function saldosPorTercero(ctx, prefix) {
    const m = {};
    Object.values(ctx.L).filter(a => a.codigo.startsWith(prefix)).forEach(a => a.movs.forEach(mv => {
      const k = mv.aux || '(sin auxiliar)';
      const x = m[k] || (m[k] = { tercero: k, debe: 0, haber: 0 });
      x.debe = r2(x.debe + mv.debe); x.haber = r2(x.haber + mv.haber);
    }));
    return Object.values(m).map(x => ({ ...x, saldo: r2(x.debe - x.haber) })).filter(x => x.saldo);
  }

  // ---------------------------------------------------------------- Validaciones
  function validar(ctx) {
    const db = ctx.db, out = [];
    const err = msg => out.push({ nivel: 'error', msg }), warn = msg => out.push({ nivel: 'warn', msg }), ok = msg => out.push({ nivel: 'ok', msg });
    const unb = ctx.entries.filter(e => Math.abs(e.debe - e.haber) > 0.005);
    unb.length ? unb.forEach(e => err(`Asiento N° ${e.num} descuadrado (Debe ${e.debe} / Haber ${e.haber}): ${e.glosa}`)) : ok('Todos los asientos cuadran (Debe = Haber).');
    [...ctx.kMat.errors, ...ctx.kPT.errors].forEach(e => err(`Kardex de ${e.item}: ${e.msg} (${e.doc}, ${e.fecha}).`));
    if (!ctx.kMat.errors.length && !ctx.kPT.errors.length) ok('Ningún kardex presenta stock negativo.');
    let kdOk = true;
    [...Object.values(ctx.kMat.items), ...Object.values(ctx.kPT.items)].forEach(i => {
      const s = ctx.Lpre[i.cuenta] ? ctx.Lpre[i.cuenta].saldo : 0;
      if (Math.abs(s - i.saldoTotal) > 0.01) { kdOk = false; err(`Kardex de ${i.nombre} (S/ ${i.saldoTotal}) no coincide con la cuenta ${i.cuenta} (S/ ${s}).`); }
    });
    if (kdOk) ok('El saldo de cada kardex coincide con su cuenta contable (24, 25 y 21).');
    db.ordenes.forEach(o => {
      if (o.estado === 'TERMINADA' && !o.fechaFin) err(`La ${o.numero} está TERMINADA pero no tiene fecha de término.`);
      const R = ctx.cost.porOT[o.id];
      if (o.estado !== 'TERMINADA' && R.total > 0) {
        const s = ctx.Lpre[otAccount(o)] ? ctx.Lpre[otAccount(o)].saldo : 0;
        if (Math.abs(s - R.total) > 0.01) err(`La cuenta ${otAccount(o)} no coincide con el costo de la ${o.numero}.`);
      }
    });
    db.requisiciones.forEach(r => {
      const m = byId(db.materiales, r.materialId);
      if (m && m.tipo === 'MP' && !byId(db.ordenes, r.otId)) err(`La requisición ${r.numero} es de materia prima y no indica O/T.`);
    });
    if (ctx.cost.modSinHoras.length) warn(`Trabajadores MOD sin horas asignadas a O/T: ${ctx.cost.modSinHoras.join(', ')}. Su costo queda sin absorber en la cuenta 92.`);
    ctx.cost.pools.filter(p => p.monto && !p.baseTotal).forEach(p => warn(`El CIF "${p.concepto.nombre}" (S/ ${p.monto}) no tiene base en su inductor "${p.inductor ? p.inductor.nombre : '-'}"; no se distribuye.`));
    if (ctx.cost.sinConcepto.length) err(`Hay ${ctx.cost.sinConcepto.length} CIF sin concepto CIF asignado (revisa compras, materiales indirectos, trabajadores MOI o activos de planta).`);
    const fab = r2(saldoPrefix(ctx.Lpre, '91') + saldoPrefix(ctx.Lpre, '92') + saldoPrefix(ctx.Lpre, '93'));
    Math.abs(fab) < 0.01 ? ok('Las cuentas del mayor de fábrica (91, 92, 93) quedaron totalmente transferidas a la cuenta 23.') : warn(`Las cuentas 91-93 tienen saldo S/ ${fab} sin transferir a productos en proceso.`);
    const fuera = [...db.compras, ...db.ventas, ...db.requisiciones, ...db.tesoreria, ...db.asientos].filter(d => d.fecha && !d.fecha.startsWith(db.empresa.periodo));
    if (fuera.length) warn(`${fuera.length} documento(s) tienen fecha fuera del periodo ${db.empresa.periodo}.`);
    const es = estadoSituacion(ctx);
    Math.abs(es.diferencia) < 0.01 ? ok('El Estado de Situación Financiera cuadra (Activo = Pasivo + Patrimonio).') : err(`El Estado de Situación no cuadra por S/ ${es.diferencia}.`);
    return out;
  }

  /** Errores que impiden grabar un cambio. */
  function blockingErrors(db) {
    const ctx = compute(db);
    const out = [...ctx.kMat.errors, ...ctx.kPT.errors].map(e => `Kardex de ${e.item}: ${e.msg} (${e.doc}).`);
    ctx.entries.filter(e => Math.abs(e.debe - e.haber) > 0.005).forEach(e => out.push(`Asiento descuadrado: ${e.glosa}`));
    return out;
  }

  /** Verifica si un registro maestro está siendo usado por algún documento. */
  function usos(db, kind, id) {
    id = Number(id);
    const u = [];
    const chk = (cond, msg) => { if (cond) u.push(msg); };
    if (kind === 'material') {
      chk(db.compras.some(c => c.items.some(i => i.tipo === 'MATERIAL' && Number(i.materialId) === id)), 'compras');
      chk(db.requisiciones.some(r => Number(r.materialId) === id), 'requisiciones');
      chk(db.inventarioInicial.some(r => Number(r.materialId) === id), 'inventario inicial');
    }
    if (kind === 'producto') {
      chk(db.ordenes.some(o => Number(o.productoId) === id), 'órdenes de trabajo');
      chk(db.ventas.some(v => v.items.some(i => Number(i.productoId) === id)), 'ventas');
    }
    if (kind === 'ot') {
      chk(db.requisiciones.some(r => Number(r.otId) === id), 'requisiciones');
      chk(db.horas.some(h => Number(h.otId) === id), 'hojas de tiempo');
    }
    if (kind === 'trabajador') chk(db.horas.some(h => Number(h.trabajadorId) === id), 'hojas de tiempo');
    if (kind === 'inductor') chk(db.conceptosCIF.some(c => Number(c.inductorId) === id), 'conceptos CIF');
    if (kind === 'cif') {
      chk(db.compras.some(c => c.items.some(i => Number(i.cifId) === id && i.destino === 'CIF')), 'compras');
      chk(db.materiales.some(m => m.tipo === 'MI' && Number(m.cifId) === id), 'materiales indirectos');
      chk(db.trabajadores.some(t => t.clasificacion === 'MOI' && Number(t.cifId) === id), 'trabajadores MOI');
      chk(db.activos.some(a => a.area === 'PRODUCCION' && Number(a.cifId) === id), 'activos de planta');
    }
    if (kind === 'cuenta') {
      chk(db.asientos.some(a => a.lineas.some(l => l.cuenta === id || l.cuenta === String(id))), 'asientos manuales');
    }
    return u;
  }

  function emptyDb() {
    return {
      schema: SCHEMA,
      empresa: {
        razon: 'Mi empresa SAC', ruc: '', direccion: '', actividad: '', periodo: '2026-10', metodo: 'PROMEDIO',
        igvPct: 18, essaludPct: 9, onpPct: 13, afpPct: 11.37, rmv: 1130, asigFamPct: 10, irPct: 29.5,
        calcularIR: true, registrarDepreciacion: true, cajaInicial: 0
      },
      cuentas: [], materiales: [], productos: [], inductores: [], conceptosCIF: [], activos: [], inventarioInicial: [],
      ordenes: [], compras: [], requisiciones: [], trabajadores: [], horas: [], basesInductor: [], ventas: [],
      tesoreria: [], asientos: [], cierre: { realizado: false }
    };
  }

  return {
    SCHEMA, r2, r4, num, pad, byId, sumBy, allocate, itemMonto, compraTotals, ventaTotals,
    BASE_CHART, ELEMENTOS, DESTINOS, DESTINO_LABEL, CLASIF_TRAB, TIPOS_DOC, TES_TIPOS, ORIGENES,
    matAccount, ptAccount, otAccount, accType, chart, periodStart, periodEnd, runKardex, planillaCalc,
    compute, ledger, saldoPrefix, balanceComprobacion, estadoSituacion, resultadosFuncion, resultadosNaturaleza,
    flujoEfectivo, estadoCostos, cambiosPatrimonio, ratios, cvu, saldosPorTercero, validar, blockingErrors, usos, emptyDb
  };
});
