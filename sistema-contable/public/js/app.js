/* Interfaz del Sistema Contable y de Costos UNI (V5). Depende de Engine y Seed. */
(() => {
  'use strict';
  const E = window.Engine;
  const DB_KEY = 'uni_contable_v5';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n2 = v => Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = v => 'S/ ' + n2(v);
  const qty = v => Number(v || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
  const cu4 = v => Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = v => (v == null ? '-' : (v * 100).toFixed(1) + '%');
  const dateFmt = v => (v ? String(v).split('-').reverse().join('/') : '-');
  const today = () => new Date().toISOString().slice(0, 10);
  /** Fecha por defecto de un documento nuevo: hoy si cae en el periodo; si no, el último día del periodo. */
  const defDate = () => (today().startsWith(DB.empresa.periodo) ? today() : E.periodEnd(DB));
  const nextId = arr => (arr.length ? Math.max(...arr.map(x => Number(x.id) || 0)) + 1 : 1);
  const TIPO_OP = { '16': 'Saldo inicial', '02': 'Compra', '10': 'Salida a producción', '19': 'Entrada de producción', '01': 'Venta' };
  const CLASIF_PILL = { MOD: 'mod', MOI: 'moi', ADM: 'adm', VEN: 'ven' };

  // ------------------------------------------------------------ Estado y persistencia
  let DB = null, CTX = null, REV = 0, CTXREV = -1;
  let VIEW = 'dashboard', PARAMS = {};
  const ctx = () => { if (CTXREV !== REV) { CTX = E.compute(DB); CTXREV = REV; } return CTX; };

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) { const x = JSON.parse(raw); if (x && x.schema === E.SCHEMA) return x; }
    } catch (e) { /* datos corruptos: se recrean */ }
    try {
      const old = localStorage.getItem('uni_contable_v4_data');
      if (old && !localStorage.getItem('uni_contable_v4_respaldo')) localStorage.setItem('uni_contable_v4_respaldo', old);
    } catch (e) { /* sin almacenamiento */ }
    const d = Seed.create();
    persist(d);
    return d;
  }
  function persist(d) { try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch (e) { /* modo privado */ } }

  /** Aplica un cambio sobre una copia; si genera errores nuevos (p. ej. stock negativo) no se graba. */
  function commit(fn, opts = {}) {
    if (DB.cierre && DB.cierre.realizado && !opts.allowClosed) { toast('El periodo está cerrado. Revierte el cierre para modificar datos.', true); return false; }
    const draft = structuredClone(DB);
    if (fn(draft) === false) return false;
    const before = new Set(E.blockingErrors(DB));
    const nuevos = E.blockingErrors(draft).filter(x => !before.has(x));
    if (nuevos.length) { notify('No se puede grabar:\n\n' + nuevos.join('\n')); return false; }
    DB = draft; persist(DB); REV++;
    return true;
  }

  /** Diálogo propio (sustituye alert/confirm, que algunos visores bloquean). Devuelve una promesa con true/false. */
  function dialog(msg, withCancel) {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p></p><div class="actions">${withCancel ? '<button class="btn btn-secondary" data-r="0">Cancelar</button>' : ''}<button class="btn btn-primary" data-r="1">${withCancel ? 'Confirmar' : 'Entendido'}</button></div></div>`;
      $('p', back).textContent = msg;
      const close = r => { back.remove(); document.removeEventListener('keydown', key); resolve(r); };
      const key = e => { if (e.key === 'Escape') close(false); };
      back.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r === '1'); });
      document.addEventListener('keydown', key);
      document.body.appendChild(back);
      $('[data-r="1"]', back).focus();
    });
  }
  const notify = msg => { dialog(msg, false); };
  const ask = msg => dialog(msg, true);

  function toast(t, err) {
    const x = document.createElement('div');
    x.className = 'toast' + (err ? ' err' : '');
    x.textContent = t;
    document.body.appendChild(x);
    setTimeout(() => x.remove(), 2600);
  }

  // ------------------------------------------------------------ Tablas y exportación
  const EXPORTS = {};
  let tSeq = 0;
  const NUMF = ['money', 'qty', 'cu', 'pct', 'money0'];

  function fmt(v, f, row) {
    if (typeof f === 'function') return f(v, row);
    switch (f) {
      case 'money': return v == null || v === '' ? '' : n2(v);
      case 'money0': return v ? n2(v) : '';
      case 'qty': return v == null || v === '' ? '' : qty(v);
      case 'cu': return v == null || v === '' ? '' : cu4(v);
      case 'pct': return pct(v);
      case 'date': return dateFmt(v);
      default: return esc(v ?? '');
    }
  }

  /** cols: [{k, l, f, cls}] · opts: {name, foot:[rows], actions:(row)=>html, empty} */
  function tbl(rows, cols, opts = {}) {
    const id = 't' + (++tSeq);
    EXPORTS[id] = { rows: rows.concat(opts.foot || []), cols, name: opts.name || 'reporte' };
    const thCls = c => (NUMF.includes(c.f) ? 'money' : '');
    const head = cols.map(c => `<th class="${thCls(c)}">${esc(c.l)}</th>`).join('') + (opts.actions ? '<th class="no-print">Acciones</th>' : '');
    const tr = (r, cls) => `<tr class="${cls || r._cls || ''}" data-id="${esc(r.id)}">` + cols.map(c => `<td class="${thCls(c)} ${c.cls || ''}">${fmt(r[c.k], c.f, r)}</td>`).join('') + (opts.actions ? `<td class="nowrap no-print">${r._noActions ? '' : opts.actions(r)}</td>` : '') + '</tr>';
    const body = rows.length ? rows.map(r => tr(r)).join('') : `<tr><td colspan="${cols.length + (opts.actions ? 1 : 0)}" class="empty">${opts.empty || 'Sin registros'}</td></tr>`;
    const foot = (opts.foot || []).map(r => tr(r, r._cls || 'total')).join('');
    return { id, html: `<div class="table-wrap"><table data-tid="${id}"><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table></div>` };
  }

  function card(title, inner, opts = {}) {
    const exp = opts.exportId ? `<button class="btn btn-secondary btn-sm no-print" data-export="${opts.exportId}">Exportar CSV</button>` : '';
    return `<div class="card ${opts.cls || ''}"><div class="card-head"><h3>${title}</h3><div class="actions" style="margin:0">${opts.extra || ''}${exp}</div></div>${opts.note ? `<div class="note">${opts.note}</div>` : ''}${inner}</div>`;
  }
  function tblCard(title, rows, cols, opts = {}) {
    const t = tbl(rows, cols, opts);
    return card(title, t.html, { ...opts, exportId: t.id });
  }

  function registerExport(rows, cols, name) { const id = 't' + (++tSeq); EXPORTS[id] = { rows, cols, name }; return id; }

  function exportCSV(id) {
    const x = EXPORTS[id];
    if (!x) return;
    const strip = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const cell = (r, c) => {
      const v = r[c.k];
      if (typeof c.f === 'function') return strip(c.f(v, r));
      if (NUMF.includes(c.f)) return v == null || v === '' ? '' : String(Math.round(Number(v) * 10000) / 10000);
      return strip(v);
    };
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [x.cols.map(c => q(c.l)).join(';')].concat(x.rows.map(r => x.cols.map(c => q(cell(r, c))).join(';')));
    download('﻿' + lines.join('\r\n'), (x.name || 'reporte') + '.csv', 'text/csv;charset=utf-8');
  }

  function download(content, name, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------ Formularios genéricos
  function options(list, sel, blank) {
    return (blank != null ? `<option value="">${esc(blank)}</option>` : '') + list.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
  }
  const accountOpts = (filter, sel, blank) => options(ctx().chart.filter(a => !filter || filter(a.codigo)).map(a => [a.codigo, a.codigo + ' - ' + a.nombre]), sel, blank);

  function fieldHtml(f, val) {
    const id = 'f_' + f.k, span = f.span ? 'span-' + f.span : '';
    const v = val ?? '';
    const ro = f.ro ? 'readonly' : '';
    if (f.t === 'select') {
      const opts = typeof f.opts === 'function' ? f.opts() : f.opts;
      return `<div class="field ${span}"><label for="${id}">${esc(f.l)}</label><select id="${id}" data-k="${f.k}">${options(opts, v, f.blank)}</select></div>`;
    }
    if (f.t === 'accounts') return `<div class="field ${span}"><label for="${id}">${esc(f.l)}</label><select id="${id}" data-k="${f.k}">${accountOpts(f.filter, v, f.blank)}</select></div>`;
    if (f.t === 'check') return `<div class="field check ${span}"><input type="checkbox" id="${id}" data-k="${f.k}" ${v ? 'checked' : ''}><label for="${id}">${esc(f.l)}</label></div>`;
    if (f.t === 'textarea') return `<div class="field ${span}"><label for="${id}">${esc(f.l)}</label><textarea id="${id}" data-k="${f.k}" rows="3">${esc(v)}</textarea></div>`;
    const type = f.t || 'text';
    const step = type === 'number' ? `step="${f.step || 'any'}" min="${f.min ?? 0}"` : '';
    return `<div class="field ${span}"><label for="${id}">${esc(f.l)}</label><input id="${id}" data-k="${f.k}" type="${type}" ${step} value="${esc(v)}" placeholder="${esc(f.ph || '')}" ${ro}></div>`;
  }

  function readFields(fields, root = document) {
    const o = {};
    fields.forEach(f => {
      const el = $('#f_' + f.k, root);
      if (!el) return;
      if (f.t === 'check') o[f.k] = el.checked;
      else if (f.t === 'number') o[f.k] = el.value === '' ? 0 : Number(el.value);
      else if (f.num) o[f.k] = el.value === '' ? null : Number(el.value);
      else o[f.k] = el.value.trim();
    });
    return o;
  }

  const EDIT = {};
  /**
   * CRUD genérico. cfg: {key, title, coll(db), fields, cols, defaults(), validate(rec, db, id), usos, after(db, rec)}
   */
  function crud(cfg) {
    const list = cfg.coll(DB);
    const editing = EDIT[cfg.key] != null ? list.find(x => Number(x.id) === Number(EDIT[cfg.key])) : null;
    if (!editing) EDIT[cfg.key] = null;
    const rec = editing || (cfg.defaults ? cfg.defaults() : {});
    const form = `<div class="card no-print"><h3>${editing ? 'Editar' : 'Registrar'} ${esc(cfg.title)}</h3>
      <div class="form-grid">${cfg.fields.filter(f => !f.hide).map(f => fieldHtml(f, rec[f.k])).join('')}</div>
      <div class="actions"><button class="btn btn-primary" data-crud-save="${cfg.key}">${editing ? 'Actualizar' : 'Grabar'}</button>
      ${editing ? `<button class="btn btn-secondary" data-crud-cancel="${cfg.key}">Cancelar edición</button>` : ''}${cfg.formExtra || ''}</div></div>`;
    const rows = (cfg.rows ? cfg.rows(list) : list);
    const t = tbl(rows, cfg.cols, {
      name: cfg.key, foot: cfg.foot ? cfg.foot(rows) : [],
      actions: r => `<button class="btn btn-secondary btn-sm" data-crud-edit="${cfg.key}" data-id="${r.id}">Editar</button> <button class="btn btn-danger btn-sm" data-crud-del="${cfg.key}" data-id="${r.id}">Eliminar</button>`
    });
    const listCard = card(cfg.listTitle || 'Registros', t.html, { exportId: t.id, note: cfg.listNote });
    const html = form + listCard;
    const bind = () => {
      $$(`[data-crud-save="${cfg.key}"]`).forEach(b => (b.onclick = () => {
        const data = readFields(cfg.fields);
        const ok = commit(d => {
          const arr = cfg.coll(d);
          const id = editing ? editing.id : nextId(arr);
          const rec2 = { ...(editing || {}), ...data, id };
          const msg = cfg.validate ? cfg.validate(rec2, d, editing ? editing.id : null) : '';
          if (msg) { notify(msg); return false; }
          if (cfg.beforeSave) cfg.beforeSave(rec2, d);
          if (editing) arr[arr.findIndex(x => Number(x.id) === Number(editing.id))] = rec2;
          else arr.push(rec2);
        });
        if (ok) { EDIT[cfg.key] = null; toast(editing ? 'Registro actualizado' : 'Registro grabado'); rerender(); }
      }));
      $$(`[data-crud-cancel="${cfg.key}"]`).forEach(b => (b.onclick = () => { EDIT[cfg.key] = null; rerender(); }));
      $$(`[data-crud-edit="${cfg.key}"]`).forEach(b => (b.onclick = () => { EDIT[cfg.key] = Number(b.dataset.id); rerender(); window.scrollTo(0, 0); }));
      $$(`[data-crud-del="${cfg.key}"]`).forEach(b => (b.onclick = async () => {
        const id = Number(b.dataset.id);
        if (cfg.usos) {
          const u = E.usos(DB, cfg.usos, id);
          if (u.length) return notify('No se puede eliminar: el registro se usa en ' + u.join(', ') + '.');
        }
        if (!await ask('¿Eliminar el registro seleccionado?')) return;
        if (commit(d => {
          const arr = cfg.coll(d);
          const i = arr.findIndex(x => Number(x.id) === id);
          if (i >= 0) arr.splice(i, 1);
          if (cfg.afterDelete) cfg.afterDelete(id, d);
        })) { toast('Registro eliminado'); rerender(); }
      }));
      if (cfg.bind) cfg.bind();
    };
    return { html, bind };
  }

  // ------------------------------------------------------------ Componentes de reporte
  function fsHead(title, mode) {
    const e = DB.empresa;
    const per = mode === 'al' ? 'Al ' + dateFmt(E.periodEnd(DB)) : `Del ${dateFmt(E.periodStart(DB))} al ${dateFmt(E.periodEnd(DB))}`;
    return `<div class="fs-head"><b>${esc(e.razon)}</b><span>RUC ${esc(e.ruc)}</span><b style="margin-top:6px">${esc(title)}</b><span>${per} · Expresado en soles (S/)</span></div>`;
  }

  function kpi(label, value, note) {
    return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div><div class="kpi-note">${esc(note || '')}</div></div>`;
  }

  function tAccount(code, acc, sub) {
    const c = ctx();
    const name = sub || c.accName(code);
    acc = acc || { movs: [], debe: 0, haber: 0, saldo: 0 };
    const col = side => acc.movs.filter(m => m[side]).map(m => `<div title="${esc(m.glosa)}"><span>(${m.num})</span>${n2(m[side])}</div>`).join('') || '<div><span>—</span></div>';
    const s = E.r2(acc.debe - acc.haber);
    const saldo = Math.abs(s) < 0.005 ? 'Cuenta saldada' : (s > 0 ? 'Saldo deudor ' : 'Saldo acreedor ') + money(Math.abs(s));
    return `<div class="t-acc"><div class="t-title">${esc(code)}<small>${esc(name)}</small></div><div class="t-body"><div class="t-col">${col('debe')}</div><div class="t-col">${col('haber')}</div></div><div class="t-foot"><div>${n2(acc.debe)}</div><div>${n2(acc.haber)}</div></div><div class="t-saldo">${saldo}</div></div>`;
  }

  function stmtTable(lines, name) {
    // lines: {l, v, cls, indent}
    const id = registerExport(lines.map(x => ({ concepto: x.l, monto: x.v })), [{ k: 'concepto', l: 'Concepto' }, { k: 'monto', l: 'Importe S/', f: 'money' }], name);
    const rows = lines.map(x => `<tr class="${x.cls || ''} ${x.indent ? 'indent' : ''}"><td>${esc(x.l)}</td><td class="money">${x.v == null ? '' : (x.v < 0 ? '(' + n2(-x.v) + ')' : n2(x.v))}</td></tr>`).join('');
    return { id, html: `<div class="table-wrap"><table><thead><tr><th>Concepto</th><th class="money">Importe S/</th></tr></thead><tbody>${rows}</tbody></table></div>` };
  }

  const pill = (t, cls) => `<span class="pill ${cls || ''}">${esc(t)}</span>`;
  const checkPill = (a, b) => (Math.abs(E.r2(a - b)) < 0.01 ? pill('Cuadra', 'ok') : pill('Diferencia ' + n2(a - b), 'bad'));

  function setContent(html) { $('#content').innerHTML = html; }

  // ------------------------------------------------------------ Vistas: inicio
  function viewDashboard() {
    const c = ctx();
    const rf = E.resultadosFuncion(c), es = E.estadoSituacion(c), ec = E.estadoCostos(c);
    const ots = Object.values(c.cost.porOT);
    const val = E.validar(c);
    const errs = val.filter(v => v.nivel !== 'ok');
    const maxT = Math.max(1, ...ots.map(o => o.total));
    const bars = ots.map(o => `<div class="bar-row"><div><b>${esc(o.ot.numero)}</b><br><span class="muted">${esc(E.byId(DB.productos, o.ot.productoId)?.nombre || '')}</span></div>
      <div class="bar-track" title="MD ${n2(o.md)} · MOD ${n2(o.mod)} · CIF ${n2(o.cif)}">
        <div class="bar-seg" style="width:${o.md / maxT * 100}%;background:#8b1e2d"></div>
        <div class="bar-seg" style="width:${o.mod / maxT * 100}%;background:#2459a9"></div>
        <div class="bar-seg" style="width:${o.cif / maxT * 100}%;background:#a96300"></div></div>
      <div class="right"><b>${money(o.total)}</b><br><span class="muted">${money(o.unit)} c/u</span></div></div>`).join('');
    const mod = (t, d, v) => `<div class="module"><h4>${t}</h4><p>${d}</p><button class="btn btn-secondary" data-go="${v}">Abrir</button></div>`;
    setContent(`
      <div class="hero"><span class="demo-chip">DATOS DE EJEMPLO · PERIODO ${esc(DB.empresa.periodo)}</span><h2>${esc(DB.empresa.razon)}</h2>
      <p>${esc(DB.empresa.actividad)} · Costeo por órdenes de trabajo · Kardex por ${DB.empresa.metodo === 'PEPS' ? 'PEPS' : 'promedio ponderado'} · ${c.entries.length} asientos generados automáticamente.</p></div>
      <div class="kpis">
        ${kpi('Ventas netas', money(rf.ventas), 'Cuenta 70')}
        ${kpi('Utilidad neta', money(rf.neto), 'Después de impuesto a la renta')}
        ${kpi('Costo de producción', money(ec.costoProd), 'MD + MOD + CIF del periodo')}
        ${kpi('Bancos', money(E.saldoPrefix(c.Lpre, '10')), 'Saldo de la cuenta 10')}
        ${kpi('O/T del periodo', ots.length, ots.filter(o => o.ot.estado === 'TERMINADA').length + ' terminadas · ' + ots.filter(o => o.ot.estado !== 'TERMINADA').length + ' en proceso')}
        ${kpi('CIF del periodo', money(ec.cif), DB.conceptosCIF.length + ' conceptos con inductor')}
        ${kpi('Activo total', money(es.tActivo), 'Estado de situación')}
        ${kpi('Cuadre contable', Math.abs(es.diferencia) < 0.01 ? 'CUADRADO' : 'REVISAR', 'Activo = Pasivo + Patrimonio')}
      </div>
      <div class="split">
        ${card('Costo por orden de trabajo', `<div class="bars">${bars || '<div class="empty">Sin órdenes</div>'}</div><div class="legend"><span><i style="background:#8b1e2d"></i>Materia prima directa</span><span><i style="background:#2459a9"></i>Mano de obra directa</span><span><i style="background:#a96300"></i>CIF aplicados</span></div>`)}
        ${card('Validaciones del sistema', errs.length ? errs.map(v => `<div class="${v.nivel === 'error' ? 'danger-note' : 'note'}">${esc(v.msg)}</div>`).join('') : '<div class="ok-note">Todo en orden: asientos cuadrados, kardex conciliados con sus cuentas, CIF distribuidos y balance cuadrado.</div>', { extra: '<button class="btn btn-secondary btn-sm" data-go="cierre">Ver detalle</button>' })}
      </div>
      ${card('Flujo de costos implementado', `<ol style="line-height:1.8;color:#475467;font-size:13px;margin:0;padding-left:18px">
        <li><b>Compra de materia prima</b> → 60 / 40 / 42, ingreso al almacén 24 (una subcuenta y un kardex por cada MP) contra 61.</li>
        <li><b>Requisición a una O/T</b> → salida del kardex (61 / 24) y destino a <b>91 Materia prima directa</b>.</li>
        <li><b>Planilla</b> → 62 / 40 / 41 y destino según clasificación: MOD → 92, MOI → 93 (CIF), administrativo → 94, ventas → 95. La MOD se asigna a cada O/T con las hojas de tiempo.</li>
        <li><b>CIF</b> → primero como gasto por naturaleza (63, 68, 62, 61) y luego en el <b>libro mayor de fábrica</b> (93), distribuido a cada O/T con su <b>inductor</b>.</li>
        <li><b>Cierre de la O/T</b> → MD + MOD + CIF a <b>23 Productos en proceso</b> (una subcuenta por O/T) contra 71; al terminar pasa a 21 Productos terminados (kardex de PT).</li>
        <li><b>Venta</b> → 12 / 70 / 40 y costo de ventas 69 / 21 según el kardex.</li></ol>`)}
      ${card('Accesos rápidos', `<div class="modules">
        ${mod('Compras y kardex', 'Registra compras de MP y revisa el kardex y la cuenta T de cada material.', 'compras')}
        ${mod('Hoja de costos', 'Costo de cada orden de trabajo: MD, MOD y CIF.', 'hojaCostos')}
        ${mod('Distribución de CIF', 'Inductores, bases por O/T y tasas de aplicación.', 'cif')}
        ${mod('Libro mayor de fábrica', 'Cuentas 91, 92, 93 y su traslado a la 23 por O/T.', 'fabrica')}
        ${mod('Estados financieros', 'Situación financiera, resultados, flujo de efectivo y patrimonio.', 'situacion')}
        ${mod('Balance de comprobación', 'Hoja de trabajo con sumas, saldos, inventario y resultados.', 'comprobacion')}</div>`)}
    `);
  }

  function viewConfig() {
    const e = DB.empresa;
    const F = [
      { k: 'razon', l: 'Razón social', span: 2 }, { k: 'ruc', l: 'RUC' }, { k: 'periodo', l: 'Periodo contable', t: 'month' },
      { k: 'direccion', l: 'Dirección', span: 2 }, { k: 'actividad', l: 'Actividad económica', span: 2 },
      { k: 'metodo', l: 'Método de valuación de existencias', t: 'select', opts: [['PROMEDIO', 'Promedio ponderado móvil'], ['PEPS', 'PEPS (primeras entradas, primeras salidas)']], span: 2 },
      { k: 'cajaInicial', l: 'Aporte inicial en efectivo (apertura)', t: 'number' }, { k: 'igvPct', l: 'IGV %', t: 'number' },
      { k: 'essaludPct', l: 'EsSalud % (empleador)', t: 'number' }, { k: 'onpPct', l: 'ONP %', t: 'number' },
      { k: 'afpPct', l: 'AFP % (aporte + prima + comisión)', t: 'number' }, { k: 'rmv', l: 'Remuneración mínima vital (RMV)', t: 'number' },
      { k: 'asigFamPct', l: 'Asignación familiar (% de la RMV)', t: 'number' }, { k: 'irPct', l: 'Impuesto a la renta %', t: 'number' },
      { k: 'calcularIR', l: 'Calcular impuesto a la renta', t: 'check' }, { k: 'registrarDepreciacion', l: 'Registrar depreciación mensual', t: 'check' }
    ];
    setContent(`<h2 class="section-title">Empresa y parámetros</h2><p class="section-sub">Datos generales y tasas usadas en planilla, impuestos y valuación. Al cambiar un parámetro se recalculan todos los asientos, kardex y estados financieros.</p>
      <div class="card"><div class="form-grid">${F.map(f => fieldHtml(f, e[f.k])).join('')}</div>
      <div class="note" style="margin-top:14px">Las tasas son parametrizables. Verifica las vigentes (RMV, comisiones y prima de seguro de la AFP, tasa del IR) antes de presentar el trabajo.</div>
      <div class="actions"><button class="btn btn-primary" id="cfgSave">Guardar parámetros</button></div></div>`);
    $('#cfgSave').onclick = () => {
      const data = readFields(F);
      if (!/^\d{4}-\d{2}$/.test(data.periodo)) return notify('Indica un periodo válido.');
      if (commit(d => { Object.assign(d.empresa, data); })) { toast('Parámetros guardados'); refreshChrome(); rerender(); }
    };
  }

  // ------------------------------------------------------------ Compras
  let COMPRA_EDIT = null;
  function compraItemRow(it) {
    const tipo = it.tipo;
    const del = '<button class="btn btn-danger btn-sm" data-del-item title="Quitar">✕</button>';
    const inp = (name, label, val, type = 'text', extra = '') => `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(val ?? '')}" ${type === 'number' ? 'step="any" min="0"' : ''} ${extra}></div>`;
    const sel = (name, label, opts) => `<div class="field"><label>${label}</label><select name="${name}">${opts}</select></div>`;
    const blank = '<div></div>';
    let cells;
    if (tipo === 'MATERIAL') {
      cells = sel('materialId', 'Material', options(DB.materiales.map(m => [m.id, `${m.codigo} ${m.nombre} (${m.tipo})`]), it.materialId)) +
        inp('cantidad', 'Cantidad', it.cantidad, 'number') + inp('costoUnit', 'Valor unitario (sin IGV)', it.costoUnit, 'number') + blank +
        inp('importe', 'Importe', n2(E.itemMonto(it)), 'text', 'readonly');
    } else if (tipo === 'SERVICIO') {
      cells = inp('descripcion', 'Descripción del gasto', it.descripcion) +
        sel('cuenta', 'Cuenta de gasto (naturaleza)', accountOpts(c => /^6[2-8]/.test(c), it.cuenta || '639')) +
        sel('destino', 'Destino', options(Object.entries(E.DESTINO_LABEL), it.destino || 'CIF')) +
        sel('cifId', 'Concepto CIF (si destino CIF)', options(DB.conceptosCIF.map(c => [c.id, c.codigo + ' ' + c.nombre]), it.cifId, '—')) +
        inp('monto', 'Importe (sin IGV)', it.monto, 'number');
    } else {
      cells = inp('descripcion', 'Descripción del activo', it.descripcion) + sel('cuenta', 'Cuenta (33)', accountOpts(c => c.startsWith('33'), it.cuenta || '3331')) + blank + blank + inp('monto', 'Valor (sin IGV)', it.monto, 'number');
    }
    const label = { MATERIAL: 'Material (MP/MI)', SERVICIO: 'Servicio / gasto', ACTIVO: 'Activo fijo' }[tipo];
    return `<div class="item-row" data-tipo="${tipo}"><div><span class="pill info">${label}</span></div>${cells}<div>${del}</div></div>`;
  }

  function readItems(container, kind) {
    return $$('.item-row', container).map(row => {
      const g = n => { const el = $(`[name="${n}"]`, row); return el ? el.value.trim() : ''; };
      if (kind === 'venta') return { productoId: Number(g('productoId')), cantidad: Number(g('cantidad')) || 0, precioUnit: Number(g('precioUnit')) || 0 };
      if (kind === 'asiento') return { cuenta: g('cuenta'), debe: Number(g('debe')) || 0, haber: Number(g('haber')) || 0, aux: g('aux') };
      const tipo = row.dataset.tipo;
      if (tipo === 'MATERIAL') return { tipo, materialId: Number(g('materialId')), cantidad: Number(g('cantidad')) || 0, costoUnit: Number(g('costoUnit')) || 0 };
      if (tipo === 'SERVICIO') return { tipo, descripcion: g('descripcion'), cuenta: g('cuenta'), destino: g('destino'), cifId: g('cifId') ? Number(g('cifId')) : null, monto: Number(g('monto')) || 0 };
      return { tipo, descripcion: g('descripcion'), cuenta: g('cuenta'), monto: Number(g('monto')) || 0 };
    });
  }

  function viewCompras() {
    const editing = COMPRA_EDIT ? E.byId(DB.compras, COMPRA_EDIT) : null;
    const doc = editing || { fecha: defDate(), tipoDoc: '01', documento: '', proveedor: '', ruc: '', condicion: 'CREDITO', items: [{ tipo: 'MATERIAL', materialId: DB.materiales[0]?.id, cantidad: 0, costoUnit: 0 }] };
    const H = [
      { k: 'fecha', l: 'Fecha de emisión', t: 'date' }, { k: 'tipoDoc', l: 'Comprobante', t: 'select', opts: Object.entries(E.TIPOS_DOC) },
      { k: 'documento', l: 'Serie - número', ph: 'F001-00001' }, { k: 'condicion', l: 'Condición', t: 'select', opts: [['CREDITO', 'Crédito'], ['CONTADO', 'Contado']] },
      { k: 'proveedor', l: 'Proveedor (razón social)', span: 2 }, { k: 'ruc', l: 'RUC' }
    ];
    const rows = DB.compras.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(x => {
      const t = E.compraTotals(x, DB.empresa.igvPct);
      return { ...x, ...t, detalle: x.items.map(it => it.tipo === 'MATERIAL' ? `${E.byId(DB.materiales, it.materialId)?.nombre || '?'} × ${qty(it.cantidad)}` : it.descripcion).join('; '), tdoc: E.TIPOS_DOC[x.tipoDoc] || x.tipoDoc };
    });
    const t = tbl(rows, [
      { k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'tdoc', l: 'Comprobante' }, { k: 'documento', l: 'Número' }, { k: 'proveedor', l: 'Proveedor' },
      { k: 'detalle', l: 'Detalle' }, { k: 'condicion', l: 'Condición' }, { k: 'subtotal', l: 'Valor', f: 'money' }, { k: 'igv', l: 'IGV', f: 'money' }, { k: 'total', l: 'Total', f: 'money' }
    ], {
      name: 'compras',
      foot: [{ fecha: '', tdoc: 'TOTAL', subtotal: E.sumBy(rows, 'subtotal'), igv: E.sumBy(rows, 'igv'), total: E.sumBy(rows, 'total'), _noActions: true }],
      actions: r => `<button class="btn btn-secondary btn-sm" data-edit="${r.id}">Editar</button> <button class="btn btn-secondary btn-sm" data-asientos="${esc(r.documento)}">Asientos</button> <button class="btn btn-danger btn-sm" data-del="${r.id}">Eliminar</button>`
    });
    setContent(`<h2 class="section-title">Compras</h2><p class="section-sub">Cada compra de materiales actualiza el <b>kardex</b> y la <b>cuenta 24/25</b> del material. Los servicios se registran como gasto por naturaleza (63) y se destinan a CIF (93, con su concepto e inductor), administración (94) o ventas (95).</p>
      <div class="card no-print"><h3>${editing ? 'Editar compra ' + esc(editing.documento) : 'Registrar compra'}</h3>
        <div class="form-grid">${H.map(f => fieldHtml(f, doc[f.k])).join('')}</div>
        <div class="items" id="items">${doc.items.map(compraItemRow).join('')}</div>
        <div class="actions"><button class="btn btn-secondary btn-sm" data-add="MATERIAL">+ Material</button><button class="btn btn-secondary btn-sm" data-add="SERVICIO">+ Servicio / gasto (CIF, adm., ventas)</button><button class="btn btn-secondary btn-sm" data-add="ACTIVO">+ Activo fijo</button></div>
        <div class="summary-bar" style="margin-top:12px" id="cTot"></div>
        <div class="actions"><button class="btn btn-primary" id="cSave">${editing ? 'Actualizar compra' : 'Grabar compra'}</button>${editing ? '<button class="btn btn-secondary" id="cCancel">Cancelar</button>' : ''}</div></div>
      ${card('Compras registradas', t.html, { exportId: t.id })}`);
    const itemsBox = $('#items');
    const updTot = () => {
      const items = readItems(itemsBox, 'compra');
      $$('.item-row', itemsBox).forEach((row, i) => { const imp = $('[name="importe"]', row); if (imp) imp.value = n2(E.itemMonto(items[i])); });
      const tt = E.compraTotals({ items, tipoDoc: $('#f_tipoDoc').value }, DB.empresa.igvPct);
      $('#cTot').innerHTML = `<div class="summary-item"><span>Valor de compra</span><b>${money(tt.subtotal)}</b></div><div class="summary-item"><span>IGV</span><b>${money(tt.igv)}</b></div><div class="summary-item"><span>Total</span><b>${money(tt.total)}</b></div>`;
    };
    const bindItems = () => $$('[data-del-item]', itemsBox).forEach(b => (b.onclick = () => { b.closest('.item-row').remove(); updTot(); }));
    itemsBox.addEventListener('input', updTot);
    itemsBox.addEventListener('change', updTot);
    $('#f_tipoDoc').onchange = updTot;
    $$('[data-add]').forEach(b => (b.onclick = () => {
      const it = b.dataset.add === 'MATERIAL' ? { tipo: 'MATERIAL', materialId: DB.materiales[0]?.id } : { tipo: b.dataset.add };
      itemsBox.insertAdjacentHTML('beforeend', compraItemRow(it));
      bindItems(); updTot();
    }));
    bindItems(); updTot();
    $('#cSave').onclick = () => {
      const h = readFields(H);
      const items = readItems(itemsBox, 'compra');
      if (!h.fecha || !h.documento || !h.proveedor) return notify('Completa fecha, número de comprobante y proveedor.');
      if (!items.length) return notify('Agrega al menos un ítem.');
      for (const it of items) {
        if (it.tipo === 'MATERIAL' && (!it.materialId || it.cantidad <= 0 || it.costoUnit <= 0)) return notify('Cada material debe tener material, cantidad y valor unitario mayores a cero.');
        if (it.tipo !== 'MATERIAL' && (!it.descripcion || it.monto <= 0)) return notify('Cada servicio o activo debe tener descripción e importe.');
        if (it.tipo === 'SERVICIO' && it.destino === 'CIF' && !it.cifId) return notify('Indica el concepto CIF del gasto destinado a CIF (define su inductor).');
        if (it.tipo === 'SERVICIO' && it.destino !== 'CIF') it.cifId = null;
      }
      if (commit(d => {
        if (editing) { const i = d.compras.findIndex(x => x.id === editing.id); d.compras[i] = { ...editing, ...h, items }; }
        else d.compras.push({ id: nextId(d.compras), ...h, items });
      })) { toast(editing ? 'Compra actualizada' : 'Compra registrada: kardex y asientos actualizados'); COMPRA_EDIT = null; rerender(); }
    };
    if ($('#cCancel')) $('#cCancel').onclick = () => { COMPRA_EDIT = null; rerender(); };
    $$('[data-edit]').forEach(b => (b.onclick = () => { COMPRA_EDIT = Number(b.dataset.edit); rerender(); window.scrollTo(0, 0); }));
    $$('[data-asientos]').forEach(b => (b.onclick = () => navigate('diario', { q: b.dataset.asientos })));
    $$('[data-del]').forEach(b => (b.onclick = async () => {
      if (!await ask('¿Eliminar la compra? Se recalcularán kardex y asientos.')) return;
      if (commit(d => { d.compras = d.compras.filter(x => x.id !== Number(b.dataset.del)); })) { toast('Compra eliminada'); rerender(); }
    }));
  }

  // ------------------------------------------------------------ Ventas
  let VENTA_EDIT = null;
  function ventaItemRow(it) {
    const c = ctx();
    const stock = p => c.kPT.items['P' + p.id] ? c.kPT.items['P' + p.id].saldoCant : 0;
    return `<div class="item-row simple"><div class="field"><label>Producto terminado</label><select name="productoId">${options(DB.productos.map(p => [p.id, `${p.codigo} ${p.nombre} (stock final: ${qty(stock(p))})`]), it.productoId)}</select></div>
      <div class="field"><label>Cantidad</label><input name="cantidad" type="number" step="any" min="0" value="${esc(it.cantidad ?? '')}"></div>
      <div class="field"><label>Valor unitario (sin IGV)</label><input name="precioUnit" type="number" step="any" min="0" value="${esc(it.precioUnit ?? '')}"></div>
      <div class="field"><label>Importe</label><input name="importe" readonly value="${n2(Number(it.cantidad || 0) * Number(it.precioUnit || 0))}"></div>
      <div><button class="btn btn-danger btn-sm" data-del-item>✕</button></div></div>`;
  }

  function viewVentas() {
    const c = ctx();
    const editing = VENTA_EDIT ? E.byId(DB.ventas, VENTA_EDIT) : null;
    const doc = editing || { fecha: defDate(), tipoDoc: '01', documento: '', cliente: '', ruc: '', condicion: 'CREDITO', items: [{ productoId: DB.productos[0]?.id }] };
    const H = [
      { k: 'fecha', l: 'Fecha de emisión', t: 'date' }, { k: 'tipoDoc', l: 'Comprobante', t: 'select', opts: [['01', 'Factura'], ['03', 'Boleta de venta']] },
      { k: 'documento', l: 'Serie - número', ph: 'F001-00010' }, { k: 'condicion', l: 'Condición', t: 'select', opts: [['CREDITO', 'Crédito'], ['CONTADO', 'Contado']] },
      { k: 'cliente', l: 'Cliente', span: 2 }, { k: 'ruc', l: 'RUC / DNI' }
    ];
    const rows = DB.ventas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(v => {
      const t = E.ventaTotals(v, DB.empresa.igvPct);
      const costo = E.r2(v.items.reduce((s, it, i) => s + (c.kPT.costs['V' + v.id + '-' + i] || 0), 0));
      return { ...v, ...t, costo, margen: E.r2(t.subtotal - costo), detalle: v.items.map(it => `${E.byId(DB.productos, it.productoId)?.nombre || '?'} × ${qty(it.cantidad)}`).join('; ') };
    });
    const t = tbl(rows, [
      { k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'documento', l: 'Número' }, { k: 'cliente', l: 'Cliente' }, { k: 'detalle', l: 'Detalle' }, { k: 'condicion', l: 'Condición' },
      { k: 'subtotal', l: 'Valor venta', f: 'money' }, { k: 'igv', l: 'IGV', f: 'money' }, { k: 'total', l: 'Total', f: 'money' }, { k: 'costo', l: 'Costo de ventas', f: 'money' }, { k: 'margen', l: 'Margen bruto', f: 'money' }
    ], {
      name: 'ventas',
      foot: [{ documento: 'TOTAL', subtotal: E.sumBy(rows, 'subtotal'), igv: E.sumBy(rows, 'igv'), total: E.sumBy(rows, 'total'), costo: E.sumBy(rows, 'costo'), margen: E.sumBy(rows, 'margen'), _noActions: true }],
      actions: r => `<button class="btn btn-secondary btn-sm" data-edit="${r.id}">Editar</button> <button class="btn btn-secondary btn-sm" data-asientos="${esc(r.documento)}">Asientos</button> <button class="btn btn-danger btn-sm" data-del="${r.id}">Eliminar</button>`
    });
    setContent(`<h2 class="section-title">Ventas</h2><p class="section-sub">Cada venta registra 12 / 70 / 40 y el costo de ventas (69 / 21) valorizado con el kardex de productos terminados. No se permite vender más de lo disponible.</p>
      <div class="card no-print"><h3>${editing ? 'Editar venta ' + esc(editing.documento) : 'Registrar venta'}</h3>
        <div class="form-grid">${H.map(f => fieldHtml(f, doc[f.k])).join('')}</div>
        <div class="items" id="items">${doc.items.map(ventaItemRow).join('')}</div>
        <div class="actions"><button class="btn btn-secondary btn-sm" id="addItem">+ Producto</button></div>
        <div class="summary-bar" style="margin-top:12px" id="vTot"></div>
        <div class="actions"><button class="btn btn-primary" id="vSave">${editing ? 'Actualizar venta' : 'Grabar venta'}</button>${editing ? '<button class="btn btn-secondary" id="vCancel">Cancelar</button>' : ''}</div></div>
      ${card('Ventas registradas', t.html, { exportId: t.id })}`);
    const box = $('#items');
    const upd = () => {
      const items = readItems(box, 'venta');
      $$('.item-row', box).forEach((row, i) => ($('[name="importe"]', row).value = n2(items[i].cantidad * items[i].precioUnit)));
      const tt = E.ventaTotals({ items }, DB.empresa.igvPct);
      $('#vTot').innerHTML = `<div class="summary-item"><span>Valor de venta</span><b>${money(tt.subtotal)}</b></div><div class="summary-item"><span>IGV</span><b>${money(tt.igv)}</b></div><div class="summary-item"><span>Total</span><b>${money(tt.total)}</b></div>`;
    };
    const bindDel = () => $$('[data-del-item]', box).forEach(b => (b.onclick = () => { b.closest('.item-row').remove(); upd(); }));
    box.addEventListener('input', upd);
    $('#addItem').onclick = () => { box.insertAdjacentHTML('beforeend', ventaItemRow({ productoId: DB.productos[0]?.id })); bindDel(); upd(); };
    bindDel(); upd();
    $('#vSave').onclick = () => {
      const h = readFields(H), items = readItems(box, 'venta');
      if (!h.fecha || !h.documento || !h.cliente) return notify('Completa fecha, número de comprobante y cliente.');
      if (!items.length || items.some(i => !i.productoId || i.cantidad <= 0 || i.precioUnit <= 0)) return notify('Cada ítem debe tener producto, cantidad y valor unitario.');
      if (commit(d => {
        if (editing) { const i = d.ventas.findIndex(x => x.id === editing.id); d.ventas[i] = { ...editing, ...h, items }; }
        else d.ventas.push({ id: nextId(d.ventas), ...h, items });
      })) { toast('Venta registrada: kardex de PT y costo de ventas actualizados'); VENTA_EDIT = null; rerender(); }
    };
    if ($('#vCancel')) $('#vCancel').onclick = () => { VENTA_EDIT = null; rerender(); };
    $$('[data-edit]').forEach(b => (b.onclick = () => { VENTA_EDIT = Number(b.dataset.edit); rerender(); window.scrollTo(0, 0); }));
    $$('[data-asientos]').forEach(b => (b.onclick = () => navigate('diario', { q: b.dataset.asientos })));
    $$('[data-del]').forEach(b => (b.onclick = async () => {
      if (!await ask('¿Eliminar la venta?')) return;
      if (commit(d => { d.ventas = d.ventas.filter(x => x.id !== Number(b.dataset.del)); })) { toast('Venta eliminada'); rerender(); }
    }));
  }

  // ------------------------------------------------------------ Tesorería
  function viewTesoreria() {
    const c = ctx();
    const neto = E.sumBy(c.pl, 'neto');
    const cfg = {
      key: 'tes', title: 'movimiento de tesorería', coll: d => d.tesoreria,
      defaults: () => ({ fecha: defDate(), tipo: 'COBRO_CLIENTE', cuenta: '1212', actividad: 'Operación' }),
      fields: [
        { k: 'fecha', l: 'Fecha', t: 'date' }, { k: 'tipo', l: 'Tipo de movimiento', t: 'select', opts: Object.entries(E.TES_TIPOS).map(([k, v]) => [k, (v.dir === 'I' ? 'Ingreso · ' : 'Egreso · ') + v.label]) },
        { k: 'cuenta', l: 'Cuenta contrapartida', t: 'accounts', span: 2 },
        { k: 'aux', l: 'Tercero (cliente / proveedor)' }, { k: 'documento', l: 'Documento referencia' },
        { k: 'monto', l: 'Importe S/', t: 'number' }, { k: 'actividad', l: 'Actividad (flujo de efectivo)', t: 'select', opts: ['Operación', 'Inversión', 'Financiamiento'] },
        { k: 'glosa', l: 'Glosa (opcional)', span: 4 }
      ],
      cols: [{ k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'tipo', l: 'Tipo', f: v => esc(E.TES_TIPOS[v]?.label || v) }, { k: 'cuenta', l: 'Cuenta' }, { k: 'aux', l: 'Tercero' }, { k: 'documento', l: 'Documento' }, { k: 'actividad', l: 'Actividad' },
        { k: 'monto', l: 'Ingreso', f: (v, r) => (E.TES_TIPOS[r.tipo]?.dir === 'I' ? n2(v) : ''), cls: 'money' }, { k: 'monto2', l: 'Egreso', f: (v, r) => (E.TES_TIPOS[r.tipo]?.dir === 'E' ? n2(r.monto) : ''), cls: 'money' }],
      rows: l => l.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
      validate: r => (!r.fecha || r.monto <= 0 ? 'Indica fecha e importe mayor a cero.' : !r.cuenta ? 'Indica la cuenta contrapartida.' : ''),
      bind: () => {
        $('#f_tipo').onchange = e => { const tt = E.TES_TIPOS[e.target.value]; if (tt.cuenta) $('#f_cuenta').value = tt.cuenta; $('#f_actividad').value = tt.act; if (e.target.value === 'PAGO_PLANILLA') $('#f_monto').value = neto; };
      }
    };
    const cr = crud(cfg);
    const cxc = E.saldosPorTercero(c, '12'), cxp = E.saldosPorTercero(c, '42');
    setContent(`<h2 class="section-title">Tesorería: cobros y pagos</h2><p class="section-sub">Movimientos de la cuenta 10 (bancos). La actividad indicada clasifica el movimiento en el Estado de flujo de efectivo. Neto de planilla por pagar: <b>${money(neto)}</b>.</p>
      ${cr.html}
      <div class="split">${tblCard('Cuentas por cobrar pendientes (12)', cxc, [{ k: 'tercero', l: 'Cliente' }, { k: 'debe', l: 'Cargos', f: 'money' }, { k: 'haber', l: 'Abonos', f: 'money' }, { k: 'saldo', l: 'Saldo', f: 'money' }], { name: 'cxc', empty: 'Sin saldos' })}
      ${tblCard('Cuentas por pagar pendientes (42)', cxp.map(x => ({ ...x, saldo: -x.saldo })), [{ k: 'tercero', l: 'Proveedor' }, { k: 'debe', l: 'Pagos', f: 'money' }, { k: 'haber', l: 'Compras', f: 'money' }, { k: 'saldo', l: 'Saldo', f: 'money' }], { name: 'cxp', empty: 'Sin saldos' })}</div>`);
    cr.bind();
  }

  // ------------------------------------------------------------ Planilla
  function viewPlanilla() {
    const c = ctx();
    const cfg = {
      key: 'trab', title: 'trabajador', coll: d => d.trabajadores, usos: 'trabajador', listTitle: 'Trabajadores',
      defaults: () => ({ clasificacion: 'MOD', sistema: 'AFP', sueldo: DB.empresa.rmv }),
      fields: [
        { k: 'dni', l: 'DNI' }, { k: 'nombre', l: 'Apellidos y nombres', span: 2 }, { k: 'cargo', l: 'Cargo' },
        { k: 'clasificacion', l: 'Clasificación', t: 'select', opts: Object.entries(E.CLASIF_TRAB).map(([k, v]) => [k, k + ' - ' + v]) },
        { k: 'sueldo', l: 'Sueldo básico', t: 'number' }, { k: 'sistema', l: 'Sistema de pensiones', t: 'select', opts: ['AFP', 'ONP'] },
        { k: 'renta5', l: 'Retención 5ta categoría (mensual)', t: 'number' },
        { k: 'cifId', l: 'Concepto CIF (solo MOI)', t: 'select', num: true, blank: '—', opts: () => DB.conceptosCIF.map(x => [x.id, x.codigo + ' ' + x.nombre]) },
        { k: 'asigFam', l: 'Asignación familiar', t: 'check' }
      ],
      cols: [{ k: 'dni', l: 'DNI' }, { k: 'nombre', l: 'Trabajador' }, { k: 'cargo', l: 'Cargo' }, { k: 'clasificacion', l: 'Clasificación', f: v => pill(v + ' · ' + E.CLASIF_TRAB[v], CLASIF_PILL[v]) }, { k: 'sueldo', l: 'Básico', f: 'money' }, { k: 'sistema', l: 'Pensión' }],
      validate: r => (!r.nombre ? 'Ingresa el nombre.' : r.sueldo <= 0 ? 'Ingresa el sueldo.' : r.clasificacion === 'MOI' && !r.cifId ? 'El trabajador MOI debe tener un concepto CIF.' : ''),
      beforeSave: r => { if (r.clasificacion !== 'MOI') r.cifId = null; }
    };
    const cr = crud(cfg);
    const pl = c.pl;
    const cols = [
      { k: 'nombre', l: 'Trabajador' }, { k: 'clasificacion', l: 'Tipo', f: v => pill(v, CLASIF_PILL[v]) }, { k: 'cargo', l: 'Cargo' },
      { k: 'basico', l: 'Básico', f: 'money' }, { k: 'af', l: 'Asig. fam.', f: 'money' }, { k: 'bruto', l: 'Total remuneración', f: 'money' },
      { k: 'onp', l: 'ONP', f: 'money' }, { k: 'afp', l: 'AFP', f: 'money' }, { k: 'renta5', l: 'Renta 5ta', f: 'money' }, { k: 'desc', l: 'Total desc.', f: 'money' },
      { k: 'neto', l: 'Neto a pagar', f: 'money' }, { k: 'essalud', l: 'EsSalud', f: 'money' }, { k: 'costo', l: 'Costo laboral', f: 'money' }
    ];
    const order = ['MOD', 'MOI', 'ADM', 'VEN'];
    const rows = [];
    order.forEach(k => {
      const g = pl.filter(w => w.clasificacion === k);
      if (!g.length) return;
      rows.push({ nombre: k + ' · ' + E.CLASIF_TRAB[k], _cls: 'group' });
      g.forEach(w => rows.push(w));
      const sub = { nombre: 'Subtotal ' + k, _cls: 'sub' };
      ['basico', 'af', 'bruto', 'onp', 'afp', 'renta5', 'desc', 'neto', 'essalud', 'costo'].forEach(x => (sub[x] = E.sumBy(g, x)));
      rows.push(sub);
    });
    const tot = { nombre: 'TOTAL PLANILLA' };
    ['basico', 'af', 'bruto', 'onp', 'afp', 'renta5', 'desc', 'neto', 'essalud', 'costo'].forEach(x => (tot[x] = E.sumBy(pl, x)));
    const dest = order.map(k => ({ clasificacion: k, desc: E.CLASIF_TRAB[k], cuenta: { MOD: '921 MOD', MOI: '931 CIF', ADM: '941 Gastos administración', VEN: '951 Gastos de ventas' }[k], n: pl.filter(w => w.clasificacion === k).length, costo: E.sumBy(pl.filter(w => w.clasificacion === k), 'costo') }));
    setContent(`<h2 class="section-title">Planilla de remuneraciones</h2><p class="section-sub">Cada trabajador se clasifica como <b>MOD</b> (se asigna a las O/T con hojas de tiempo), <b>MOI</b> (CIF), <b>personal administrativo</b> (94) o <b>personal de ventas</b> (95). Periodo ${esc(DB.empresa.periodo)} · RMV ${money(DB.empresa.rmv)} · EsSalud ${DB.empresa.essaludPct}% · ONP ${DB.empresa.onpPct}% · AFP ${DB.empresa.afpPct}%.</p>
      ${tblCard('Planilla del periodo ' + esc(DB.empresa.periodo), rows, cols, { name: 'planilla', foot: [tot] })}
      ${tblCard('Resumen por clasificación y destino contable', dest, [{ k: 'clasificacion', l: 'Tipo', f: v => pill(v, CLASIF_PILL[v]) }, { k: 'desc', l: 'Clasificación' }, { k: 'n', l: 'N° trabajadores' }, { k: 'cuenta', l: 'Cuenta de destino' }, { k: 'costo', l: 'Costo laboral (bruto + EsSalud)', f: 'money' }], { name: 'planilla-destino', foot: [{ desc: 'TOTAL', costo: E.sumBy(dest, 'costo') }] })}
      ${cr.html}`);
    cr.bind();
  }

  // ------------------------------------------------------------ Asientos manuales
  let AS_EDIT = null;
  function lineRow(l) {
    return `<div class="item-row lines"><div class="field"><label>Cuenta</label><select name="cuenta">${accountOpts(null, l.cuenta)}</select></div>
      <div class="field"><label>Debe</label><input name="debe" type="number" step="any" min="0" value="${esc(l.debe || '')}"></div>
      <div class="field"><label>Haber</label><input name="haber" type="number" step="any" min="0" value="${esc(l.haber || '')}"></div>
      <div class="field"><label>Auxiliar / tercero</label><input name="aux" value="${esc(l.aux || '')}"></div>
      <div><button class="btn btn-danger btn-sm" data-del-item>✕</button></div></div>`;
  }

  function viewAsientos() {
    const editing = AS_EDIT ? E.byId(DB.asientos, AS_EDIT) : null;
    const preset = PARAMS.tipo || 'Operación';
    const doc = editing || { fecha: defDate(), tipo: preset, actividad: 'Operación', glosa: '', lineas: [{}, {}] };
    const H = [
      { k: 'fecha', l: 'Fecha', t: 'date' }, { k: 'tipo', l: 'Tipo de asiento', t: 'select', opts: ['Operación', 'Ajuste', 'Reversión'] },
      { k: 'actividad', l: 'Actividad (si afecta caja)', t: 'select', opts: ['Operación', 'Inversión', 'Financiamiento'] }, { k: 'glosa', l: 'Glosa', span: 4 }
    ];
    const rows = DB.asientos.map(a => ({ ...a, debe: E.sumBy(a.lineas, 'debe'), haber: E.sumBy(a.lineas, 'haber'), cuentas: a.lineas.map(l => l.cuenta).join(', ') }));
    const t = tbl(rows, [{ k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'tipo', l: 'Tipo' }, { k: 'glosa', l: 'Glosa' }, { k: 'cuentas', l: 'Cuentas' }, { k: 'debe', l: 'Debe', f: 'money' }, { k: 'haber', l: 'Haber', f: 'money' }], {
      name: 'asientos-manuales',
      actions: r => `<button class="btn btn-secondary btn-sm" data-edit="${r.id}">Editar</button> <button class="btn btn-danger btn-sm" data-del="${r.id}">Eliminar</button>`
    });
    setContent(`<h2 class="section-title">Asientos manuales</h2><p class="section-sub">Para operaciones que no provienen de un documento (ajustes, reclasificaciones, gastos bancarios). Los asientos de compras, ventas, planilla, requisiciones y O/T se generan solos: para cambiarlos edita el documento de origen. Recuerda registrar también el destino (9x / 79) de los gastos por naturaleza.</p>
      <div class="card no-print"><h3>${editing ? 'Editar asiento' : 'Nuevo asiento'}</h3>
        <div class="form-grid">${H.map(f => fieldHtml(f, doc[f.k])).join('')}</div>
        <div class="items" id="lines">${doc.lineas.map(lineRow).join('')}</div>
        <div class="actions"><button class="btn btn-secondary btn-sm" id="addLine">+ Línea</button></div>
        <div class="summary-bar" style="margin-top:12px" id="aTot"></div>
        <div class="actions"><button class="btn btn-primary" id="aSave">${editing ? 'Actualizar asiento' : 'Grabar asiento'}</button>${editing ? '<button class="btn btn-secondary" id="aCancel">Cancelar</button>' : ''}</div></div>
      ${card('Asientos manuales registrados', t.html, { exportId: t.id })}`);
    const box = $('#lines');
    const upd = () => {
      const ls = readItems(box, 'asiento');
      const d = E.sumBy(ls, 'debe'), h = E.sumBy(ls, 'haber');
      $('#aTot').innerHTML = `<div class="summary-item"><span>Total Debe</span><b>${money(d)}</b></div><div class="summary-item"><span>Total Haber</span><b>${money(h)}</b></div><div class="summary-item"><span>Estado</span><b>${Math.abs(d - h) < 0.005 && d > 0 ? 'Cuadrado' : 'Descuadrado'}</b></div>`;
    };
    const bindDel = () => $$('[data-del-item]', box).forEach(b => (b.onclick = () => { b.closest('.item-row').remove(); upd(); }));
    box.addEventListener('input', upd);
    $('#addLine').onclick = () => { box.insertAdjacentHTML('beforeend', lineRow({})); bindDel(); };
    bindDel(); upd();
    $('#aSave').onclick = () => {
      const h = readFields(H);
      const lineas = readItems(box, 'asiento').filter(l => l.debe || l.haber);
      const d = E.sumBy(lineas, 'debe'), hb = E.sumBy(lineas, 'haber');
      if (!h.fecha || !h.glosa) return notify('Indica fecha y glosa.');
      if (lineas.length < 2) return notify('El asiento necesita al menos dos líneas.');
      if (lineas.some(l => l.debe && l.haber)) return notify('Cada línea debe ir solo al Debe o solo al Haber.');
      if (Math.abs(d - hb) > 0.005) return notify(`El asiento no cuadra: Debe ${n2(d)} y Haber ${n2(hb)}.`);
      if (commit(db => {
        if (editing) { const i = db.asientos.findIndex(x => x.id === editing.id); db.asientos[i] = { ...editing, ...h, lineas }; }
        else db.asientos.push({ id: nextId(db.asientos), ...h, lineas });
      })) { toast('Asiento grabado'); AS_EDIT = null; rerender(); }
    };
    if ($('#aCancel')) $('#aCancel').onclick = () => { AS_EDIT = null; rerender(); };
    $$('[data-edit]').forEach(b => (b.onclick = () => { AS_EDIT = Number(b.dataset.edit); rerender(); window.scrollTo(0, 0); }));
    $$('[data-del]').forEach(b => (b.onclick = async () => {
      if (!await ask('¿Eliminar el asiento?')) return;
      if (commit(d => { d.asientos = d.asientos.filter(x => x.id !== Number(b.dataset.del)); })) { toast('Asiento eliminado'); rerender(); }
    }));
  }

  // ------------------------------------------------------------ Producción
  const prodName = id => E.byId(DB.productos, id)?.nombre || '-';
  const otNum = id => E.byId(DB.ordenes, id)?.numero || '';

  function viewOrdenes() {
    const c = ctx();
    const cr = crud({
      key: 'ot', title: 'orden de trabajo', coll: d => d.ordenes, usos: 'ot', listTitle: 'Órdenes de trabajo',
      defaults: () => ({ numero: 'OT-' + E.pad(nextId(DB.ordenes), 3), productoId: DB.productos[0]?.id, cantidad: 1, fechaInicio: E.periodStart(DB), estado: 'EN PROCESO' }),
      fields: [
        { k: 'numero', l: 'N° O/T' }, { k: 'productoId', l: 'Producto', t: 'select', num: true, opts: () => DB.productos.map(p => [p.id, p.codigo + ' ' + p.nombre]) },
        { k: 'cantidad', l: 'Cantidad a producir', t: 'number' }, { k: 'cliente', l: 'Cliente / destino' },
        { k: 'fechaInicio', l: 'Fecha de inicio', t: 'date' }, { k: 'fechaFin', l: 'Fecha de término', t: 'date' },
        { k: 'estado', l: 'Estado', t: 'select', opts: [['EN PROCESO', 'En proceso'], ['TERMINADA', 'Terminada']] }
      ],
      cols: [{ k: 'numero', l: 'O/T' }, { k: 'productoId', l: 'Producto', f: v => esc(prodName(v)) }, { k: 'cantidad', l: 'Cantidad', f: 'qty' }, { k: 'cliente', l: 'Cliente' },
        { k: 'fechaInicio', l: 'Inicio', f: 'date' }, { k: 'fechaFin', l: 'Término', f: 'date' }, { k: 'estado', l: 'Estado', f: v => pill(v, v === 'TERMINADA' ? 'ok' : 'warn') }],
      validate: (r, d, id) => (!r.numero ? 'Indica el número.' : d.ordenes.some(o => o.numero === r.numero && o.id !== id) ? 'El número de O/T ya existe.' : r.cantidad <= 0 ? 'La cantidad debe ser mayor a cero.' : r.estado === 'TERMINADA' && !r.fechaFin ? 'Una O/T terminada necesita fecha de término.' : ''),
      afterDelete: (id, d) => { d.basesInductor = d.basesInductor.filter(b => Number(b.otId) !== id); }
    });
    const rows = Object.values(c.cost.porOT).map(R => ({ numero: R.ot.numero, producto: prodName(R.ot.productoId), cantidad: R.ot.cantidad, md: R.md, mod: R.mod, cif: R.cif, total: R.total, unit: R.unit, estado: R.ot.estado, cuenta: E.otAccount(R.ot) }));
    setContent(`<h2 class="section-title">Órdenes de trabajo (O/T)</h2><p class="section-sub">Cada O/T tiene su subcuenta en la 23 (productos en proceso). Al marcarla como TERMINADA, su costo pasa a la 21 y entra al kardex de productos terminados.</p>
      ${tblCard('Costo acumulado por O/T', rows, [{ k: 'numero', l: 'O/T' }, { k: 'cuenta', l: 'Cuenta 23' }, { k: 'producto', l: 'Producto' }, { k: 'cantidad', l: 'Cant.', f: 'qty' }, { k: 'md', l: 'MD', f: 'money' }, { k: 'mod', l: 'MOD', f: 'money' }, { k: 'cif', l: 'CIF', f: 'money' }, { k: 'total', l: 'Costo total', f: 'money' }, { k: 'unit', l: 'Costo unitario', f: 'cu' }, { k: 'estado', l: 'Estado', f: v => pill(v, v === 'TERMINADA' ? 'ok' : 'warn') }],
        { name: 'costo-ot', foot: [{ numero: 'TOTAL', md: E.sumBy(rows, 'md'), mod: E.sumBy(rows, 'mod'), cif: E.sumBy(rows, 'cif'), total: E.sumBy(rows, 'total') }] })}
      ${cr.html}`);
    cr.bind();
  }

  function viewRequisiciones() {
    const c = ctx();
    const cr = crud({
      key: 'rq', title: 'requisición de materiales', coll: d => d.requisiciones, listTitle: 'Requisiciones (salidas de almacén)',
      defaults: () => ({ fecha: defDate(), numero: 'RQ-' + E.pad(nextId(DB.requisiciones), 3), materialId: DB.materiales[0]?.id, otId: DB.ordenes[0]?.id }),
      fields: [
        { k: 'fecha', l: 'Fecha', t: 'date' }, { k: 'numero', l: 'N° requisición' },
        { k: 'materialId', l: 'Material', t: 'select', num: true, opts: () => DB.materiales.map(m => [m.id, `${m.codigo} ${m.nombre} (${m.tipo}) · stock final ${qty(c.kMat.items['M' + m.id]?.saldoCant)}`]) },
        { k: 'otId', l: 'Orden de trabajo (MP)', t: 'select', num: true, blank: '— Material indirecto (CIF) —', opts: () => DB.ordenes.map(o => [o.id, o.numero + ' · ' + prodName(o.productoId)]) },
        { k: 'cantidad', l: 'Cantidad', t: 'number' }
      ],
      rows: l => l.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id).map(r => {
        const m = E.byId(DB.materiales, r.materialId);
        const costo = c.kMat.costs['RQ' + r.id] || 0;
        return { ...r, material: m?.nombre, tipo: m?.tipo, unidad: m?.unidad, costo, cu: r.cantidad ? costo / r.cantidad : 0, destino: m?.tipo === 'MI' ? 'CIF (931) · ' + (E.byId(DB.conceptosCIF, m.cifId)?.nombre || '') : 'MD (911) · ' + otNum(r.otId) };
      }),
      cols: [{ k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'numero', l: 'N°' }, { k: 'material', l: 'Material' }, { k: 'tipo', l: 'Tipo', f: v => pill(v, v === 'MP' ? 'info' : 'warn') }, { k: 'cantidad', l: 'Cantidad', f: 'qty' }, { k: 'unidad', l: 'Unidad' }, { k: 'cu', l: 'Costo unit.', f: 'cu' }, { k: 'costo', l: 'Costo total', f: 'money' }, { k: 'destino', l: 'Destino' }],
      foot: rows => [{ numero: 'TOTAL', costo: E.sumBy(rows, 'costo') }],
      validate: (r, d) => {
        const m = E.byId(d.materiales, r.materialId);
        if (!m || r.cantidad <= 0) return 'Indica material y cantidad.';
        if (m.tipo === 'MP' && !r.otId) return 'La materia prima debe asignarse a una O/T.';
        return '';
      },
      beforeSave: (r, d) => { if (E.byId(d.materiales, r.materialId)?.tipo === 'MI') r.otId = null; }
    });
    setContent(`<h2 class="section-title">Requisiciones de materiales</h2><p class="section-sub">Las salidas de <b>materia prima</b> se cargan a una O/T (91 MD). Las de <b>material indirecto</b> van a CIF (93). El costo se toma del kardex (${DB.empresa.metodo === 'PEPS' ? 'PEPS' : 'promedio ponderado'}); no se permite sacar más de lo que hay en stock.</p>${cr.html}`);
    cr.bind();
  }

  function viewHoras() {
    const c = ctx();
    const mods = DB.trabajadores.filter(t => t.clasificacion === 'MOD');
    const cr = crud({
      key: 'hrs', title: 'horas de MOD', coll: d => d.horas, listTitle: 'Hojas de tiempo',
      defaults: () => ({ trabajadorId: mods[0]?.id, otId: DB.ordenes[0]?.id, horas: 8 }),
      fields: [
        { k: 'trabajadorId', l: 'Trabajador MOD', t: 'select', num: true, opts: () => mods.map(t => [t.id, t.nombre + ' · ' + t.cargo]) },
        { k: 'otId', l: 'Orden de trabajo', t: 'select', num: true, opts: () => DB.ordenes.map(o => [o.id, o.numero]) },
        { k: 'horas', l: 'Horas trabajadas', t: 'number' }, { k: 'fecha', l: 'Fecha (opcional)', t: 'date' }
      ],
      rows: l => l.map(h => ({ ...h, trabajador: E.byId(DB.trabajadores, h.trabajadorId)?.nombre, ot: otNum(h.otId) })),
      cols: [{ k: 'trabajador', l: 'Trabajador' }, { k: 'ot', l: 'O/T' }, { k: 'horas', l: 'Horas', f: 'qty' }, { k: 'fecha', l: 'Fecha', f: 'date' }],
      validate: (r, d) => (!E.byId(d.trabajadores, r.trabajadorId) || !E.byId(d.ordenes, r.otId) || r.horas <= 0 ? 'Indica trabajador, O/T y horas.' : '')
    });
    const resumen = c.pl.filter(w => w.clasificacion === 'MOD').map(w => {
      const row = { trabajador: w.nombre, costo: w.costo };
      let tot = 0;
      DB.ordenes.forEach(o => { const h = DB.horas.filter(x => Number(x.trabajadorId) === w.id && Number(x.otId) === o.id).reduce((s, x) => s + Number(x.horas || 0), 0); row['o' + o.id] = h; tot += h; });
      row.total = tot;
      row.tarifa = tot ? w.costo / tot : 0;
      return row;
    });
    const cols = [{ k: 'trabajador', l: 'Trabajador MOD' }, ...DB.ordenes.map(o => ({ k: 'o' + o.id, l: o.numero + ' (h)', f: 'qty' })), { k: 'total', l: 'Total horas', f: 'qty' }, { k: 'costo', l: 'Costo laboral', f: 'money' }, { k: 'tarifa', l: 'Tarifa S/ por hora', f: 'cu' }];
    setContent(`<h2 class="section-title">Hojas de tiempo de mano de obra directa</h2><p class="section-sub">Las horas de cada trabajador MOD distribuyen su costo laboral (remuneración + EsSalud) entre las O/T. También alimentan el inductor "Horas MOD" de los CIF.</p>
      ${tblCard('Distribución de horas por O/T', resumen, cols, { name: 'horas-mod' })}${cr.html}`);
    cr.bind();
  }

  function viewCIF() {
    const c = ctx();
    const ots = DB.ordenes;
    const FUENTE = { UNIDADES: 'Automático: unidades de la O/T', HORAS_MOD: 'Automático: hojas de tiempo', COSTO_MD: 'Automático: costo de MD', MANUAL: 'Manual (ingresar por O/T)' };
    const indRows = DB.inductores.map(i => ({ ...i, fuenteL: FUENTE[i.fuente] || i.fuente, conceptos: DB.conceptosCIF.filter(x => Number(x.inductorId) === i.id).map(x => x.nombre).join(', ') }));
    const conRows = c.cost.pools.map(p => ({ codigo: p.concepto.codigo, concepto: p.concepto.nombre, inductor: p.inductor?.nombre || '-', unidad: p.inductor?.unidad || '', comportamiento: p.concepto.comportamiento, monto: p.monto, baseTotal: p.baseTotal, tasa: p.tasa, fuentes: p.fuentes.map(f => `${f.origen}: ${n2(f.monto)}`).join(' · ') }));
    const matrix = DB.inductores.map(ind => {
      const cells = ots.map(o => {
        const v = c.cost.bases[ind.id]?.[o.id] || 0;
        return ind.fuente === 'MANUAL' ? `<td class="money"><input type="number" step="any" min="0" data-base="${ind.id}:${o.id}" value="${v}" style="width:100px;text-align:right;border:1px solid #d0d5dd;border-radius:6px;padding:4px"></td>` : `<td class="money">${qty(v)}</td>`;
      }).join('');
      const tot = ots.reduce((s, o) => s + (c.cost.bases[ind.id]?.[o.id] || 0), 0);
      return `<tr><td><b>${esc(ind.codigo)}</b> ${esc(ind.nombre)}<br><span class="muted">${esc(ind.unidad)} · ${esc(FUENTE[ind.fuente] || '')}</span></td>${cells}<td class="money"><b>${qty(tot)}</b></td></tr>`;
    }).join('');
    const distRows = c.cost.pools.map(p => {
      const r = { concepto: p.concepto.codigo + ' ' + p.concepto.nombre, inductor: p.inductor?.nombre || '-', tasa: p.tasa, monto: p.monto };
      ots.forEach((o, i) => (r['o' + o.id] = p.asignado[i]));
      return r;
    });
    const distFoot = { concepto: 'TOTAL CIF APLICADO', monto: E.sumBy(distRows, 'monto') };
    ots.forEach(o => (distFoot['o' + o.id] = E.sumBy(distRows, 'o' + o.id)));
    setContent(`<h2 class="section-title">Inductores y distribución de CIF</h2><p class="section-sub">Cada concepto CIF tiene <b>un inductor</b>. Tasa = CIF real del periodo ÷ base total del inductor; CIF de la O/T = tasa × base de la O/T. Los CIF se registran primero como gasto (clase 6), pasan al libro mayor de fábrica (93) y luego a la cuenta 23 de cada O/T.</p>
      ${tblCard('Tabla de inductores de CIF', indRows, [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Inductor' }, { k: 'unidad', l: 'Unidad' }, { k: 'fuenteL', l: 'Origen de la base' }, { k: 'conceptos', l: 'CIF que distribuye' }], { name: 'inductores', extra: '<button class="btn btn-secondary btn-sm" data-go-tab="inductores">Administrar</button>' })}
      ${tblCard('Conceptos CIF, inductor asignado y monto real del periodo', conRows, [{ k: 'codigo', l: 'Código' }, { k: 'concepto', l: 'Concepto CIF' }, { k: 'inductor', l: 'Inductor' }, { k: 'comportamiento', l: 'Comportamiento' }, { k: 'monto', l: 'CIF real S/', f: 'money' }, { k: 'baseTotal', l: 'Base total', f: 'qty' }, { k: 'unidad', l: 'Unidad' }, { k: 'tasa', l: 'Tasa S/ por unidad', f: 'cu' }, { k: 'fuentes', l: 'Origen (gasto por naturaleza)' }],
        { name: 'conceptos-cif', foot: [{ codigo: 'TOTAL', monto: E.sumBy(conRows, 'monto') }], extra: '<button class="btn btn-secondary btn-sm" data-go-tab="cif">Administrar</button>' })}
      ${card('Bases de los inductores por O/T', `<div class="table-wrap"><table><thead><tr><th>Inductor</th>${ots.map(o => `<th class="money">${esc(o.numero)}</th>`).join('')}<th class="money">Total</th></tr></thead><tbody>${matrix}</tbody></table></div><div class="actions"><button class="btn btn-primary" id="saveBases">Guardar bases manuales</button></div>`, { note: 'Ingresa aquí las bases de los inductores manuales (horas máquina, kWh, etc.). Las demás se calculan solas.' })}
      ${tblCard('Hoja de distribución de CIF por O/T', distRows, [{ k: 'concepto', l: 'Concepto CIF' }, { k: 'inductor', l: 'Inductor' }, { k: 'tasa', l: 'Tasa', f: 'cu' }, ...ots.map(o => ({ k: 'o' + o.id, l: o.numero, f: 'money' })), { k: 'monto', l: 'Total', f: 'money' }], { name: 'distribucion-cif', foot: [distFoot] })}`);
    $('#saveBases').onclick = () => {
      const vals = $$('[data-base]').map(i => { const [ind, ot] = i.dataset.base.split(':').map(Number); return { inductorId: ind, otId: ot, valor: Number(i.value) || 0 }; });
      if (commit(d => {
        vals.forEach(v => {
          const b = d.basesInductor.find(x => Number(x.otId) === v.otId && Number(x.inductorId) === v.inductorId);
          if (b) b.valor = v.valor; else d.basesInductor.push(v);
        });
      })) { toast('Bases guardadas y CIF redistribuidos'); rerender(); }
    };
    $$('[data-go-tab]').forEach(b => (b.onclick = () => navigate('tablas', { tab: b.dataset.goTab })));
  }

  function viewHojaCostos() {
    const c = ctx();
    const ots = DB.ordenes;
    if (!ots.length) return setContent('<div class="card empty">No hay órdenes de trabajo.</div>');
    const id = Number(PARAMS.ot) || ots[0].id;
    const R = c.cost.porOT[id];
    const o = R.ot, p = E.byId(DB.productos, o.productoId);
    let uv = 0, vv = 0;
    DB.ventas.forEach(v => v.items.forEach(it => { if (Number(it.productoId) === Number(o.productoId)) { uv += Number(it.cantidad); vv += it.cantidad * it.precioUnit; } }));
    const pv = uv ? vv / uv : 0;
    const md = tbl(R.mdDet, [{ k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'numero', l: 'Requisición' }, { k: 'material', l: 'Material' }, { k: 'cantidad', l: 'Cantidad', f: 'qty' }, { k: 'unidad', l: 'Unidad' }, { k: 'cu', l: 'Costo unit.', f: 'cu' }, { k: 'total', l: 'Total', f: 'money' }], { name: 'hc-md-' + o.numero, foot: [{ numero: 'Total MD', total: R.md }] });
    const mo = tbl(R.modDet, [{ k: 'trabajador', l: 'Trabajador' }, { k: 'cargo', l: 'Cargo' }, { k: 'horas', l: 'Horas', f: 'qty' }, { k: 'tarifa', l: 'Tarifa S/ h', f: 'cu' }, { k: 'total', l: 'Total', f: 'money' }], { name: 'hc-mod-' + o.numero, foot: [{ trabajador: 'Total MOD', horas: R.horas, total: R.mod }] });
    const ci = tbl(R.cifDet, [{ k: 'codigo', l: 'Código' }, { k: 'concepto', l: 'Concepto CIF' }, { k: 'inductor', l: 'Inductor' }, { k: 'base', l: 'Base O/T', f: 'qty' }, { k: 'unidad', l: 'Unidad' }, { k: 'tasa', l: 'Tasa', f: 'cu' }, { k: 'total', l: 'CIF aplicado', f: 'money' }], { name: 'hc-cif-' + o.numero, foot: [{ concepto: 'Total CIF', total: R.cif }] });
    const res = [
      { l: 'Materia prima directa (MD)', v: R.md }, { l: 'Mano de obra directa (MOD)', v: R.mod }, { l: 'Costos indirectos de fabricación (CIF)', v: R.cif },
      { l: 'COSTO TOTAL DE LA ORDEN', v: R.total, cls: 'total' }, { l: 'Unidades', v: Number(o.cantidad) }, { l: 'COSTO UNITARIO', v: E.r4(R.unit), cls: 'total' }
    ];
    if (pv) res.push({ l: 'Valor de venta unitario promedio', v: E.r2(pv) }, { l: 'Margen bruto unitario', v: E.r2(pv - R.unit), cls: 'sub' });
    const st = stmtTable(res, 'hoja-costos-resumen-' + o.numero);
    setContent(`<h2 class="section-title">Hoja de costos por orden de trabajo</h2><p class="section-sub">Acumula los tres elementos del costo de la O/T. Su total es el cargo a la cuenta ${E.otAccount(o)} (23 Productos en proceso).</p>
      <div class="toolbar no-print"><div class="field"><label>Orden de trabajo</label><select id="otSel">${options(ots.map(x => [x.id, x.numero + ' · ' + prodName(x.productoId)]), id)}</select></div></div>
      <div class="card"><div class="fs-head"><b>${esc(DB.empresa.razon)}</b><b style="margin-top:4px">HOJA DE COSTOS N° ${esc(o.numero)}</b></div>
        <div class="summary-bar"><div class="summary-item"><span>Producto</span><b>${esc(p?.nombre || '-')}</b></div><div class="summary-item"><span>Cantidad</span><b>${qty(o.cantidad)} ${esc(p?.unidad || '')}</b></div><div class="summary-item"><span>Cliente</span><b>${esc(o.cliente || '-')}</b></div><div class="summary-item"><span>Inicio</span><b>${dateFmt(o.fechaInicio)}</b></div><div class="summary-item"><span>Término</span><b>${dateFmt(o.fechaFin)}</b></div><div class="summary-item"><span>Estado</span><b>${esc(o.estado)}</b></div></div>
        <h4>1. Materia prima directa</h4>${md.html}<h4>2. Mano de obra directa</h4>${mo.html}<h4>3. Costos indirectos de fabricación (aplicados con inductores)</h4>${ci.html}<h4>Resumen</h4>${st.html}</div>`);
    $('#otSel').onchange = e => navigate('hojaCostos', { ot: e.target.value });
  }

  function kardexTable(item) {
    const rows = item.rows;
    const cols = [{ k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'tipoOp', l: 'Tipo operación', f: v => esc(v + ' ' + (TIPO_OP[v] || '')) }, { k: 'doc', l: 'Documento' }, { k: 'detalle', l: 'Detalle' },
      { k: 'eCant', l: 'Entrada cant.', f: 'qty' }, { k: 'eCU', l: 'Entrada C.U.', f: 'cu' }, { k: 'eTot', l: 'Entrada total', f: 'money' },
      { k: 'oCant', l: 'Salida cant.', f: 'qty' }, { k: 'oCU', l: 'Salida C.U.', f: 'cu' }, { k: 'oTot', l: 'Salida total', f: 'money' },
      { k: 'sCant', l: 'Saldo cant.', f: 'qty' }, { k: 'sCU', l: 'Saldo C.U.', f: 'cu' }, { k: 'sTot', l: 'Saldo total', f: 'money' }];
    const id = registerExport(rows, cols, 'kardex-' + item.codigo);
    const td = (v, f) => `<td class="money">${v == null ? '' : fmt(v, f)}</td>`;
    const body = rows.map(r => `<tr><td class="nowrap">${dateFmt(r.fecha)}</td><td>${esc(r.tipoOp + ' ' + (TIPO_OP[r.tipoOp] || ''))}</td><td class="nowrap">${esc(r.doc)}</td><td>${esc(r.detalle)}</td>${td(r.eCant, 'qty')}${td(r.eCU, 'cu')}${td(r.eTot, 'money')}${td(r.oCant, 'qty')}${td(r.oCU, 'cu')}${td(r.oTot, 'money')}${td(r.sCant, 'qty')}${td(r.sCU, 'cu')}${td(r.sTot, 'money')}</tr>`).join('') || '<tr><td colspan="13" class="empty">Sin movimientos</td></tr>';
    const sum = k => E.sumBy(rows.filter(r => r[k] != null), k);
    const foot = `<tr class="total"><td colspan="4">TOTALES</td><td class="money">${qty(sum('eCant'))}</td><td></td><td class="money">${n2(sum('eTot'))}</td><td class="money">${qty(sum('oCant'))}</td><td></td><td class="money">${n2(sum('oTot'))}</td><td class="money">${qty(item.saldoCant)}</td><td></td><td class="money">${n2(item.saldoTotal)}</td></tr>`;
    return { id, html: `<div class="table-wrap"><table><thead><tr><th colspan="4"></th><th colspan="3" class="money">Entradas</th><th colspan="3" class="money">Salidas</th><th colspan="3" class="money">Saldo final</th></tr><tr><th>Fecha</th><th>Tipo de operación</th><th>Documento</th><th>Detalle</th><th class="money">Cant.</th><th class="money">C.U.</th><th class="money">Total</th><th class="money">Cant.</th><th class="money">C.U.</th><th class="money">Total</th><th class="money">Cant.</th><th class="money">C.U.</th><th class="money">Total</th></tr></thead><tbody>${body}${foot}</tbody></table></div>` };
  }

  function viewKardex() {
    const c = ctx();
    const all = [...Object.values(c.kMat.items), ...Object.values(c.kPT.items)];
    if (!all.length) return setContent('<div class="card empty">No hay materiales ni productos.</div>');
    const key = PARAMS.item && all.find(i => i.key === PARAMS.item) ? PARAMS.item : all[0].key;
    const item = all.find(i => i.key === key);
    const kt = kardexTable(item);
    const acc = c.L[item.cuenta];
    const s = acc ? acc.saldo : 0;
    const resumen = all.map(i => ({ codigo: i.codigo, nombre: i.nombre, clase: i.clase, unidad: i.unidad, cuenta: i.cuenta, cant: i.saldoCant, valor: i.saldoTotal, contable: c.L[i.cuenta]?.saldo || 0 }));
    setContent(`<h2 class="section-title">Kardex valorizado</h2><p class="section-sub">Un kardex por cada materia prima, material indirecto y producto terminado, con su propia cuenta T. Método: <b>${DB.empresa.metodo === 'PEPS' ? 'PEPS' : 'promedio ponderado móvil'}</b> (se cambia en Empresa y parámetros).</p>
      <div class="toolbar no-print"><div class="field" style="min-width:320px"><label>Existencia</label><select id="kSel">${options(all.map(i => [i.key, `${i.clase} · ${i.codigo} ${i.nombre}`]), key)}</select></div></div>
      <div class="card"><div class="card-head"><h3>Kardex: ${esc(item.codigo)} ${esc(item.nombre)}</h3><div class="actions" style="margin:0"><button class="btn btn-secondary btn-sm no-print" data-export="${kt.id}">Exportar CSV</button></div></div>
        <div class="summary-bar"><div class="summary-item"><span>Tipo</span><b>${{ MP: 'Materia prima', MI: 'Material indirecto', PT: 'Producto terminado' }[item.clase]}</b></div><div class="summary-item"><span>Unidad</span><b>${esc(item.unidad)}</b></div><div class="summary-item"><span>Cuenta contable</span><b>${esc(item.cuenta)}</b></div><div class="summary-item"><span>Stock final</span><b>${qty(item.saldoCant)}</b></div><div class="summary-item"><span>Valor final</span><b>${money(item.saldoTotal)}</b></div><div class="summary-item"><span>Conciliación con cuenta</span><b>${checkPill(item.saldoTotal, s)}</b></div></div>
        ${kt.html}</div>
      <div class="split"><div>${card('Cuenta T del material/producto', `<div class="t-grid" style="grid-template-columns:1fr">${tAccount(item.cuenta, acc)}</div>`)}</div>
      <div>${tblCard('Resumen de existencias', resumen, [{ k: 'clase', l: 'Tipo' }, { k: 'nombre', l: 'Existencia' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'cant', l: 'Stock', f: 'qty' }, { k: 'valor', l: 'Kardex S/', f: 'money' }, { k: 'contable', l: 'Cuenta S/', f: 'money' }], { name: 'resumen-existencias' })}</div></div>`);
    $('#kSel').onchange = e => navigate('kardex', { item: e.target.value });
  }

  function viewFabrica() {
    const c = ctx();
    const L = c.Lpre;
    const fab = ['911', '921', '931'].map(code => tAccount(code, L[code])).join('');
    const ots = DB.ordenes.map(o => tAccount(E.otAccount(o), L[E.otAccount(o)], 'Productos en proceso ' + o.numero)).join('');
    const pools = c.cost.pools.map(p => ({ concepto: p.concepto.codigo + ' ' + p.concepto.nombre, inductor: p.inductor?.nombre || '-', fuentes: p.fuentes.map(f => f.cuenta).filter((v, i, a) => a.indexOf(v) === i).join(', '), real: p.monto, aplicado: E.sumBy(p.asignado.map(v => ({ v })), 'v') }));
    const tr = Object.values(c.cost.porOT).map(R => ({ ot: R.ot.numero, cuenta: E.otAccount(R.ot), md: R.md, mod: R.mod, cif: R.cif, total: R.total, estado: R.ot.estado, destino: R.ot.estado === 'TERMINADA' ? 'Transferida a 21 (' + E.ptAccount({ id: R.ot.productoId }) + ')' : 'Permanece en 23' }));
    setContent(`<h2 class="section-title">Libro mayor de fábrica</h2><p class="section-sub">Cuentas analíticas de producción: <b>91 Materia prima directa</b>, <b>92 Mano de obra directa</b> y <b>93 CIF</b>. Se debitan con el destino de los gastos (contra 79) y se acreditan al trasladar el costo a la <b>cuenta 23 de cada O/T</b>. Los números entre paréntesis son el N° de asiento del Libro diario.</p>
      ${card('Cuentas de costos de producción (91, 92, 93)', `<div class="t-grid">${fab}</div>`)}
      ${tblCard('Detalle de la cuenta 93 por concepto CIF', pools, [{ k: 'concepto', l: 'Concepto CIF' }, { k: 'fuentes', l: 'Cuenta(s) de gasto de origen' }, { k: 'inductor', l: 'Inductor' }, { k: 'real', l: 'CIF real (Debe 93)', f: 'money' }, { k: 'aplicado', l: 'CIF aplicado a O/T (Haber 93)', f: 'money' }], { name: 'mayor-fabrica-93', foot: [{ concepto: 'TOTAL', real: E.sumBy(pools, 'real'), aplicado: E.sumBy(pools, 'aplicado') }] })}
      ${tblCard('Traslado del costo a la cuenta 23 por O/T', tr, [{ k: 'ot', l: 'O/T' }, { k: 'cuenta', l: 'Subcuenta 23' }, { k: 'md', l: 'MD (91)', f: 'money' }, { k: 'mod', l: 'MOD (92)', f: 'money' }, { k: 'cif', l: 'CIF (93)', f: 'money' }, { k: 'total', l: 'Total cargado a 23', f: 'money' }, { k: 'destino', l: 'Situación' }], { name: 'traslado-23', foot: [{ ot: 'TOTAL', md: E.sumBy(tr, 'md'), mod: E.sumBy(tr, 'mod'), cif: E.sumBy(tr, 'cif'), total: E.sumBy(tr, 'total') }] })}
      ${card('Cuentas 23 Productos en proceso (una por O/T)', `<div class="t-grid">${ots}</div>`)}`);
  }

  function viewEstadoCostos() {
    const c = ctx(), x = E.estadoCostos(c);
    const lines = [
      { l: 'Inventario inicial de materias primas', v: x.iiMP, indent: 1 }, { l: '(+) Compras de materias primas', v: x.comprasMP, indent: 1 },
      { l: '(-) Inventario final de materias primas', v: -x.ifMP, indent: 1 }, { l: 'Materia prima consumida', v: x.consumoMP, cls: 'sub' },
      ...(Math.abs(x.mpSinOT) > 0.005 ? [{ l: '(-) Materia prima no asignada a O/T', v: -x.mpSinOT, indent: 1 }] : []),
      { l: 'Materia prima directa (MD)', v: x.md, cls: 'sub' }, { l: 'Mano de obra directa (MOD)', v: x.mod, cls: 'sub' },
      ...x.cifDet.map(d => ({ l: d.concepto, v: d.monto, indent: 1 })), { l: 'Costos indirectos de fabricación (CIF)', v: x.cif, cls: 'sub' },
      { l: 'COSTO DE PRODUCCIÓN DEL PERIODO', v: x.costoProd, cls: 'total' },
      { l: '(+) Inventario inicial de productos en proceso', v: x.iiPP, indent: 1 }, { l: '(-) Inventario final de productos en proceso', v: -x.ifPP, indent: 1 },
      { l: 'COSTO DE PRODUCCIÓN TERMINADA', v: x.cpt, cls: 'total' },
      { l: '(+) Inventario inicial de productos terminados', v: x.iiPT, indent: 1 }, { l: '(-) Inventario final de productos terminados', v: -x.ifPT, indent: 1 },
      { l: 'COSTO DE VENTAS', v: x.costoVentas, cls: 'total' }
    ];
    const st = stmtTable(lines, 'estado-costo-produccion');
    setContent(`<h2 class="section-title">Estado de costo de producción y de ventas</h2><p class="section-sub">Integra la materia prima, la mano de obra directa y los CIF aplicados con los inventarios de productos en proceso y terminados.</p>
      ${card('Estado de costo de producción y ventas', `<div class="fs">${fsHead('ESTADO DE COSTO DE PRODUCCIÓN Y DE VENTAS')}${st.html}<div class="actions">Conciliación con la cuenta 69 (S/ ${n2(x.costoVentasContable)}): ${checkPill(x.costoVentas, x.costoVentasContable)}</div></div>`, { exportId: st.id })}`);
  }

  function viewCVU() {
    const c = ctx(), x = E.cvu(c);
    const items = tbl(x.items, [{ k: 'concepto', l: 'Concepto' }, { k: 'area', l: 'Área' }, { k: 'tipo', l: 'Comportamiento', f: v => pill(v, v === 'FIJO' ? 'info' : 'warn') }, { k: 'monto', l: 'Importe', f: 'money' }], { name: 'costos-fijos-variables', foot: [{ concepto: 'Costos variables', monto: x.cv }, { concepto: 'Costos fijos', monto: x.cf }, { concepto: 'TOTAL', monto: E.r2(x.cv + x.cf) }] });
    const pe = tbl(x.productos, [{ k: 'producto', l: 'Producto' }, { k: 'unidadesVend', l: 'Unid. vendidas', f: 'qty' }, { k: 'mix', l: 'Mezcla', f: 'pct' }, { k: 'precio', l: 'Precio unit.', f: 'cu' }, { k: 'cvu', l: 'Costo variable unit.', f: 'cu' }, { k: 'mcu', l: 'Margen contrib. unit.', f: 'cu' }, { k: 'peUnid', l: 'P.E. unidades', f: 'qty' }, { k: 'peSoles', l: 'P.E. S/', f: 'money' }], { name: 'punto-equilibrio' });
    const comp = stmtTable([
      { l: 'Ventas', v: x.ventasTot }, { l: '(-) Costo variable de lo vendido', v: -x.cvVendido }, { l: 'Margen de contribución', v: x.mc, cls: 'sub' },
      { l: '(-) Costos fijos del periodo (CIF fijos + gastos de adm. y ventas)', v: -x.cf }, { l: 'Utilidad operativa - costeo variable', v: x.utilVariable, cls: 'total' },
      { l: 'Utilidad operativa - costeo absorbente (EEFF)', v: x.utilAbsorbente, cls: 'total' }, { l: 'Diferencia (CIF fijos en inventarios finales)', v: x.diferencia }
    ], 'costeo-variable-vs-absorbente');
    setContent(`<h2 class="section-title">Costos fijos y variables · Punto de equilibrio</h2><p class="section-sub">La clasificación de los CIF se define en cada concepto CIF (Tablas maestras). MD y MOD se consideran variables; los gastos de administración y ventas, fijos. Análisis referencial con mezcla de ventas del periodo.</p>
      <div class="kpis">${kpi('Costos fijos', money(x.cf), 'Periodo')}${kpi('Costos variables', money(x.cv), 'Periodo')}${kpi('Punto de equilibrio', x.peSoles == null ? '-' : money(x.peSoles), x.peUnidades == null ? 'Sin margen positivo' : qty(x.peUnidades) + ' unidades (mezcla)')}${kpi('Margen de seguridad', pct(x.margenSeguridad), '(Ventas - P.E.) / Ventas')}</div>
      ${card('Clasificación de costos', items.html, { exportId: items.id })}
      ${card('Margen de contribución y punto de equilibrio por producto', pe.html, { exportId: pe.id, note: `Margen de contribución unitario ponderado: <b>${money(x.mcuPond)}</b>. P.E. (unidades) = Costos fijos ÷ MCu ponderado.` })}
      ${card('Costeo variable vs costeo absorbente', comp.html, { exportId: comp.id })}`);
  }

  // ------------------------------------------------------------ Libros contables
  function viewDiario() {
    const c = ctx();
    const q = (PARAMS.q || '').toLowerCase();
    const orig = PARAMS.origen || '';
    const list = c.entries.filter(e => (!orig || e.origen.kind === orig) && (!q || (e.glosa + ' ' + e.origen.label + ' ' + e.lines.map(l => l.cuenta + ' ' + l.aux).join(' ')).toLowerCase().includes(q)));
    const flat = [];
    list.forEach(e => e.lines.forEach(l => flat.push({ num: e.num, fecha: e.fecha, glosa: e.glosa, origen: e.origen.label, cuenta: l.cuenta, nombre: c.accName(l.cuenta), aux: l.aux, debe: l.debe, haber: l.haber })));
    const id = registerExport(flat, [{ k: 'num', l: 'N° asiento' }, { k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'glosa', l: 'Glosa' }, { k: 'origen', l: 'Origen' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'nombre', l: 'Denominación' }, { k: 'aux', l: 'Auxiliar' }, { k: 'debe', l: 'Debe', f: 'money' }, { k: 'haber', l: 'Haber', f: 'money' }], 'libro-diario');
    const body = list.map(e => `<tr class="group"><td>${E.pad(e.num, 4)}</td><td class="nowrap">${dateFmt(e.fecha)}</td><td colspan="2">${esc(e.glosa)}</td><td>${pill(e.origen.label, e.tipo === 'Cierre' ? 'bad' : e.tipo === 'Ajuste' ? 'warn' : 'info')}</td><td></td><td></td></tr>` +
      e.lines.map(l => `<tr><td></td><td></td><td class="nowrap" style="padding-left:${l.haber ? 34 : 12}px">${esc(l.cuenta)}</td><td>${esc(c.accName(l.cuenta))}</td><td class="muted">${esc(l.aux)}</td><td class="money">${l.debe ? n2(l.debe) : ''}</td><td class="money">${l.haber ? n2(l.haber) : ''}</td></tr>`).join('')).join('');
    const td = E.sumBy(list, 'debe'), th = E.sumBy(list, 'haber');
    setContent(`<h2 class="section-title">Libro diario</h2><p class="section-sub">Formato 5.1 simplificado. Todos los asientos se generan desde los documentos; los de cierre aparecen al ejecutar el cierre del ejercicio.</p>
      <div class="toolbar no-print"><div class="field" style="min-width:260px"><label>Buscar (glosa, cuenta, documento, tercero)</label><input id="dq" value="${esc(PARAMS.q || '')}"></div>
        <div class="field"><label>Origen</label><select id="dor">${options(Object.entries(E.ORIGENES), orig, 'Todos')}</select></div><button class="btn btn-secondary" id="dgo">Filtrar</button><button class="btn btn-secondary" id="dclr">Limpiar</button></div>
      <div class="card"><div class="card-head"><h3>${list.length} asientos · Debe ${money(td)} · Haber ${money(th)} ${checkPill(td, th)}</h3><div class="actions" style="margin:0"><button class="btn btn-secondary btn-sm no-print" data-export="${id}">Exportar CSV</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>N°</th><th>Fecha</th><th>Cuenta</th><th>Denominación / glosa</th><th>Auxiliar / origen</th><th class="money">Debe</th><th class="money">Haber</th></tr></thead><tbody>${body || '<tr><td colspan="7" class="empty">Sin asientos</td></tr>'}<tr class="total"><td colspan="5">TOTALES</td><td class="money">${n2(td)}</td><td class="money">${n2(th)}</td></tr></tbody></table></div></div>`);
    const go = () => navigate('diario', { q: $('#dq').value, origen: $('#dor').value });
    $('#dgo').onclick = go;
    $('#dq').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#dor').onchange = go;
    $('#dclr').onclick = () => navigate('diario', {});
  }

  function viewMayor() {
    const c = ctx();
    const accs = Object.values(c.L).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const code = PARAMS.cuenta && c.L[PARAMS.cuenta] ? PARAMS.cuenta : (accs[0] || {}).codigo;
    const acc = c.L[code];
    let saldo = 0;
    const movs = acc ? acc.movs.map(m => { saldo = E.r2(saldo + m.debe - m.haber); return { ...m, origenL: m.origen.label, saldoD: saldo > 0 ? saldo : 0, saldoA: saldo < 0 ? -saldo : 0 }; }) : [];
    const t = tbl(movs, [{ k: 'num', l: 'N° asiento' }, { k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'glosa', l: 'Glosa' }, { k: 'aux', l: 'Auxiliar' }, { k: 'debe', l: 'Debe', f: 'money0' }, { k: 'haber', l: 'Haber', f: 'money0' }, { k: 'saldoD', l: 'Saldo deudor', f: 'money0' }, { k: 'saldoA', l: 'Saldo acreedor', f: 'money0' }],
      { name: 'mayor-' + code, foot: acc ? [{ glosa: 'TOTALES', debe: acc.debe, haber: acc.haber, saldoD: acc.saldo > 0 ? acc.saldo : 0, saldoA: acc.saldo < 0 ? -acc.saldo : 0 }] : [] });
    const sumRows = accs.map(a => ({ id: a.codigo, codigo: a.codigo, nombre: c.accName(a.codigo), tipo: E.accType(a.codigo), debe: a.debe, haber: a.haber, saldo: a.saldo }));
    const s = tbl(sumRows, [{ k: 'codigo', l: 'Cuenta' }, { k: 'nombre', l: 'Denominación' }, { k: 'tipo', l: 'Tipo' }, { k: 'debe', l: 'Debe', f: 'money' }, { k: 'haber', l: 'Haber', f: 'money' }, { k: 'saldo', l: 'Saldo (D-H)', f: 'money' }], { name: 'mayor-resumen', actions: r => `<button class="btn btn-secondary btn-sm" data-acc="${r.codigo}">Ver</button>` });
    setContent(`<h2 class="section-title">Libro mayor</h2><p class="section-sub">Formato 6.1 simplificado: movimientos de cada cuenta con su saldo acumulado.</p>
      <div class="toolbar no-print"><div class="field" style="min-width:360px"><label>Cuenta</label><select id="mSel">${options(accs.map(a => [a.codigo, a.codigo + ' - ' + c.accName(a.codigo)]), code)}</select></div></div>
      ${card('Cuenta ' + esc(code) + ' - ' + esc(c.accName(code)), t.html, { exportId: t.id })}
      <div class="split">${card('Cuenta T', `<div class="t-grid" style="grid-template-columns:1fr">${tAccount(code, acc)}</div>`)}${card('Resumen de todas las cuentas', s.html, { exportId: s.id })}</div>`);
    $('#mSel').onchange = e => navigate('mayor', { cuenta: e.target.value });
    $$('[data-acc]').forEach(b => (b.onclick = () => navigate('mayor', { cuenta: b.dataset.acc })));
  }

  function viewCuentasT() {
    const c = ctx();
    const cls = PARAMS.clase || '';
    const accs = Object.values(c.L).filter(a => !cls || a.codigo.startsWith(cls)).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const clases = [['', 'Todas'], ['1', '1 Activo disponible y exigible'], ['2', '2 Activo realizable (existencias)'], ['3', '3 Activo inmovilizado'], ['4', '4 Pasivo'], ['5', '5 Patrimonio'], ['6', '6 Gastos por naturaleza'], ['7', '7 Ingresos'], ['8', '8 Saldos intermedios'], ['9', '9 Contabilidad analítica']];
    setContent(`<h2 class="section-title">Cuentas T (mayorización)</h2><p class="section-sub">Cada cargo y abono indica entre paréntesis el N° de asiento del Libro diario. Pasa el cursor sobre un importe para ver la glosa.</p>
      <div class="toolbar no-print"><div class="field" style="min-width:280px"><label>Clase de cuentas</label><select id="tcl">${options(clases, cls)}</select></div></div>
      <div class="t-grid">${accs.map(a => tAccount(a.codigo, a)).join('') || '<div class="empty">Sin cuentas</div>'}</div>`);
    $('#tcl').onchange = e => navigate('cuentasT', { clase: e.target.value });
  }

  function viewCaja() {
    const c = ctx();
    let saldo = 0;
    const rows = [];
    c.entries.forEach(e => e.lines.filter(l => l.cuenta.startsWith('10')).forEach(l => {
      saldo = E.r2(saldo + l.debe - l.haber);
      rows.push({ num: e.num, fecha: e.fecha, glosa: e.glosa, actividad: e.origen.kind === 'apertura' ? 'Saldo inicial' : (e.actividad || 'Operación'), cuenta: l.cuenta, ingreso: l.debe, egreso: l.haber, saldo });
    }));
    const t = tbl(rows, [{ k: 'num', l: 'N° asiento' }, { k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'glosa', l: 'Descripción de la operación' }, { k: 'actividad', l: 'Actividad' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'ingreso', l: 'Ingresos (Debe)', f: 'money0' }, { k: 'egreso', l: 'Egresos (Haber)', f: 'money0' }, { k: 'saldo', l: 'Saldo', f: 'money' }],
      { name: 'libro-caja-bancos', foot: [{ glosa: 'TOTALES', ingreso: E.sumBy(rows, 'ingreso'), egreso: E.sumBy(rows, 'egreso'), saldo }] });
    setContent(`<h2 class="section-title">Libro caja y bancos</h2><p class="section-sub">Formato 1.2 simplificado: detalle de los movimientos de la cuenta 10.</p>
      <div class="kpis">${kpi('Ingresos', money(E.sumBy(rows, 'ingreso')), 'Incluye apertura')}${kpi('Egresos', money(E.sumBy(rows, 'egreso')), 'Pagos del periodo')}${kpi('Saldo final', money(saldo), 'Cuenta 10')}${kpi('Movimientos', rows.length, 'Líneas en la cuenta 10')}</div>
      ${card('Movimientos de efectivo', t.html, { exportId: t.id })}`);
  }

  function viewRegCompras() {
    const rows = DB.compras.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x, i) => {
      const t = E.compraTotals(x, DB.empresa.igvPct);
      const [serie, numero] = String(x.documento).split('-');
      return { cuo: i + 1, fecha: x.fecha, tipo: x.tipoDoc, serie, numero: numero || '', tdocId: '6', ruc: x.ruc, proveedor: x.proveedor, base: x.tipoDoc === '02' ? 0 : t.subtotal, noGravado: x.tipoDoc === '02' ? t.subtotal : 0, igv: t.igv, total: t.total };
    });
    const tot = { proveedor: 'TOTALES', base: E.sumBy(rows, 'base'), noGravado: E.sumBy(rows, 'noGravado'), igv: E.sumBy(rows, 'igv'), total: E.sumBy(rows, 'total') };
    setContent(`<h2 class="section-title">Registro de compras</h2><p class="section-sub">Formato 8.1 simplificado. Base imponible de adquisiciones gravadas destinadas a operaciones gravadas.</p>
      ${tblCard('Registro de compras · ' + esc(DB.empresa.periodo), rows, [{ k: 'cuo', l: 'N° corr.' }, { k: 'fecha', l: 'Fecha emisión', f: 'date' }, { k: 'tipo', l: 'Tipo comp.' }, { k: 'serie', l: 'Serie' }, { k: 'numero', l: 'Número' }, { k: 'tdocId', l: 'Tipo doc. id.' }, { k: 'ruc', l: 'RUC' }, { k: 'proveedor', l: 'Razón social' }, { k: 'base', l: 'Base imponible', f: 'money' }, { k: 'noGravado', l: 'No gravado', f: 'money' }, { k: 'igv', l: 'IGV', f: 'money' }, { k: 'total', l: 'Importe total', f: 'money' }], { name: 'registro-compras', foot: [tot] })}`);
  }

  function viewRegVentas() {
    const rows = DB.ventas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x, i) => {
      const t = E.ventaTotals(x, DB.empresa.igvPct);
      const [serie, numero] = String(x.documento).split('-');
      return { cuo: i + 1, fecha: x.fecha, tipo: x.tipoDoc, serie, numero: numero || '', tdocId: x.ruc && x.ruc.length === 11 ? '6' : (x.ruc ? '1' : '-'), ruc: x.ruc, cliente: x.cliente, base: t.subtotal, igv: t.igv, total: t.total };
    });
    const tot = { cliente: 'TOTALES', base: E.sumBy(rows, 'base'), igv: E.sumBy(rows, 'igv'), total: E.sumBy(rows, 'total') };
    setContent(`<h2 class="section-title">Registro de ventas e ingresos</h2><p class="section-sub">Formato 14.1 simplificado.</p>
      ${tblCard('Registro de ventas · ' + esc(DB.empresa.periodo), rows, [{ k: 'cuo', l: 'N° corr.' }, { k: 'fecha', l: 'Fecha emisión', f: 'date' }, { k: 'tipo', l: 'Tipo comp.' }, { k: 'serie', l: 'Serie' }, { k: 'numero', l: 'Número' }, { k: 'tdocId', l: 'Tipo doc. id.' }, { k: 'ruc', l: 'N° documento' }, { k: 'cliente', l: 'Cliente' }, { k: 'base', l: 'Valor facturado (base)', f: 'money' }, { k: 'igv', l: 'IGV', f: 'money' }, { k: 'total', l: 'Importe total', f: 'money' }], { name: 'registro-ventas', foot: [tot] })}`);
  }

  function situacionHtml(es, detalle) {
    const rows = [];
    const sec = (title, list, total) => {
      rows.push({ l: title, cls: 'group' });
      list.forEach(r => {
        rows.push({ l: r.rubro, v: r.valor, indent: 1 });
        if (detalle) r.cuentas.forEach(cu => rows.push({ l: `    ${cu.codigo} ${cu.nombre}`, v: cu.valor, indent: 1, cls: 'muted' }));
      });
      rows.push({ l: 'Total ' + title.toLowerCase(), v: total, cls: 'sub' });
    };
    const left = [], right = [];
    rows.length = 0; sec('ACTIVO CORRIENTE', es.AC, es.tAC); sec('ACTIVO NO CORRIENTE', es.ANC, es.tANC); rows.push({ l: 'TOTAL ACTIVO', v: es.tActivo, cls: 'total' }); left.push(...rows);
    rows.length = 0; sec('PASIVO CORRIENTE', es.PC, es.tPC); sec('PASIVO NO CORRIENTE', es.PNC, es.tPNC); rows.push({ l: 'TOTAL PASIVO', v: es.tPasivo, cls: 'sub' }); sec('PATRIMONIO', es.PAT, es.tPAT); rows.push({ l: 'TOTAL PASIVO Y PATRIMONIO', v: es.tPasPat, cls: 'total' }); right.push(...rows);
    const a = stmtTable(left, 'situacion-activo'), b = stmtTable(right, 'situacion-pasivo');
    EXPORTS[a.id].rows = EXPORTS[a.id].rows.concat(EXPORTS[b.id].rows);
    return { id: a.id, html: `<div class="split">${a.html}${b.html}</div>` };
  }

  function viewInventarios() {
    const c = ctx(), es = E.estadoSituacion(c);
    const s = situacionHtml(es, false);
    const L = c.Lpre;
    const caja = Object.values(L).filter(a => a.codigo.startsWith('10')).map(a => ({ codigo: a.codigo, nombre: c.accName(a.codigo), saldo: a.saldo }));
    const cxc = E.saldosPorTercero(c, '12');
    const cxp = E.saldosPorTercero(c, '42').map(x => ({ ...x, saldo: -x.saldo }));
    const inv = [...Object.values(c.kMat.items), ...Object.values(c.kPT.items)].map(i => ({ cuenta: i.cuenta, codigo: i.codigo, nombre: i.nombre, unidad: i.unidad, cant: i.saldoCant, cu: i.saldoCant ? i.saldoTotal / i.saldoCant : 0, total: i.saldoTotal }));
    Object.values(c.cost.porOT).filter(R => R.ot.estado !== 'TERMINADA' && R.total > 0).forEach(R => inv.push({ cuenta: E.otAccount(R.ot), codigo: R.ot.numero, nombre: 'Productos en proceso - ' + prodName(R.ot.productoId), unidad: 'und', cant: R.ot.cantidad, cu: R.unit, total: R.total }));
    const af = c.dep.map(a => ({ codigo: a.codigo, nombre: a.nombre, cuenta: a.cuenta, costo: a.costo, tasa: a.tasa / 100, dep: a.mensual, neto: E.r2(a.costo - a.mensual) }));
    const trib = Object.values(L).filter(a => a.codigo.startsWith('40') || a.codigo.startsWith('41')).map(a => ({ codigo: a.codigo, nombre: c.accName(a.codigo), saldo: -a.saldo }));
    setContent(`<h2 class="section-title">Libro de inventarios y balances</h2><p class="section-sub">Estado de situación al cierre y detalle de los saldos de las principales cuentas (formatos 3.1 a 3.12 simplificados).</p>
      ${card('3.1 Estado de situación financiera', fsHead('ESTADO DE SITUACIÓN FINANCIERA', 'al') + s.html, { exportId: s.id })}
      <div class="split">${tblCard('3.2 Detalle de la cuenta 10 - Efectivo', caja, [{ k: 'codigo', l: 'Cuenta' }, { k: 'nombre', l: 'Denominación' }, { k: 'saldo', l: 'Saldo', f: 'money' }], { name: 'lib-10', foot: [{ nombre: 'TOTAL', saldo: E.sumBy(caja, 'saldo') }] })}
      ${tblCard('3.3 Detalle de la cuenta 12 - Clientes', cxc, [{ k: 'tercero', l: 'Cliente' }, { k: 'saldo', l: 'Saldo por cobrar', f: 'money' }], { name: 'lib-12', foot: [{ tercero: 'TOTAL', saldo: E.sumBy(cxc, 'saldo') }], empty: 'Sin saldos' })}</div>
      ${tblCard('3.7 Inventario permanente valorizado (existencias)', inv, [{ k: 'cuenta', l: 'Cuenta' }, { k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Descripción' }, { k: 'unidad', l: 'Unidad' }, { k: 'cant', l: 'Cantidad', f: 'qty' }, { k: 'cu', l: 'Costo unit.', f: 'cu' }, { k: 'total', l: 'Costo total', f: 'money' }], { name: 'lib-inventario', foot: [{ nombre: 'TOTAL EXISTENCIAS', total: E.sumBy(inv, 'total') }] })}
      ${tblCard('3.9 Activos fijos y depreciación del periodo', af, [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Activo' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'costo', l: 'Costo', f: 'money' }, { k: 'tasa', l: 'Tasa anual', f: 'pct' }, { k: 'dep', l: 'Depreciación del mes', f: 'money' }, { k: 'neto', l: 'Valor neto', f: 'money' }], { name: 'lib-activos', foot: [{ nombre: 'TOTAL', costo: E.sumBy(af, 'costo'), dep: E.sumBy(af, 'dep'), neto: E.sumBy(af, 'neto') }] })}
      <div class="split">${tblCard('3.11 Tributos y remuneraciones por pagar (40, 41)', trib, [{ k: 'codigo', l: 'Cuenta' }, { k: 'nombre', l: 'Denominación' }, { k: 'saldo', l: 'Saldo (+ por pagar)', f: 'money' }], { name: 'lib-40-41' })}
      ${tblCard('3.12 Detalle de la cuenta 42 - Proveedores', cxp, [{ k: 'tercero', l: 'Proveedor' }, { k: 'saldo', l: 'Saldo por pagar', f: 'money' }], { name: 'lib-42', foot: [{ tercero: 'TOTAL', saldo: E.sumBy(cxp, 'saldo') }], empty: 'Sin saldos' })}</div>`);
  }

  function viewComprobacion() {
    const c = ctx();
    const nivel = PARAMS.nivel || 'sub';
    let bc;
    if (nivel === 'elem') {
      const L2 = {};
      Object.values(c.Lpre).forEach(a => {
        const k = a.codigo.slice(0, 2);
        const x = L2[k] || (L2[k] = { codigo: k, debe: 0, haber: 0 });
        x.debe = E.r2(x.debe + a.debe); x.haber = E.r2(x.haber + a.haber);
      });
      Object.values(L2).forEach(a => (a.saldo = E.r2(a.debe - a.haber)));
      bc = E.balanceComprobacion({ Lpre: L2, accName: k => E.ELEMENTOS[k] || 'Cuenta ' + k });
    } else bc = E.balanceComprobacion(c);
    const keys = ['debe', 'haber', 'deudor', 'acreedor', 'activo', 'pasivo', 'perdidaN', 'gananciaN', 'perdidaF', 'gananciaF'];
    const cols = [{ k: 'codigo', l: 'Cuenta' }, { k: 'nombre', l: 'Denominación' }, ...keys.map(k => ({ k, l: k, f: 'money0' }))];
    const id = registerExport(bc.rows.concat([{ codigo: 'TOTALES', ...bc.tot }]), cols, 'balance-comprobacion');
    const td = v => `<td class="money">${v ? n2(v) : ''}</td>`;
    const body = bc.rows.map(r => `<tr><td>${esc(r.codigo)}</td><td>${esc(r.nombre)}</td>${keys.map(k => td(r[k])).join('')}</tr>`).join('');
    const t = bc.tot;
    const resRow = [null, null, null, null, bc.resInventario > 0 ? 0 : -bc.resInventario, bc.resInventario > 0 ? bc.resInventario : 0, bc.resNaturaleza > 0 ? bc.resNaturaleza : 0, bc.resNaturaleza < 0 ? -bc.resNaturaleza : 0, bc.resFuncion > 0 ? bc.resFuncion : 0, bc.resFuncion < 0 ? -bc.resFuncion : 0];
    const sumas = keys.map((k, i) => E.r2(t[k] + (resRow[i] || 0)));
    setContent(`<h2 class="section-title">Balance de comprobación (hoja de trabajo)</h2><p class="section-sub">Sumas, saldos, inventario (situación financiera) y resultados por naturaleza y por función. El resultado de las tres últimas secciones debe coincidir. Las cuentas analíticas 9 se presentan en la función y la 79 se cancela con ellas.</p>
      <div class="toolbar no-print"><div class="field"><label>Nivel</label><select id="bcn">${options([['sub', 'Subcuentas'], ['elem', 'Cuentas (2 dígitos)']], nivel)}</select></div></div>
      <div class="card"><div class="card-head"><h3>Hoja de trabajo</h3><div class="actions" style="margin:0"><button class="btn btn-secondary btn-sm no-print" data-export="${id}">Exportar CSV</button></div></div>${fsHead('BALANCE DE COMPROBACIÓN')}
      <div class="summary-bar"><div class="summary-item"><span>Resultado según inventario</span><b>${money(bc.resInventario)}</b></div><div class="summary-item"><span>Resultado por naturaleza</span><b>${money(bc.resNaturaleza)}</b></div><div class="summary-item"><span>Resultado por función</span><b>${money(bc.resFuncion)}</b></div><div class="summary-item"><span>Verificación</span><b>${checkPill(bc.resInventario, bc.resNaturaleza)} ${checkPill(bc.resNaturaleza, bc.resFuncion)}</b></div></div>
      <div class="table-wrap"><table><thead><tr><th colspan="2"></th><th colspan="2" class="money">Sumas</th><th colspan="2" class="money">Saldos</th><th colspan="2" class="money">Inventario</th><th colspan="2" class="money">Result. por naturaleza</th><th colspan="2" class="money">Result. por función</th></tr>
      <tr><th>Cuenta</th><th>Denominación</th><th class="money">Debe</th><th class="money">Haber</th><th class="money">Deudor</th><th class="money">Acreedor</th><th class="money">Activo</th><th class="money">Pasivo y Pat.</th><th class="money">Pérdidas</th><th class="money">Ganancias</th><th class="money">Pérdidas</th><th class="money">Ganancias</th></tr></thead>
      <tbody>${body}<tr class="total"><td colspan="2">TOTALES</td>${keys.map(k => td(t[k])).join('')}</tr>
      <tr class="sub"><td colspan="2">${bc.resNaturaleza >= 0 ? 'UTILIDAD' : 'PÉRDIDA'} DEL EJERCICIO</td>${resRow.map(v => td(v)).join('')}</tr>
      <tr class="total"><td colspan="2">SUMAS IGUALES</td>${sumas.map(v => td(v)).join('')}</tr></tbody></table></div></div>`);
    $('#bcn').onchange = e => navigate('comprobacion', { nivel: e.target.value });
  }

  // ------------------------------------------------------------ Estados financieros
  function viewSituacion() {
    const c = ctx(), es = E.estadoSituacion(c);
    const det = !!PARAMS.detalle;
    const s = situacionHtml(es, det);
    setContent(`<h2 class="section-title">Estado de situación financiera</h2><p class="section-sub">Antes llamado Balance general. Incluye el resultado del ejercicio en el patrimonio.</p>
      <div class="toolbar no-print"><label class="field check" style="padding:0"><input type="checkbox" id="det" ${det ? 'checked' : ''}> Mostrar detalle por cuenta</label></div>
      ${card('Estado de situación financiera', fsHead('ESTADO DE SITUACIÓN FINANCIERA', 'al') + s.html + `<div class="actions">Activo ${money(es.tActivo)} = Pasivo + Patrimonio ${money(es.tPasPat)} ${checkPill(es.tActivo, es.tPasPat)}</div>`, { exportId: s.id })}`);
    $('#det').onchange = e => navigate('situacion', { detalle: e.target.checked ? 1 : '' });
  }

  function viewResultados() {
    const c = ctx(), r = E.resultadosFuncion(c);
    const lines = [
      { l: 'Ventas netas', v: r.ventas }, { l: '(-) Costo de ventas', v: -r.cv }, { l: 'UTILIDAD BRUTA', v: r.ub, cls: 'total' },
      { l: '(-) Gastos de administración', v: -r.ga, indent: 1 }, { l: '(-) Gastos de ventas', v: -r.gv, indent: 1 },
      ...(r.noAbs ? [{ l: '(-) Costos de producción no absorbidos', v: -r.noAbs, indent: 1 }] : []),
      { l: 'UTILIDAD OPERATIVA', v: r.uo, cls: 'total' },
      ...(r.gf ? [{ l: '(-) Gastos financieros', v: -r.gf, indent: 1 }] : []),
      ...(r.otrosIng ? [{ l: '(+) Otros ingresos', v: r.otrosIng, indent: 1 }] : []),
      ...(r.otros ? [{ l: '(±) Otros ingresos y gastos no destinados', v: r.otros, indent: 1 }] : []),
      { l: 'RESULTADO ANTES DEL IMPUESTO A LA RENTA', v: r.rai, cls: 'total' }, { l: '(-) Impuesto a la renta', v: -r.ir, indent: 1 },
      { l: r.neto >= 0 ? 'UTILIDAD NETA DEL EJERCICIO' : 'PÉRDIDA NETA DEL EJERCICIO', v: r.neto, cls: 'total' }
    ];
    const st = stmtTable(lines, 'estado-resultados-funcion');
    setContent(`<h2 class="section-title">Estado de resultados por función</h2><p class="section-sub">Costo de ventas (69) y gastos por función (94, 95, 97) provenientes del destino de los gastos.</p>
      ${card('Estado de resultados', `<div class="fs">${fsHead('ESTADO DE RESULTADOS POR FUNCIÓN')}${st.html}</div>`, { exportId: st.id })}`);
  }

  function viewNaturaleza() {
    const c = ctx(), r = E.resultadosNaturaleza(c);
    const lines = [
      { l: 'Ventas netas de productos (70)', v: r.ventas }, { l: '(-) Costo de ventas (69)', v: -r.cv }, { l: '(+) Variación de la producción almacenada (71)', v: r.varProd },
      ...(r.prodInm ? [{ l: '(+) Producción inmovilizada (72)', v: r.prodInm }] : []),
      { l: 'PRODUCCIÓN DEL EJERCICIO', v: r.produccion, cls: 'sub' },
      { l: '(-) Consumo de materias primas y materiales (60 + 61)', v: -r.consumo, indent: 1 }, { l: '(-) Servicios prestados por terceros (63)', v: -r.servicios, indent: 1 },
      { l: 'VALOR AGREGADO', v: r.va, cls: 'total' },
      { l: '(-) Gastos de personal (62)', v: -r.personal, indent: 1 }, ...(r.tributos ? [{ l: '(-) Tributos (64)', v: -r.tributos, indent: 1 }] : []),
      { l: 'EXCEDENTE BRUTO DE EXPLOTACIÓN', v: r.ebe, cls: 'total' },
      { l: '(-) Depreciación y provisiones (68)', v: -r.deprec, indent: 1 }, ...(r.otros ? [{ l: '(±) Otros ingresos y gastos', v: r.otros, indent: 1 }] : []),
      { l: 'RESULTADO ANTES DEL IMPUESTO A LA RENTA', v: r.rai, cls: 'total' }, { l: '(-) Impuesto a la renta (88)', v: -r.ir, indent: 1 },
      { l: 'RESULTADO DEL EJERCICIO', v: r.neto, cls: 'total' }
    ];
    const st = stmtTable(lines, 'estado-resultados-naturaleza');
    setContent(`<h2 class="section-title">Estado de resultados por naturaleza</h2><p class="section-sub">Presenta los gastos según su naturaleza (clase 6) y la variación de la producción almacenada (71). Debe dar el mismo resultado que el estado por función.</p>
      ${card('Estado de resultados', `<div class="fs">${fsHead('ESTADO DE RESULTADOS POR NATURALEZA')}${st.html}<div class="actions">Comparación con el estado por función: ${checkPill(r.neto, E.resultadosFuncion(c).neto)}</div></div>`, { exportId: st.id })}`);
  }

  function viewFlujo() {
    const c = ctx(), f = E.flujoEfectivo(c);
    const lines = [];
    f.secciones.forEach(s => {
      lines.push({ l: 'ACTIVIDADES DE ' + s.actividad.toUpperCase(), cls: 'group' });
      s.lineas.forEach(x => lines.push({ l: x.concepto, v: x.monto, indent: 1 }));
      if (!s.lineas.length) lines.push({ l: 'Sin movimientos', v: 0, indent: 1 });
      lines.push({ l: `Flujo neto de actividades de ${s.actividad.toLowerCase()}`, v: s.neto, cls: 'sub' });
    });
    lines.push({ l: 'AUMENTO (DISMINUCIÓN) NETO DEL EFECTIVO', v: f.aumento, cls: 'total' }, { l: 'Saldo de efectivo al inicio (apertura)', v: f.saldoInicial }, { l: 'SALDO DE EFECTIVO AL FINAL DEL PERIODO', v: f.saldoFinal, cls: 'total' });
    const st = stmtTable(lines, 'flujo-efectivo');
    setContent(`<h2 class="section-title">Estado de flujo de efectivo (método directo)</h2><p class="section-sub">Se construye con los movimientos reales de la cuenta 10, clasificados por actividad de operación, inversión y financiamiento.</p>
      ${card('Estado de flujo de efectivo', `<div class="fs">${fsHead('ESTADO DE FLUJO DE EFECTIVO')}${st.html}<div class="actions">Conciliación con el saldo de la cuenta 10 (${money(f.saldoContable)}): ${checkPill(f.saldoFinal, f.saldoContable)}</div></div>`, { exportId: st.id })}`);
  }

  function viewPatrimonio() {
    const c = ctx(), p = E.cambiosPatrimonio(c);
    setContent(`<h2 class="section-title">Estado de cambios en el patrimonio neto</h2><p class="section-sub">Movimientos del capital, resultados acumulados y resultado del ejercicio.</p>
      ${tblCard('Estado de cambios en el patrimonio', p.rows, [{ k: 'concepto', l: 'Concepto' }, { k: 'capital', l: 'Capital', f: 'money' }, { k: 'acumulados', l: 'Resultados acumulados', f: 'money' }, { k: 'resultado', l: 'Resultado del ejercicio', f: 'money' }, { k: 'total', l: 'Total patrimonio', f: 'money' }], { name: 'cambios-patrimonio', foot: [p.fin] })}`);
  }

  function viewRatios() {
    const c = ctx(), r = E.ratios(c);
    const f = (v, row) => (v == null ? '-' : row.tipo === '%' ? pct(v) : row.tipo === 'soles' ? money(v) : n2(v) + ' veces');
    setContent(`<h2 class="section-title">Ratios financieros</h2><p class="section-sub">Indicadores calculados con el estado de situación y el estado de resultados del periodo.</p>
      ${tblCard('Indicadores', r, [{ k: 'grupo', l: 'Grupo' }, { k: 'nombre', l: 'Ratio' }, { k: 'formula', l: 'Fórmula' }, { k: 'valor', l: 'Resultado', f, cls: 'money' }], { name: 'ratios' })}`);
  }

  // ------------------------------------------------------------ Cierre
  function viewAjustes() {
    const c = ctx();
    const deps = c.dep.map(a => ({ ...a, areaL: { PRODUCCION: 'Planta → CIF (931)', ADMINISTRACION: 'Administración (941)', VENTAS: 'Ventas (951)' }[a.area], estado: a.aplica ? 'Se deprecia' : 'Adquirido en el periodo / desactivado' }));
    const rai = E.resultadosFuncion(c).rai;
    const ajustes = c.entries.filter(e => e.tipo === 'Ajuste');
    const t = tbl(ajustes.map(e => ({ num: e.num, fecha: e.fecha, glosa: e.glosa, origen: e.origen.label, debe: e.debe })), [{ k: 'num', l: 'N°' }, { k: 'fecha', l: 'Fecha', f: 'date' }, { k: 'glosa', l: 'Glosa' }, { k: 'origen', l: 'Origen' }, { k: 'debe', l: 'Importe', f: 'money' }], { name: 'asientos-ajuste' });
    setContent(`<h2 class="section-title">Ajustes del periodo</h2><p class="section-sub">Depreciación de activos fijos (con destino según el área: la de planta es un CIF) e impuesto a la renta. Otros ajustes se registran como asiento manual de tipo "Ajuste".</p>
      ${tblCard('Depreciación mensual de activos fijos', deps, [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Activo' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'fecha', l: 'Adquisición', f: 'date' }, { k: 'costo', l: 'Costo', f: 'money' }, { k: 'tasa', l: 'Tasa anual %', f: 'qty' }, { k: 'areaL', l: 'Destino' }, { k: 'estado', l: 'Estado' }, { k: 'mensual', l: 'Depreciación del mes', f: 'money' }],
        { name: 'depreciacion', foot: [{ nombre: 'TOTAL', mensual: E.sumBy(deps, 'mensual') }], extra: `<label class="field check" style="padding:0"><input type="checkbox" id="depOn" ${DB.empresa.registrarDepreciacion ? 'checked' : ''}> Registrar depreciación</label>` })}
      ${card('Impuesto a la renta', `<div class="summary-bar"><div class="summary-item"><span>Resultado antes de IR</span><b>${money(rai)}</b></div><div class="summary-item"><span>Tasa</span><b>${DB.empresa.irPct}%</b></div><div class="summary-item"><span>IR del periodo</span><b>${money(E.saldoPrefix(c.Lpre, '88'))}</b></div></div><div class="note">Cálculo simplificado sobre la utilidad contable (sin adiciones ni deducciones tributarias). Asiento: 881 Impuesto a la renta corriente / 40171 Renta de tercera categoría.</div>`,
        { extra: `<label class="field check" style="padding:0"><input type="checkbox" id="irOn" ${DB.empresa.calcularIR ? 'checked' : ''}> Calcular IR</label>` })}
      ${card('Asientos de ajuste del periodo', t.html, { exportId: t.id, extra: '<button class="btn btn-primary btn-sm" id="newAdj">+ Nuevo asiento de ajuste</button>' })}`);
    $('#depOn').onchange = e => { if (commit(d => { d.empresa.registrarDepreciacion = e.target.checked; })) rerender(); else e.target.checked = !e.target.checked; };
    $('#irOn').onchange = e => { if (commit(d => { d.empresa.calcularIR = e.target.checked; })) rerender(); else e.target.checked = !e.target.checked; };
    $('#newAdj').onclick = () => { AS_EDIT = null; navigate('asientos', { tipo: 'Ajuste' }); };
  }

  function viewCierre() {
    const c = ctx();
    const val = E.validar(c);
    const errores = val.filter(v => v.nivel === 'error');
    const closed = DB.cierre && DB.cierre.realizado;
    const debe = E.sumBy(c.entries, 'debe'), haber = E.sumBy(c.entries, 'haber');
    const cierreEntries = c.entries.filter(e => e.tipo === 'Cierre');
    const lines = [];
    cierreEntries.forEach(e => e.lines.forEach(l => lines.push({ num: e.num, glosa: e.glosa, cuenta: l.cuenta, nombre: c.accName(l.cuenta), debe: l.debe, haber: l.haber })));
    const icon = { ok: '✔', warn: '!', error: '✖' };
    setContent(`<h2 class="section-title">Cierre del ejercicio</h2><p class="section-sub">Valida la información y genera los asientos de cierre: cancelación de las cuentas analíticas (9 contra 79), cancelación de las cuentas de resultados contra la 89 y traslado del resultado a la 59. Al cerrar, el periodo queda bloqueado.</p>
      <div class="split">
        <div class="card"><div class="big-status">${closed ? 'PERIODO CERRADO' : errores.length ? 'REVISAR' : 'LISTO PARA CERRAR'}</div>
          <div class="status"><span>Total Debe (libro diario)</span><b>${money(debe)}</b></div><div class="status"><span>Total Haber (libro diario)</span><b>${money(haber)}</b></div>
          <div class="status"><span>Diferencia</span><b>${money(debe - haber)}</b></div><div class="status"><span>Asientos</span><b>${c.entries.length}</b></div>
          <div class="status"><span>Resultado del ejercicio</span><b>${money(E.resultadosFuncion(c).neto)}</b></div>
          <div class="actions">${closed ? '<button class="btn btn-warning" id="reopen">Revertir cierre (reabrir periodo)</button>' : `<button class="btn btn-primary" id="doClose" ${errores.length ? 'disabled title="Corrige los errores primero"' : ''}>Ejecutar cierre del ejercicio</button>`}</div></div>
        ${card('Validaciones previas', val.map(v => `<div class="status"><span>${esc(v.msg)}</span><b>${pill(icon[v.nivel], v.nivel === 'ok' ? 'ok' : v.nivel === 'warn' ? 'warn' : 'bad')}</b></div>`).join(''))}
      </div>
      ${closed ? tblCard('Asientos de cierre generados', lines, [{ k: 'num', l: 'N°' }, { k: 'glosa', l: 'Glosa' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'nombre', l: 'Denominación' }, { k: 'debe', l: 'Debe', f: 'money0' }, { k: 'haber', l: 'Haber', f: 'money0' }], { name: 'asientos-cierre' }) : ''}`);
    if ($('#doClose')) $('#doClose').onclick = async () => {
      if (!await ask('¿Ejecutar el cierre del ejercicio? El periodo quedará bloqueado para cambios.')) return;
      if (commit(d => { d.cierre = { realizado: true, fecha: today() }; }, { allowClosed: true })) { toast('Cierre ejecutado'); refreshChrome(); rerender(); }
    };
    if ($('#reopen')) $('#reopen').onclick = async () => {
      if (!await ask('¿Revertir el cierre? Se eliminarán los asientos de cierre.')) return;
      if (commit(d => { d.cierre = { realizado: false }; }, { allowClosed: true })) { toast('Periodo reabierto'); refreshChrome(); rerender(); }
    };
  }

  // ------------------------------------------------------------ Tablas maestras
  function viewTablas() {
    const tabs = [['cuentas', 'Plan de cuentas'], ['materiales', 'Materiales (MP / MI)'], ['productos', 'Productos terminados'], ['activos', 'Activos fijos'], ['inductores', 'Inductores de CIF'], ['cif', 'Conceptos CIF'], ['inicial', 'Inventario inicial'], ['terceros', 'Clientes y proveedores']];
    const tab = PARAMS.tab || 'cuentas';
    let inner = '', bind = null;
    const cifOpts = () => DB.conceptosCIF.map(x => [x.id, x.codigo + ' ' + x.nombre]);
    if (tab === 'cuentas') {
      const c = ctx();
      const cr = crud({
        key: 'cta', title: 'cuenta (adicional)', coll: d => d.cuentas, usos: 'cuenta', listTitle: 'Cuentas agregadas por el usuario',
        fields: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Denominación', span: 3 }],
        cols: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Denominación' }, { k: 'codigo', l: 'Tipo', f: v => esc(E.accType(v)) }],
        validate: (r, d, id) => (!/^\d{2,7}$/.test(r.codigo) ? 'El código debe tener de 2 a 7 dígitos.' : !r.nombre ? 'Indica la denominación.' : c.chart.some(a => a.codigo === r.codigo && a.id !== id) ? 'El código ya existe.' : '')
      });
      const all = tbl(c.chart, [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Denominación' }, { k: 'tipo', l: 'Tipo' }, { k: 'origen', l: 'Origen' }], { name: 'plan-de-cuentas' });
      inner = `<div class="note">El plan base sigue el PCGE (simplificado). Las subcuentas de materiales (241xx/251xx), productos (211xx) y O/T (231xx) se crean solas.</div>` + cr.html + card('Plan de cuentas completo (' + c.chart.length + ')', all.html, { exportId: all.id });
      bind = cr.bind;
    } else if (tab === 'materiales') {
      const cr = crud({
        key: 'mat', title: 'material', coll: d => d.materiales, usos: 'material', listTitle: 'Materiales',
        defaults: () => ({ codigo: 'MP-' + E.pad(nextId(DB.materiales), 3), tipo: 'MP', unidad: 'und' }),
        fields: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Descripción', span: 2 }, { k: 'unidad', l: 'Unidad de medida' },
          { k: 'tipo', l: 'Tipo', t: 'select', opts: [['MP', 'MP - Materia prima (directa, cuenta 24)'], ['MI', 'MI - Material indirecto / suministro (cuenta 25, CIF)']] },
          { k: 'cifId', l: 'Concepto CIF (solo MI)', t: 'select', num: true, blank: '—', opts: cifOpts }],
        cols: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Descripción' }, { k: 'unidad', l: 'Unidad' }, { k: 'tipo', l: 'Tipo' }, { k: 'id', l: 'Cuenta', f: (v, r) => E.matAccount(r) }],
        validate: r => (!r.nombre ? 'Indica la descripción.' : r.tipo === 'MI' && !r.cifId ? 'El material indirecto necesita un concepto CIF.' : ''),
        beforeSave: r => { if (r.tipo !== 'MI') r.cifId = null; }
      });
      inner = cr.html; bind = cr.bind;
    } else if (tab === 'productos') {
      const cr = crud({
        key: 'prod', title: 'producto terminado', coll: d => d.productos, usos: 'producto', listTitle: 'Productos terminados',
        defaults: () => ({ codigo: 'PT-' + E.pad(nextId(DB.productos), 3), unidad: 'und' }),
        fields: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Descripción', span: 2 }, { k: 'unidad', l: 'Unidad' }],
        cols: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Descripción' }, { k: 'unidad', l: 'Unidad' }, { k: 'id', l: 'Cuenta 21', f: (v, r) => E.ptAccount(r) }],
        validate: r => (!r.nombre ? 'Indica la descripción.' : '')
      });
      inner = cr.html; bind = cr.bind;
    } else if (tab === 'activos') {
      const cr = crud({
        key: 'af', title: 'activo fijo', coll: d => d.activos, listTitle: 'Activos fijos',
        defaults: () => ({ codigo: 'AF-' + E.pad(nextId(DB.activos), 3), cuenta: '3331', fecha: E.periodStart(DB), tasa: 10, area: 'PRODUCCION' }),
        fields: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Descripción', span: 2 }, { k: 'cuenta', l: 'Cuenta (33)', t: 'accounts', filter: c => c.startsWith('33') },
          { k: 'costo', l: 'Costo de adquisición', t: 'number' }, { k: 'fecha', l: 'Fecha de adquisición', t: 'date' }, { k: 'tasa', l: 'Tasa de depreciación anual %', t: 'number' },
          { k: 'area', l: 'Área de uso', t: 'select', opts: [['PRODUCCION', 'Producción (CIF)'], ['ADMINISTRACION', 'Administración'], ['VENTAS', 'Ventas']] },
          { k: 'cifId', l: 'Concepto CIF (si es de planta)', t: 'select', num: true, blank: '—', opts: cifOpts }],
        cols: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Activo' }, { k: 'cuenta', l: 'Cuenta' }, { k: 'costo', l: 'Costo', f: 'money' }, { k: 'fecha', l: 'Adquisición', f: 'date' }, { k: 'tasa', l: 'Tasa %', f: 'qty' }, { k: 'area', l: 'Área' }],
        validate: r => (!r.nombre || r.costo <= 0 ? 'Indica descripción y costo.' : r.area === 'PRODUCCION' && !r.cifId ? 'Un activo de planta necesita un concepto CIF.' : ''),
        beforeSave: r => { if (r.area !== 'PRODUCCION') r.cifId = null; }
      });
      inner = `<div class="note">Los activos con fecha anterior al inicio del periodo forman parte del asiento de apertura y se deprecian. Los comprados en el periodo se registran con una compra (ítem "Activo fijo") y aquí solo para su control.</div>` + cr.html; bind = cr.bind;
    } else if (tab === 'inductores') {
      const cr = crud({
        key: 'ind', title: 'inductor de CIF', coll: d => d.inductores, usos: 'inductor', listTitle: 'Inductores',
        defaults: () => ({ codigo: 'IND-' + E.pad(nextId(DB.inductores)), fuente: 'MANUAL' }),
        fields: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Inductor', span: 2 }, { k: 'unidad', l: 'Unidad de medida' },
          { k: 'fuente', l: 'Origen de la base por O/T', t: 'select', opts: [['MANUAL', 'Manual'], ['HORAS_MOD', 'Horas MOD (hojas de tiempo)'], ['UNIDADES', 'Unidades producidas'], ['COSTO_MD', 'Costo de materia prima directa']] }],
        cols: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Inductor' }, { k: 'unidad', l: 'Unidad' }, { k: 'fuente', l: 'Origen' }],
        validate: r => (!r.nombre ? 'Indica el nombre del inductor.' : ''),
        afterDelete: (id, d) => { d.basesInductor = d.basesInductor.filter(b => Number(b.inductorId) !== id); }
      });
      inner = cr.html; bind = cr.bind;
    } else if (tab === 'cif') {
      const cr = crud({
        key: 'cifc', title: 'concepto CIF', coll: d => d.conceptosCIF, usos: 'cif', listTitle: 'Conceptos CIF',
        defaults: () => ({ codigo: 'CIF-' + E.pad(nextId(DB.conceptosCIF)), inductorId: DB.inductores[0]?.id, comportamiento: 'FIJO' }),
        fields: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Concepto CIF', span: 2 },
          { k: 'inductorId', l: 'Inductor', t: 'select', num: true, opts: () => DB.inductores.map(i => [i.id, i.codigo + ' ' + i.nombre]) },
          { k: 'comportamiento', l: 'Comportamiento', t: 'select', opts: ['FIJO', 'VARIABLE'] }],
        cols: [{ k: 'codigo', l: 'Código' }, { k: 'nombre', l: 'Concepto' }, { k: 'inductorId', l: 'Inductor', f: v => esc(E.byId(DB.inductores, v)?.nombre || '-') }, { k: 'comportamiento', l: 'Comportamiento' }],
        validate: r => (!r.nombre ? 'Indica el concepto.' : !r.inductorId ? 'Cada CIF debe tener un inductor.' : '')
      });
      inner = cr.html; bind = cr.bind;
    } else if (tab === 'inicial') {
      const cr = crud({
        key: 'ii', title: 'saldo inicial de material', coll: d => d.inventarioInicial, listTitle: 'Inventario inicial (forma parte del asiento de apertura)',
        defaults: () => ({ materialId: DB.materiales[0]?.id }),
        fields: [{ k: 'materialId', l: 'Material', t: 'select', num: true, opts: () => DB.materiales.map(m => [m.id, m.codigo + ' ' + m.nombre]), span: 2 }, { k: 'cantidad', l: 'Cantidad', t: 'number' }, { k: 'costoUnit', l: 'Costo unitario', t: 'number' }],
        rows: l => l.map(x => ({ ...x, material: E.byId(DB.materiales, x.materialId)?.nombre, total: E.r2(x.cantidad * x.costoUnit) })),
        cols: [{ k: 'material', l: 'Material' }, { k: 'cantidad', l: 'Cantidad', f: 'qty' }, { k: 'costoUnit', l: 'Costo unit.', f: 'cu' }, { k: 'total', l: 'Total', f: 'money' }],
        validate: r => (r.cantidad <= 0 || r.costoUnit <= 0 ? 'Indica cantidad y costo.' : '')
      });
      inner = cr.html; bind = cr.bind;
    } else {
      const prov = {}, cli = {};
      DB.compras.forEach(x => { const k = x.ruc + x.proveedor; (prov[k] = prov[k] || { ruc: x.ruc, nombre: x.proveedor, docs: 0, total: 0 }).docs++; prov[k].total += E.compraTotals(x, DB.empresa.igvPct).total; });
      DB.ventas.forEach(x => { const k = x.ruc + x.cliente; (cli[k] = cli[k] || { ruc: x.ruc, nombre: x.cliente, docs: 0, total: 0 }).docs++; cli[k].total += E.ventaTotals(x, DB.empresa.igvPct).total; });
      const cols = [{ k: 'ruc', l: 'RUC / DNI' }, { k: 'nombre', l: 'Razón social' }, { k: 'docs', l: 'Comprobantes' }, { k: 'total', l: 'Importe total', f: 'money' }];
      inner = `<div class="note">Los terceros se obtienen de los comprobantes registrados.</div><div class="split">${tblCard('Proveedores', Object.values(prov), cols, { name: 'proveedores' })}${tblCard('Clientes', Object.values(cli), cols, { name: 'clientes' })}</div>`;
    }
    setContent(`<h2 class="section-title">Tablas maestras</h2><p class="section-sub">Catálogos que usa el sistema. No se pueden eliminar registros que estén siendo usados por documentos.</p>
      <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>${inner}`);
    $$('[data-tab]').forEach(b => (b.onclick = () => navigate('tablas', { tab: b.dataset.tab })));
    if (bind) bind();
  }

  // ------------------------------------------------------------ Utilitarios
  function viewBackup() {
    setContent(`<h2 class="section-title">Backup y restauración</h2><p class="section-sub">Los datos se guardan en el navegador (localStorage). Descarga un respaldo para no perderlos o para pasarlos a otra computadora.</p>
      <div class="card"><h3>Herramientas</h3><div class="actions">
        <button class="btn btn-primary" id="dl">Descargar backup (JSON)</button>
        <label class="btn btn-secondary" style="display:inline-block">Restaurar desde archivo<input type="file" id="up" accept="application/json,.json" hidden></label>
        <button class="btn btn-warning" id="reset">Restaurar datos de ejemplo</button>
        <button class="btn btn-danger" id="blank">Empezar con base vacía</button></div>
        <div class="note" style="margin-top:14px">Restaurar datos de ejemplo o empezar con base vacía reemplaza toda la información actual. Descarga un backup antes.</div></div>`);
    $('#dl').onclick = () => download(JSON.stringify(DB, null, 2), `backup-sistema-contable-${DB.empresa.periodo}-${today()}.json`, 'application/json');
    $('#up').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        try {
          const x = JSON.parse(rd.result);
          if (!x || x.schema !== E.SCHEMA || !x.empresa) throw new Error('El archivo no corresponde a un backup de esta versión (V5).');
          E.compute(x);
          if (!await ask('¿Reemplazar los datos actuales con el backup?')) return;
          DB = x; persist(DB); REV++; toast('Backup restaurado'); refreshChrome(); navigate('dashboard');
        } catch (err) { notify('No se pudo restaurar: ' + err.message); }
      };
      rd.readAsText(f);
    };
    $('#reset').onclick = async () => { if (await ask('¿Reemplazar todo con los datos de ejemplo?')) { DB = Seed.create(); persist(DB); REV++; toast('Datos de ejemplo restaurados'); refreshChrome(); navigate('dashboard'); } };
    $('#blank').onclick = async () => {
      if (!await ask('¿Borrar todo y empezar con una base vacía (se conserva el plan de cuentas PCGE)?')) return;
      const x = E.emptyDb();
      x.empresa = { ...DB.empresa, cajaInicial: 0 };
      DB = x; persist(DB); REV++; toast('Base vacía creada'); refreshChrome(); navigate('dashboard');
    };
  }

  function viewEstadisticas() {
    const c = ctx();
    const docs = [['Compras', DB.compras.length], ['Ventas', DB.ventas.length], ['Requisiciones', DB.requisiciones.length], ['Órdenes de trabajo', DB.ordenes.length], ['Trabajadores', DB.trabajadores.length], ['Hojas de tiempo', DB.horas.length], ['Movimientos de tesorería', DB.tesoreria.length], ['Asientos manuales', DB.asientos.length]].map(([d, n]) => ({ d, n }));
    const porOrigen = Object.entries(E.ORIGENES).map(([k, l]) => ({ origen: l, n: c.entries.filter(e => e.origen.kind === k).length, monto: E.sumBy(c.entries.filter(e => e.origen.kind === k), 'debe') })).filter(x => x.n);
    const gastos = Object.values(c.Lpre).filter(a => a.codigo[0] === '6' && a.saldo > 0).map(a => ({ cuenta: a.codigo + ' ' + c.accName(a.codigo), monto: a.saldo })).sort((a, b) => b.monto - a.monto);
    const max = Math.max(1, ...gastos.map(g => g.monto));
    const bars = gastos.map(g => `<div class="bar-row"><div>${esc(g.cuenta)}</div><div class="bar-track"><div class="bar-seg" style="width:${g.monto / max * 100}%;background:#8b1e2d"></div></div><div class="right">${money(g.monto)}</div></div>`).join('');
    setContent(`<h2 class="section-title">Estadísticas</h2><p class="section-sub">Indicadores de uso del sistema.</p>
      <div class="kpis">${kpi('Asientos', c.entries.length, 'Libro diario')}${kpi('Líneas contables', c.entries.reduce((s, e) => s + e.lines.length, 0), 'Movimientos')}${kpi('Cuentas con movimiento', Object.keys(c.L).length, 'Libro mayor')}${kpi('Total Debe', money(E.sumBy(c.entries, 'debe')), 'Igual al Haber')}</div>
      <div class="split">${tblCard('Documentos registrados', docs, [{ k: 'd', l: 'Documento' }, { k: 'n', l: 'Cantidad' }], { name: 'documentos' })}${tblCard('Asientos por origen', porOrigen, [{ k: 'origen', l: 'Origen' }, { k: 'n', l: 'Asientos' }, { k: 'monto', l: 'Importe', f: 'money' }], { name: 'asientos-origen' })}</div>
      ${card('Gastos por naturaleza (clase 6)', `<div class="bars">${bars || '<div class="empty">Sin gastos</div>'}</div>`)}`);
  }

  function viewManual() {
    setContent(`<h2 class="section-title">Manual de usuario</h2><p class="section-sub">Guía rápida del sistema.</p>
      <div class="card"><h3>1. Configuración inicial</h3><ol style="line-height:1.8;color:#475467">
        <li><b>Empresa y parámetros</b>: periodo, método de valuación (promedio o PEPS) y tasas (IGV, EsSalud, ONP, AFP, IR).</li>
        <li><b>Tablas maestras</b>: materiales (MP o MI), productos, activos fijos, <b>inductores</b> y <b>conceptos CIF</b> (cada CIF con su inductor) e inventario inicial.</li></ol></div>
      <div class="card"><h3>2. Ciclo de costos por órdenes de trabajo</h3><ol style="line-height:1.8;color:#475467">
        <li>Crea las <b>órdenes de trabajo</b>.</li>
        <li>Registra las <b>compras</b>: los materiales actualizan el kardex y la subcuenta 24/25; los servicios se destinan a CIF, administración o ventas.</li>
        <li>Registra las <b>requisiciones</b>: la MP sale del kardex hacia una O/T (91); el material indirecto va a CIF (93).</li>
        <li>Registra la <b>planilla</b> clasificando a cada trabajador (MOD, MOI, administrativo, ventas) y las <b>hojas de tiempo</b> de la MOD por O/T.</li>
        <li>En <b>Inductores y distribución CIF</b> ingresa las bases manuales (horas máquina, kWh). El sistema calcula la tasa y el CIF de cada O/T.</li>
        <li>Revisa la <b>hoja de costos</b> y el <b>libro mayor de fábrica</b>. Marca la O/T como TERMINADA para trasladarla a productos terminados.</li>
        <li>Registra las <b>ventas</b>: el costo de ventas se toma del kardex de productos terminados.</li></ol></div>
      <div class="card"><h3>3. Libros, estados financieros y cierre</h3><ol style="line-height:1.8;color:#475467">
        <li>Los asientos se generan solos. Consulta el <b>libro diario</b>, <b>mayor</b>, <b>cuentas T</b>, <b>caja y bancos</b>, <b>registros de compras y ventas</b>, <b>inventarios y balances</b> y el <b>balance de comprobación</b>.</li>
        <li>Revisa los <b>estados financieros</b>, el <b>estado de costo de producción</b> y los <b>ratios</b>.</li>
        <li>En <b>Ajustes</b> revisa la depreciación y el impuesto a la renta. En <b>Cierre del ejercicio</b> valida todo y ejecuta el cierre.</li>
        <li>Todas las tablas se pueden <b>exportar a CSV</b> (Excel) y cualquier pantalla se puede <b>imprimir</b> o guardar como PDF.</li></ol></div>`);
  }

  // ------------------------------------------------------------ Navegación
  const MENU = [
    ['Inicio', [['dashboard', 'Panel general', viewDashboard], ['config', 'Empresa y parámetros', viewConfig]]],
    ['Operaciones', [['compras', 'Compras', viewCompras], ['ventas', 'Ventas', viewVentas], ['tesoreria', 'Tesorería (cobros y pagos)', viewTesoreria], ['planilla', 'Planilla de remuneraciones', viewPlanilla], ['asientos', 'Asientos manuales', viewAsientos]]],
    ['Producción y costos', [['ordenes', 'Órdenes de trabajo (O/T)', viewOrdenes], ['requisiciones', 'Requisiciones de materiales', viewRequisiciones], ['horas', 'Hojas de tiempo MOD', viewHoras], ['cif', 'Inductores y distribución CIF', viewCIF], ['hojaCostos', 'Hoja de costos por O/T', viewHojaCostos], ['kardex', 'Kardex (MP, MI, PT)', viewKardex], ['fabrica', 'Libro mayor de fábrica', viewFabrica], ['estadoCostos', 'Estado de costo de producción', viewEstadoCostos], ['cvu', 'Costos fijos/variables y P.E.', viewCVU]]],
    ['Libros contables', [['diario', 'Libro diario', viewDiario], ['mayor', 'Libro mayor', viewMayor], ['cuentasT', 'Cuentas T', viewCuentasT], ['caja', 'Libro caja y bancos', viewCaja], ['regCompras', 'Registro de compras', viewRegCompras], ['regVentas', 'Registro de ventas', viewRegVentas], ['inventarios', 'Libro de inventarios y balances', viewInventarios], ['comprobacion', 'Balance de comprobación', viewComprobacion]]],
    ['Estados financieros', [['situacion', 'Estado de situación financiera', viewSituacion], ['resultados', 'Estado de resultados (función)', viewResultados], ['naturaleza', 'Estado de resultados (naturaleza)', viewNaturaleza], ['flujo', 'Estado de flujo de efectivo', viewFlujo], ['patrimonio', 'Cambios en el patrimonio', viewPatrimonio], ['ratios', 'Ratios financieros', viewRatios]]],
    ['Cierre', [['ajustes', 'Ajustes del periodo', viewAjustes], ['cierre', 'Cierre del ejercicio', viewCierre]]],
    ['Tablas', [['tablas', 'Tablas maestras', viewTablas]]],
    ['Utilitarios', [['backup', 'Backup y restauración', viewBackup], ['estadisticas', 'Estadísticas', viewEstadisticas], ['manual', 'Manual de usuario', viewManual]]]
  ];
  const VIEWS = {};
  MENU.forEach(([, items]) => items.forEach(([k, l, fn]) => (VIEWS[k] = { title: l, fn })));

  function buildNav() {
    $('#nav').innerHTML = MENU.map(([g, items]) => `<div class="nav-group"><div class="nav-label">${g}</div>${items.map(([k, l]) => `<button class="nav" data-view="${k}">${l}</button>`).join('')}</div>`).join('');
    $$('.nav[data-view]').forEach(b => (b.onclick = () => navigate(b.dataset.view, {})));
  }

  function refreshChrome() {
    $('#sideCompany').textContent = DB.empresa.razon + ' · ' + DB.empresa.periodo;
    const b = $('#periodBadge');
    const closed = DB.cierre && DB.cierre.realizado;
    b.textContent = (closed ? 'CERRADO · ' : '') + 'Periodo ' + DB.empresa.periodo + ' · ' + (DB.empresa.metodo === 'PEPS' ? 'PEPS' : 'Promedio');
    b.classList.toggle('closed', !!closed);
  }

  function navigate(v, params) {
    if (!VIEWS[v]) v = 'dashboard';
    if (v !== VIEW) { COMPRA_EDIT = null; VENTA_EDIT = null; AS_EDIT = null; Object.keys(EDIT).forEach(k => (EDIT[k] = null)); }
    VIEW = v; PARAMS = params || {};
    $$('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === v));
    $('#pageTitle').textContent = VIEWS[v].title;
    render();
    window.scrollTo(0, 0);
    if (innerWidth < 780) $('#sidebar').classList.remove('open');
  }

  function render() {
    Object.keys(EXPORTS).forEach(k => delete EXPORTS[k]);
    try { VIEWS[VIEW].fn(); }
    catch (e) {
      console.error(e);
      setContent(`<div class="card"><h3>No se pudo abrir el módulo</h3><div class="danger-note">${esc(e.message || e)}</div></div>`);
    }
  }
  const rerender = () => render();

  // Delegación global: exportar, accesos rápidos
  document.addEventListener('click', e => {
    const ex = e.target.closest('[data-export]');
    if (ex) exportCSV(ex.dataset.export);
    const go = e.target.closest('[data-go]');
    if (go) navigate(go.dataset.go, {});
  });

  function enter() {
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    refreshChrome();
    navigate('dashboard', {});
  }

  DB = load();
  buildNav();
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const u = $('#loginUser').value.trim(), p = $('#loginPass').value, er = $('#loginError');
    if (u === 'admin' && p === 'uni2026') { er.classList.add('hidden'); enter(); }
    else { er.textContent = 'Usuario o contraseña incorrectos.'; er.classList.remove('hidden'); }
  });
  $('#logoutBtn').onclick = () => { $('#app').classList.add('hidden'); $('#loginScreen').classList.remove('hidden'); $('#loginPass').value = ''; $('#loginPass').focus(); };
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#printBtn').onclick = () => window.print();

  // Expuesto para pruebas automatizadas
  window.__app = { get db() { return DB; }, navigate, ctx };
})();
