/*
 * Simulador mínimo de Google Apps Script para pruebas locales (Node).
 * Imita SpreadsheetApp (incluida la conversión automática de Sheets: "1041" → número,
 * "2026-10-01" → fecha, salvo en celdas con formato de texto "@"), CacheService,
 * PropertiesService, LockService, Utilities, Session, HtmlService y ScriptApp.
 * Carga los archivos de dist/ en un contexto aislado, como los carga Apps Script.
 */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createRuntime(distDir, opts = {}) {
  // opts.from: otro runtime cuya hoja de cálculo y propiedades se reutilizan (simula actualizar el código).
  const sheets = opts.from ? opts.from.sheets : new Map();
  let order = 0;
  const ctxRef = {};

  function coerce(v, fmt) {
    if (typeof v !== 'string' || fmt === '@') return v;
    if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '') return Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const D = ctxRef.Date; const [y, m, d] = v.split('-').map(Number); return new D(y, m - 1, d); }
    if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
    return v;
  }

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    setValues(vals) {
      if (vals.length !== this.nr || vals.some(row => row.length !== this.nc)) throw new Error(`setValues: dimensiones ${vals.length}x${vals[0] && vals[0].length} no coinciden con ${this.nr}x${this.nc}`);
      vals.forEach((row, i) => row.forEach((v, j) => this.sh._set(this.r + i, this.c + j, v)));
      return this;
    }
    setValue(v) { this.sh._set(this.r, this.c, v); return this; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j)); out.push(row); }
      return out;
    }
    setNumberFormat(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.fmt.set(`${this.r + i},${this.c + j}`, f); return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontSize() { return this; }
    setFontColor() { return this; }
    getSheet() { return this.sh; }
  }

  class Sheet {
    constructor(name) { this.name = name; this.cells = new Map(); this.fmt = new Map(); this.order = order++; }
    _set(r, c, v) {
      if (v === undefined || (typeof v === 'number' && isNaN(v))) throw new Error(`Valor inválido en ${this.name} (${r},${c}): ${v}`);
      if (v !== null && typeof v === 'object' && !(v instanceof ctxRef.Date)) throw new Error(`Objeto no permitido en celda ${this.name} (${r},${c})`);
      const val = coerce(v, this.fmt.get(`${r},${c}`));
      if (val === '' || val === null) this.cells.delete(`${r},${c}`); else this.cells.set(`${r},${c}`, val);
    }
    _get(r, c) { const v = this.cells.get(`${r},${c}`); return v === undefined ? '' : v; }
    getName() { return this.name; }
    getLastRow() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, Number(k.split(',')[0])); return m; }
    getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, Number(k.split(',')[1])); return m; }
    getRange(r, c, nr = 1, nc = 1) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`getRange inválido (${r},${c},${nr},${nc})`);
      return new Range(this, r, c, nr, nc);
    }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    clearContents() { this.cells.clear(); return this; }
    clear() { this.cells.clear(); this.fmt.clear(); return this; }
    setFrozenRows() { return this; }
    appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this._set(r, j + 1, v)); return this; }
    rows() { return this.getDataRange().getValues(); }
  }

  const spreadsheet = {
    getId: () => 'SHEET-TEST',
    getName: () => 'Sistema Contable (prueba)',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET-TEST/edit',
    getSheetByName: n => sheets.get(n) || null,
    insertSheet: n => { if (sheets.has(n)) throw new Error('Ya existe la hoja ' + n); const s = new Sheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()].sort((a, b) => a.order - b.order),
    deleteSheet: s => sheets.delete(s.name)
  };
  if (opts.defaultSheet !== false && !opts.from) spreadsheet.insertSheet('Hoja 1');

  const props = opts.from ? opts.from.props : new Map();
  const cache = new Map();
  const uiCalls = [];
  const ui = {
    alert: (...a) => { uiCalls.push(a); return 'YES'; },
    prompt: (...a) => { uiCalls.push(a); const t = runtime.promptAnswer; return { getSelectedButton: () => (t === null ? 'CANCEL' : 'OK'), getResponseText: () => String(t) }; },
    Button: { YES: 'YES', NO: 'NO', OK: 'OK', CANCEL: 'CANCEL' },
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO', OK_CANCEL: 'OK_CANCEL' },
    createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; }
  };

  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: id => { if (id !== 'SHEET-TEST') throw new Error('No existe ' + id); return spreadsheet; },
      getUi: () => { if (!runtime.uiAvailable) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); }, deleteProperty: k => props.delete(k) }) },
    CacheService: {
      getScriptCache: () => ({
        get: k => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; },
        put: (k, v, s) => { if (String(v).length > 100000) throw new Error('Argument too large'); cache.set(k, { v: String(v), exp: Date.now() + (s || 600) * 1000 }); },
        remove: k => cache.delete(k)
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash(alg).update(String(s), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      base64Encode: bytes => Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b))).toString('base64'),
      formatDate: (d, tz, f) => {
        const p = n => String(n).padStart(2, '0');
        return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
          .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
      },
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => 'America/Lima' },
    Logger: { log: () => {} },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    HtmlService: {
      createHtmlOutputFromFile: name => ({ getContent: () => fs.readFileSync(path.join(distDir, name + '.html'), 'utf8') }),
      createTemplateFromFile: name => ({
        evaluate: () => {
          const src = fs.readFileSync(path.join(distDir, name + '.html'), 'utf8');
          const html = src.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, n) => ctxRef.ctx.include(n));
          const out = { content: html, title: '', setTitle(t) { out.title = t; return out; }, addMetaTag() { return out; }, setXFrameOptionsMode() { return out; }, getContent: () => out.content };
          return out;
        }
      })
    }
  };
  const ctx = vm.createContext(sandbox);
  ctxRef.ctx = ctx;
  ctxRef.Date = vm.runInContext('Date', ctx);
  ['Engine.gs', 'Seed.gs', 'Code.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(distDir, f), 'utf8'), ctx, { filename: f }));

  const runtime = {
    ctx, sheets, spreadsheet, props, cache, uiCalls, uiAvailable: false, promptAnswer: '1',
    /** Llama una función como lo haría google.script.run (argumentos y respuesta serializados). */
    run(fn, ...args) {
      if (fn.endsWith('_') || typeof ctx[fn] !== 'function') throw new Error('Función no disponible: ' + fn);
      const a = JSON.parse(JSON.stringify(args));
      const r = ctx[fn](...a);
      return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
    },
    sheet: n => sheets.get(n)
  };
  return runtime;
}

module.exports = { createRuntime };
