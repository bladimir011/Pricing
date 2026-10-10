/**
 * Sistema Contable y de Costos UNI · servidor en Google Apps Script (multiempresa).
 *
 * Base de datos: la hoja de cálculo a la que está vinculado este proyecto.
 *  - Empresas: una fila por empresa (datos, parámetros y estado del cierre).
 *  - Una hoja por tabla, con la columna empresaId: cada empresa tiene sus propias cuentas,
 *    tablas maestras, documentos y asientos.
 *  - Usuarios: perfil y empresas a las que accede cada persona.
 * Archivos del proyecto: Code.gs, Engine.gs, Seed.gs, Index.html, css.html, js_engine.html,
 * js_xlsx.html, js_manual.html, js_backend.html y js_app.html.
 *
 * Las funciones que terminan en "_" son privadas: la página web no puede llamarlas.
 */

const APP_TITLE = 'Sistema Contable y de Costos';
const SESSION_SECONDS = 6 * 60 * 60;
const ROLES = ['ADMIN', 'CONTADOR', 'CONSULTA'];
const CACHE_SECONDS = 300;

/** Tablas por empresa. Tipos: s texto, d fecha (texto aaaa-mm-dd), n número, nn número o vacío, b sí/no. */
const TABLES = [
  { key: 'cuentas', sheet: 'Cuentas', desc: 'Plan de cuentas propio de la empresa (además del PCGE base)', cols: ['id:n', 'codigo:s', 'nombre:s'] },
  { key: 'materiales', sheet: 'Materiales', desc: 'Materias primas (MP) y materiales indirectos (MI)', cols: ['id:n', 'codigo:s', 'nombre:s', 'unidad:s', 'tipo:s', 'cifId:nn'] },
  { key: 'productos', sheet: 'Productos', desc: 'Productos terminados', cols: ['id:n', 'codigo:s', 'nombre:s', 'unidad:s'] },
  { key: 'inductores', sheet: 'Inductores', desc: 'Inductores de CIF', cols: ['id:n', 'codigo:s', 'nombre:s', 'unidad:s', 'fuente:s'] },
  { key: 'conceptosCIF', sheet: 'ConceptosCIF', desc: 'Conceptos CIF con su inductor', cols: ['id:n', 'codigo:s', 'nombre:s', 'inductorId:nn', 'comportamiento:s'] },
  { key: 'activos', sheet: 'ActivosFijos', desc: 'Activos fijos y su área de uso', cols: ['id:n', 'codigo:s', 'nombre:s', 'cuenta:s', 'costo:n', 'fecha:d', 'tasa:n', 'area:s', 'cifId:nn'] },
  { key: 'inventarioInicial', sheet: 'InventarioInicial', desc: 'Saldos iniciales de materiales', cols: ['id:n', 'materialId:n', 'cantidad:n', 'costoUnit:n'] },
  { key: 'ordenes', sheet: 'OrdenesTrabajo', desc: 'Órdenes de trabajo (O/T)', cols: ['id:n', 'numero:s', 'productoId:n', 'cliente:s', 'cantidad:n', 'fechaInicio:d', 'fechaFin:d', 'estado:s'] },
  {
    key: 'compras', sheet: 'Compras', desc: 'Comprobantes de compra', cols: ['id:n', 'fecha:d', 'tipoDoc:s', 'documento:s', 'proveedor:s', 'ruc:s', 'condicion:s'],
    child: {
      prop: 'items', sheet: 'ComprasDetalle', desc: 'Ítems de cada compra', fk: 'compraId',
      cols: ['tipo:s', 'materialId:nn', 'cantidad:n', 'costoUnit:n', 'descripcion:s', 'cuenta:s', 'destino:s', 'cifId:nn', 'monto:n'],
      shape: function (o) {
        if (o.tipo === 'MATERIAL') return { tipo: o.tipo, materialId: o.materialId, cantidad: o.cantidad, costoUnit: o.costoUnit };
        if (o.tipo === 'SERVICIO') return { tipo: o.tipo, descripcion: o.descripcion, cuenta: o.cuenta, destino: o.destino, monto: o.monto, cifId: o.cifId };
        return { tipo: o.tipo, descripcion: o.descripcion, cuenta: o.cuenta, monto: o.monto };
      }
    }
  },
  { key: 'requisiciones', sheet: 'Requisiciones', desc: 'Salidas de materiales a producción', cols: ['id:n', 'fecha:d', 'numero:s', 'otId:nn', 'materialId:n', 'cantidad:n'] },
  { key: 'trabajadores', sheet: 'Trabajadores', desc: 'Trabajadores y su clasificación (MOD, MOI, ADM, VEN)', cols: ['id:n', 'dni:s', 'nombre:s', 'cargo:s', 'clasificacion:s', 'sueldo:n', 'sistema:s', 'asigFam:b', 'renta5:n', 'cifId:nn'] },
  { key: 'horas', sheet: 'HojasTiempo', desc: 'Horas de MOD por orden de trabajo', cols: ['id:n', 'trabajadorId:n', 'otId:n', 'horas:n', 'fecha:d'] },
  { key: 'basesInductor', sheet: 'BasesInductor', desc: 'Bases manuales de inductores por O/T', cols: ['otId:n', 'inductorId:n', 'valor:n'] },
  {
    key: 'ventas', sheet: 'Ventas', desc: 'Comprobantes de venta', cols: ['id:n', 'fecha:d', 'tipoDoc:s', 'documento:s', 'cliente:s', 'ruc:s', 'condicion:s'],
    child: { prop: 'items', sheet: 'VentasDetalle', desc: 'Ítems de cada venta', fk: 'ventaId', cols: ['productoId:n', 'cantidad:n', 'precioUnit:n'] }
  },
  { key: 'tesoreria', sheet: 'Tesoreria', desc: 'Cobros y pagos (con su actividad: operación, inversión o financiamiento)', cols: ['id:n', 'fecha:d', 'tipo:s', 'cuenta:s', 'aux:s', 'documento:s', 'glosa:s', 'monto:n', 'actividad:s'] },
  {
    key: 'asientos', sheet: 'Asientos', desc: 'Asientos manuales (cabecera, con su actividad)', cols: ['id:n', 'fecha:d', 'tipo:s', 'actividad:s', 'glosa:s'],
    child: { prop: 'lineas', sheet: 'AsientosDetalle', desc: 'Líneas de los asientos manuales', fk: 'asientoId', cols: ['cuenta:s', 'debe:n', 'haber:n', 'aux:s'] }
  }
];
const EMPRESAS_SHEET = 'Empresas';
const OLD_CONFIG_SHEET = 'Config';
const USERS_SHEET = 'Usuarios';
const LOG_SHEET = 'Bitacora';
const DB_KEYS = TABLES.map(function (t) { return t.key; }).concat(['empresa', 'cierre']);

// =====================================================================================
// Web app y menú de la hoja de cálculo
// =====================================================================================

function doGet() {
  ensureInstalled_();
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Inserta el contenido de un archivo HTML del proyecto (estilos y scripts). */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sistema Contable')
    .addItem('Instalar o verificar la base de datos', 'instalar')
    .addItem('Generar reportes de una empresa (hojas R_ y C_)', 'generarReportesDesdeMenu')
    .addItem('Ver enlace de la aplicación web', 'mostrarEnlace')
    .addSeparator()
    .addItem('Restaurar datos de ejemplo en una empresa', 'restaurarDatosEjemplo')
    .addItem('Restablecer la contraseña de admin', 'restablecerAdmin')
    .addToUi();
}

/** Cambios hechos a mano en la hoja: se invalida la caché y se avisa a los usuarios conectados. */
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    if (name.indexOf('R_') === 0 || name.indexOf('C_') === 0 || name === LOG_SHEET) return;
    readEmpresas_().forEach(function (x) { bumpRev_(x.id); });
  } catch (err) { /* los activadores simples no siempre tienen permisos */ }
}

/** Crea las hojas que falten y carga los datos de ejemplo si la base está vacía. Se puede ejecutar varias veces. */
function instalar() {
  const r = install_();
  const msg = r.nueva
    ? 'Base de datos creada con la empresa de ejemplo OMEGA SAC.\nUsuario inicial: admin · Contraseña: uni2026 (cámbiala al ingresar).'
    : 'La base de datos ya estaba instalada. Se verificaron las hojas.';
  try { SpreadsheetApp.getUi().alert(APP_TITLE, msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
  return msg;
}

/** Pide el ID de la empresa (columna id de la hoja Empresas). Solo desde el menú. */
function askEmpresa_(ui, accion) {
  const list = readEmpresas_();
  const r = ui.prompt(APP_TITLE, accion + '\nEscribe el ID de la empresa:\n' + list.map(function (e) { return e.id + ' = ' + e.razon; }).join('\n'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  const id = Number(String(r.getResponseText()).trim());
  if (!list.some(function (e) { return e.id === id; })) { ui.alert(APP_TITLE, 'No existe la empresa ' + r.getResponseText(), ui.ButtonSet.OK); return null; }
  return id;
}

function generarReportesDesdeMenu() {
  const ui = SpreadsheetApp.getUi();
  const id = askEmpresa_(ui, 'Generar reportes contables y hoja de costeo.');
  if (!id) return;
  const r = generarReportes_(id, 'menú', true);
  ui.alert(APP_TITLE, 'Se actualizaron ' + r.hojas.length + ' hojas:\n' + r.hojas.join(', '), ui.ButtonSet.OK);
}

function mostrarEnlace() {
  const ui = SpreadsheetApp.getUi();
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) { /* sin implementar */ }
  ui.alert(APP_TITLE, url ? 'Enlace de la aplicación web:\n' + url : 'Todavía no hay una implementación. En el editor de Apps Script ve a Implementar → Nueva implementación → Aplicación web.', ui.ButtonSet.OK);
}

/** Solo desde el menú de la hoja (pide la empresa y confirmación). */
function restaurarDatosEjemplo() {
  const ui = SpreadsheetApp.getUi();
  const id = askEmpresa_(ui, 'Restaurar los datos de ejemplo (se reemplazan TODOS los datos de esa empresa).');
  if (!id) return;
  if (ui.alert(APP_TITLE, '¿Reemplazar todos los datos de la empresa ' + id + ' por los datos de ejemplo?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  withLock_(function () { writeDb_(id, exampleFor_(id), DB_KEYS); bumpRev_(id); });
  log_('menú', 'Restaurar datos de ejemplo', 'empresa ' + id);
  ui.alert(APP_TITLE, 'Se restauraron los datos de ejemplo.', ui.ButtonSet.OK);
}

/** Solo desde el menú de la hoja: vuelve a poner la contraseña uni2026 al usuario admin y lo reactiva. */
function restablecerAdmin() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert(APP_TITLE, '¿Restablecer el usuario admin con la contraseña uni2026?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const users = readUsers_();
  const u = users.filter(function (x) { return x.usuario === 'admin'; })[0];
  if (u) { u.hash = hash_('admin', 'uni2026'); u.activo = true; u.rol = 'ADMIN'; u.empresas = '*'; }
  else users.push({ usuario: 'admin', nombre: 'Administrador UNI', rol: 'ADMIN', activo: true, empresas: '*', hash: hash_('admin', 'uni2026') });
  writeUsers_(users);
  log_('menú', 'Restablecer admin', '');
  ui.alert(APP_TITLE, 'Usuario admin restablecido. Contraseña: uni2026', ui.ButtonSet.OK);
}

// =====================================================================================
// API pública para la página (google.script.run). Devuelven { error } si algo falla.
// =====================================================================================

function login(usuario, clave) {
  return api_(function () {
    ensureInstalled_();
    const name = String(usuario || '').trim().toLowerCase();
    const u = readUsers_().filter(function (x) { return x.usuario.toLowerCase() === name && x.activo; })[0];
    if (!u || u.hash !== hash_(u.usuario, String(clave || ''))) {
      Utilities.sleep(700);
      throw new Error('Usuario o contraseña incorrectos.');
    }
    const token = Utilities.getUuid();
    const user = { usuario: u.usuario, nombre: u.nombre, rol: u.rol, empresas: u.rol === 'ADMIN' ? '*' : u.empresas };
    CacheService.getScriptCache().put('s_' + token, JSON.stringify(user), SESSION_SECONDS);
    log_(u.usuario, 'Ingreso', '');
    return { token: token, user: { usuario: user.usuario, nombre: user.nombre, rol: user.rol }, empresas: empresasDe_(user) };
  });
}

function logout(token) {
  return api_(function () { if (token) CacheService.getScriptCache().remove('s_' + token); return { ok: true }; });
}

function listEmpresas(token) {
  return api_(function () { return empresasDe_(session_(token)); });
}

function openEmpresa(token, empId) {
  return api_(function () {
    const s = session_(token, null, empId);
    log_(s.usuario, 'Abrir empresa', String(empId));
    return readDb_(empId);
  });
}

function getDb(token, empId) {
  return api_(function () { session_(token, null, empId); return readDb_(empId); });
}

/** Guarda solo las colecciones que cambiaron. baseRev evita pisar cambios de otro usuario. */
function saveChanges(token, empId, changes, baseRev) {
  return api_(function () {
    const s = session_(token, 'write', empId);
    return withLock_(function () {
      const rev = getRev_(empId);
      const cur = readDb_(empId).db;
      if (Number(baseRev) !== rev) return { conflict: true, rev: rev, db: cur };
      const keys = Object.keys(changes || {}).filter(function (k) { return DB_KEYS.indexOf(k) >= 0; });
      if (!keys.length) return { rev: rev };
      if (cur.cierre && cur.cierre.realizado && keys.some(function (k) { return k !== 'cierre'; })) {
        throw new Error('El periodo está cerrado. Revierte el cierre para modificar datos.');
      }
      const next = {};
      Object.keys(cur).forEach(function (k) { next[k] = cur[k]; });
      keys.forEach(function (k) { next[k] = changes[k]; });
      const before = {};
      Engine.blockingErrors(cur).forEach(function (x) { before[x] = true; });
      const nuevos = Engine.blockingErrors(next).filter(function (x) { return !before[x]; });
      if (nuevos.length) throw new Error('No se puede grabar: ' + nuevos.join(' '));
      writeDb_(empId, next, keys);
      const nr = bumpRev_(empId);
      log_(s.usuario, 'Guardar', 'empresa ' + empId + ': ' + keys.join(', '));
      return { rev: nr };
    });
  });
}

function replaceDb(token, empId, db) {
  return api_(function () {
    const s = session_(token, 'admin', empId);
    if (!db || db.schema !== Engine.SCHEMA || !db.empresa) throw new Error('El archivo no corresponde a un backup de esta versión (V5).');
    Engine.compute(db);
    withLock_(function () { writeDb_(empId, db, DB_KEYS); bumpRev_(empId); });
    log_(s.usuario, 'Restaurar backup', 'empresa ' + empId);
    return readDb_(empId);
  });
}

function resetDemo(token, empId) {
  return api_(function () {
    const s = session_(token, 'admin', empId);
    withLock_(function () { writeDb_(empId, exampleFor_(empId), DB_KEYS); bumpRev_(empId); });
    log_(s.usuario, 'Restaurar datos de ejemplo', 'empresa ' + empId);
    return readDb_(empId);
  });
}

/** Crea una empresa. data.modo: 'vacia', 'ejemplo' o 'copia' (tablas maestras de la empresa fromId). */
function createEmpresa(token, fromId, data) {
  return api_(function () {
    const s = session_(token, 'admin');
    if (!data || String(data.razon || '').trim().length < 3) throw new Error('Escribe la razón social.');
    if (data.ruc && !/^\d{11}$/.test(String(data.ruc))) throw new Error('El RUC debe tener 11 dígitos.');
    if (data.periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(data.periodo))) throw new Error('El periodo debe tener el formato aaaa-mm.');
    const base = data.modo === 'copia' && fromId ? readDb_(fromId).db : null;
    const db = Engine.newCompanyDb(data, data.modo, base, function () { return Seed.create(); });
    const id = withLock_(function () {
      // Los ID nunca se reutilizan: así un usuario asignado a una empresa eliminada no hereda acceso a una nueva.
      const props = PropertiesService.getScriptProperties();
      const nid = Math.max(Number(props.getProperty('EMP_SEQ') || 0), readEmpresas_().reduce(function (m, e) { return Math.max(m, e.id); }, 0)) + 1;
      props.setProperty('EMP_SEQ', String(nid));
      writeDb_(nid, db, DB_KEYS);
      bumpRev_(nid);
      return nid;
    });
    log_(s.usuario, 'Crear empresa', id + ' ' + db.empresa.razon);
    return empresasDe_(s);
  });
}

function deleteEmpresa(token, currentId, id) {
  return api_(function () {
    const s = session_(token, 'admin');
    id = Number(id);
    if (id === Number(currentId)) throw new Error('No puedes eliminar la empresa que tienes abierta.');
    const list = readEmpresas_();
    if (!list.some(function (e) { return e.id === id; })) throw new Error('La empresa no existe.');
    if (list.length <= 1) throw new Error('Debe quedar al menos una empresa.');
    withLock_(function () {
      TABLES.forEach(function (t) { writeTable_(t, [], id); });
      writeEmpresas_(list.filter(function (e) { return e.id !== id; }));
      writeUsers_(readUsers_().map(function (u) {
        if (Array.isArray(u.empresas)) u.empresas = u.empresas.filter(function (n) { return n !== id; });
        return u;
      }));
      PropertiesService.getScriptProperties().deleteProperty('DB_REV_' + id);
      CacheService.getScriptCache().remove('db_' + id);
    });
    log_(s.usuario, 'Eliminar empresa', String(id));
    return empresasDe_(s);
  });
}

function getSheetInfo(token, empId) {
  return api_(function () {
    session_(token, null, empId);
    const ss = ss_();
    const tz = Session.getScriptTimeZone();
    const count = function (name) {
      return readObjects_(name, [{ k: 'empresaId', t: 'n' }], tz).filter(function (r) { return (r.empresaId || 1) === Number(empId); }).length;
    };
    const hojas = [
      { hoja: EMPRESAS_SHEET, contenido: 'Empresas: datos, parámetros y estado del cierre', filas: readEmpresas_().length },
      { hoja: USERS_SHEET, contenido: 'Usuarios, perfiles, empresas asignadas y contraseñas cifradas', filas: readUsers_().length },
      { hoja: LOG_SHEET, contenido: 'Bitácora de ingresos y cambios', filas: Math.max(0, (ss.getSheetByName(LOG_SHEET) ? ss.getSheetByName(LOG_SHEET).getLastRow() : 1) - 1) }
    ];
    TABLES.forEach(function (t) {
      hojas.push({ hoja: t.sheet, contenido: t.desc, filas: count(t.sheet) });
      if (t.child) hojas.push({ hoja: t.child.sheet, contenido: t.child.desc, filas: count(t.child.sheet) });
    });
    return { nombre: ss.getName(), url: ss.getUrl(), hojas: hojas };
  });
}

function generarReportes(token, empId) {
  return api_(function () {
    const s = session_(token, null, empId);
    return generarReportes_(empId, s.usuario, true);
  });
}

function generarCosteo(token, empId) {
  return api_(function () {
    const s = session_(token, null, empId);
    return generarReportes_(empId, s.usuario, false);
  });
}

function listUsers(token) {
  return api_(function () {
    session_(token, 'admin');
    return readUsers_().map(function (u) { return { usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo, empresas: u.rol === 'ADMIN' ? '*' : u.empresas }; });
  });
}

function saveUser(token, empId, data) {
  return api_(function () {
    const s = session_(token, 'admin');
    const usuario = String(data.usuario || '').trim();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) throw new Error('Usuario no válido (3 a 30 caracteres: letras, números, punto o guion).');
    if (ROLES.indexOf(data.rol) < 0) throw new Error('Perfil no válido.');
    const clave = String(data.clave || '');
    const users = readUsers_();
    const found = users.filter(function (u) { return u.usuario.toLowerCase() === usuario.toLowerCase(); })[0];
    if (data.nuevo && found) throw new Error('Ya existe el usuario ' + usuario + '.');
    if (!data.nuevo && !found) throw new Error('No existe el usuario ' + usuario + '.');
    if ((data.nuevo || clave) && clave.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
    const emps = data.rol === 'ADMIN' || data.empresas === '*' ? '*' : (Array.isArray(data.empresas) ? data.empresas.map(Number).filter(function (n) { return n > 0; }) : []);
    if (emps !== '*' && !emps.length) throw new Error('Asigna al menos una empresa al usuario.');
    const u = found || { usuario: usuario };
    u.nombre = String(data.nombre || '').trim() || usuario;
    u.rol = data.rol;
    u.activo = !!data.activo;
    u.empresas = emps;
    if (clave) u.hash = hash_(u.usuario, clave);
    if (!found) users.push(u);
    if (!users.some(function (x) { return x.rol === 'ADMIN' && x.activo; })) throw new Error('Debe quedar al menos un usuario ADMIN activo.');
    writeUsers_(users);
    log_(s.usuario, data.nuevo ? 'Crear usuario' : 'Editar usuario', usuario);
    return { ok: true };
  });
}

function deleteUser(token, empId, usuario) {
  return api_(function () {
    const s = session_(token, 'admin');
    if (String(usuario).toLowerCase() === s.usuario.toLowerCase()) throw new Error('No puedes eliminar tu propio usuario.');
    const users = readUsers_().filter(function (u) { return u.usuario.toLowerCase() !== String(usuario).toLowerCase(); });
    if (!users.some(function (x) { return x.rol === 'ADMIN' && x.activo; })) throw new Error('Debe quedar al menos un usuario ADMIN activo.');
    writeUsers_(users);
    log_(s.usuario, 'Eliminar usuario', usuario);
    return { ok: true };
  });
}

function changePassword(token, empId, actual, nueva) {
  return api_(function () {
    const s = session_(token);
    if (String(nueva || '').length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres.');
    const users = readUsers_();
    const u = users.filter(function (x) { return x.usuario === s.usuario; })[0];
    if (!u || u.hash !== hash_(u.usuario, String(actual || ''))) throw new Error('La contraseña actual no es correcta.');
    u.hash = hash_(u.usuario, String(nueva));
    writeUsers_(users);
    log_(s.usuario, 'Cambiar contraseña', '');
    return { ok: true };
  });
}

// =====================================================================================
// Sesión, seguridad y utilidades
// =====================================================================================

function api_(fn) {
  try { return fn(); } catch (e) { return { error: String((e && e.message) || e) }; }
}

/** Valida el token; need: 'write' o 'admin'; empId: empresa a la que se quiere acceder. */
function session_(token, need, empId) {
  const cache = CacheService.getScriptCache();
  const raw = token ? cache.get('s_' + token) : null;
  if (!raw) throw new Error('SESION_VENCIDA');
  const s = JSON.parse(raw);
  if (need === 'write' && s.rol === 'CONSULTA') throw new Error('Tu usuario es de solo consulta: no puede modificar datos.');
  if (need === 'admin' && s.rol !== 'ADMIN') throw new Error('Solo un usuario ADMIN puede hacer esta operación.');
  if (empId !== undefined && empId !== null && !canAccess_(s, empId)) throw new Error('Tu usuario no tiene acceso a esta empresa.');
  cache.put('s_' + token, raw, SESSION_SECONDS);
  return s;
}

function canAccess_(s, empId) {
  if (s.rol === 'ADMIN' || s.empresas === '*') return true;
  return Array.isArray(s.empresas) && s.empresas.indexOf(Number(empId)) >= 0;
}

function empresasDe_(s) {
  return readEmpresas_().filter(function (e) { return canAccess_(s, e.id); }).map(function (e) {
    return { id: e.id, razon: e.razon, ruc: e.ruc, periodo: e.periodo, actividad: e.actividad };
  });
}

function hash_(usuario, clave) {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('SALT', salt); }
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + String(usuario).toLowerCase() + '|' + clave, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('El sistema está ocupado guardando otro cambio. Intenta de nuevo en unos segundos.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function getRev_(empId) {
  return Number(PropertiesService.getScriptProperties().getProperty('DB_REV_' + Number(empId)) || 0);
}

function bumpRev_(empId) {
  const props = PropertiesService.getScriptProperties();
  const k = 'DB_REV_' + Number(empId);
  const r = Number(props.getProperty(k) || 0) + 1;
  props.setProperty(k, String(r));
  CacheService.getScriptCache().remove('db_' + Number(empId));
  return r;
}

function ss_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No se encontró la hoja de cálculo. Crea el proyecto desde Extensiones → Apps Script de tu Google Sheets y ejecuta instalar.');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_(name, create) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh && create) sh = ss.insertSheet(name);
  return sh;
}

function log_(usuario, accion, detalle) {
  try {
    const sh = sheet_(LOG_SHEET, true);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, 4).setValues([['fecha', 'usuario', 'accion', 'detalle']]).setFontWeight('bold').setBackground('#f6e8eb');
      sh.setFrozenRows(1);
    }
    sh.appendRow([Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'), usuario, accion, detalle]);
  } catch (e) { /* la bitácora nunca bloquea una operación */ }
}

// =====================================================================================
// Instalación y migración desde la versión de una sola empresa
// =====================================================================================

function ensureInstalled_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('INSTALLED') === '2' && sheet_(EMPRESAS_SHEET, false)) return;
  install_();
}

function install_() {
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const ss = ss_();
    let nueva = false;
    if (!ss.getSheetByName(EMPRESAS_SHEET)) {
      const old = ss.getSheetByName(OLD_CONFIG_SHEET);
      if (old && old.getLastRow() >= 2) {
        // Migración: la hoja Config (una sola empresa) pasa a ser la empresa 1.
        const db = Engine.emptyDb();
        readOldConfig_(db);
        writeEmpresas_([empresaRow_(1, db)]);
        ss.deleteSheet(old);
        const oldRev = props.getProperty('DB_REV');
        if (oldRev) props.setProperty('DB_REV_1', oldRev);
      } else {
        writeDb_(1, Seed.create(), DB_KEYS);
        bumpRev_(1);
        nueva = true;
      }
    }
    TABLES.forEach(function (t) {
      if (!ss.getSheetByName(t.sheet)) writeTable_(t, [], 1);
      else if (t.child && !ss.getSheetByName(t.child.sheet)) writeTable_(t, readDb_(1).db[t.key], 1);
    });
    if (!readUsers_().length) {
      writeUsers_([{ usuario: 'admin', nombre: 'Administrador UNI', rol: 'ADMIN', activo: true, empresas: '*', hash: hash_('admin', 'uni2026') }]);
    }
    ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (n) {
      const sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });
    props.setProperty('INSTALLED', '2');
    if (nueva) log_('sistema', 'Instalación', 'Base de datos creada con la empresa de ejemplo');
    return { nueva: nueva };
  });
}

function readOldConfig_(db) {
  const rows = readObjects_(OLD_CONFIG_SHEET, parseCols_(['clave:s', 'valor:s']), Session.getScriptTimeZone());
  const map = {};
  rows.forEach(function (r) { map[r.clave] = r.valor; });
  empresaFields_().forEach(function (f) {
    const k = 'empresa.' + f.k;
    if (!(k in map)) return;
    db.empresa[f.k] = f.t === 'n' ? Number(map[k]) || 0 : f.t === 'b' ? /^(true|verdadero|si|sí|1)$/i.test(map[k]) : map[k];
  });
  db.cierre = /^(true|verdadero|si|sí|1)$/i.test(map['cierre.realizado'] || '') ? { realizado: true, fecha: map['cierre.fecha'] || '' } : { realizado: false };
}

/** Datos de ejemplo para una empresa: se conserva su razón social y RUC si no es la empresa 1. */
function exampleFor_(empId) {
  const d = Seed.create();
  if (Number(empId) !== 1) {
    const e = readEmpresas_().filter(function (x) { return x.id === Number(empId); })[0];
    if (e) { d.empresa.razon = e.razon; d.empresa.ruc = e.ruc; }
  }
  return d;
}

// =====================================================================================
// Lectura y escritura de la base de datos (hojas)
// =====================================================================================

function parseCols_(cols) {
  return cols.map(function (c) { const p = c.split(':'); return { k: p[0], t: p[1] || 's' }; });
}

function tableCols_(t) { return parseCols_(['empresaId:n'].concat(t.cols)); }
function childCols_(t) { return parseCols_(['empresaId:n', t.child.fk + ':n', 'linea:n'].concat(t.child.cols)); }

function toCell_(v, t) {
  if (v === null || v === undefined) return t === 'b' ? false : '';
  if (t === 'b') return !!v;
  if (t === 'n' || t === 'nn') return typeof v === 'number' ? v : (v === '' ? '' : Number(v) || 0);
  return String(v);
}

function fromCell_(v, t, tz) {
  if (t === 'b') return v === true || /^(true|verdadero|si|sí|1|x)$/i.test(String(v).trim());
  if (t === 'n') return v === '' || v === null || v === undefined ? 0 : (Number(v) || 0);
  if (t === 'nn') return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v);
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
}

function writeRows_(name, headers, rows, types) {
  const sh = sheet_(name, true);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f6e8eb');
  sh.setFrozenRows(1);
  if (!rows.length) return sh;
  types.forEach(function (t, j) {
    // Texto y fechas como texto plano: así Sheets no convierte "1041" en número ni "2026-10-01" en fecha.
    if (t === 's' || t === 'd') sh.getRange(2, j + 1, rows.length, 1).setNumberFormat('@');
  });
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return sh;
}

function readObjects_(name, cols, tz) {
  const sh = sheet_(name, false);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const head = values[0].map(function (h) { return String(h).trim(); });
  const idx = cols.map(function (c) { return head.indexOf(c.k); });
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(function (v) { return v === '' || v === null; })) continue;
    const o = {};
    cols.forEach(function (c, j) { o[c.k] = fromCell_(idx[j] >= 0 ? row[idx[j]] : '', c.t, tz); });
    out.push(o);
  }
  return out;
}

/** Reescribe una hoja con las filas de una empresa, conservando las de las demás empresas. */
function writeRowsFor_(name, cols, empId, mine) {
  const tz = Session.getScriptTimeZone();
  const others = readObjects_(name, cols, tz)
    .map(function (r) { r.empresaId = r.empresaId || 1; return r; })
    .filter(function (r) { return r.empresaId !== Number(empId); });
  const all = others.concat(mine.map(function (r) { const o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; }); o.empresaId = Number(empId); return o; }));
  all.sort(function (a, b) { return a.empresaId - b.empresaId; });
  writeRows_(name, cols.map(function (c) { return c.k; }), all.map(function (r) {
    return cols.map(function (c) { return toCell_(r[c.k], c.t); });
  }), cols.map(function (c) { return c.t; }));
}

function writeTable_(t, rows, empId) {
  writeRowsFor_(t.sheet, tableCols_(t), empId, rows);
  if (!t.child) return;
  const kids = [];
  rows.forEach(function (r) {
    (r[t.child.prop] || []).forEach(function (k, i) {
      const o = {};
      Object.keys(k).forEach(function (x) { o[x] = k[x]; });
      o[t.child.fk] = r.id;
      o.linea = i + 1;
      kids.push(o);
    });
  });
  writeRowsFor_(t.child.sheet, childCols_(t), empId, kids);
}

function empresaFields_() {
  const base = Engine.emptyDb().empresa;
  const typeOf = function (v) { return typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's'; };
  return Object.keys(base).map(function (k) { return { k: k, t: typeOf(base[k]) }; });
}

function empresaCols_() {
  return [{ k: 'id', t: 'n' }].concat(empresaFields_()).concat([{ k: 'cierreRealizado', t: 'b' }, { k: 'cierreFecha', t: 's' }]);
}

function empresaRow_(id, db) {
  const r = { id: Number(id) };
  empresaFields_().forEach(function (f) { r[f.k] = db.empresa[f.k]; });
  r.cierreRealizado = !!(db.cierre && db.cierre.realizado);
  r.cierreFecha = db.cierre && db.cierre.realizado ? (db.cierre.fecha || '') : '';
  return r;
}

function readEmpresas_() {
  return readObjects_(EMPRESAS_SHEET, empresaCols_(), Session.getScriptTimeZone()).filter(function (e) { return e.id > 0; });
}

function writeEmpresas_(list) {
  const cols = empresaCols_();
  list.sort(function (a, b) { return a.id - b.id; });
  writeRows_(EMPRESAS_SHEET, cols.map(function (c) { return c.k; }), list.map(function (r) {
    return cols.map(function (c) { return toCell_(r[c.k], c.t); });
  }), cols.map(function (c) { return c.t; }));
}

function readDb_(empId) {
  empId = Number(empId);
  const cache = CacheService.getScriptCache();
  const rev = getRev_(empId);
  const hit = cache.get('db_' + empId);
  if (hit) {
    const c = JSON.parse(hit);
    if (c.rev === rev) return { db: c.db, rev: rev };
  }
  const tz = Session.getScriptTimeZone();
  const emp = readEmpresas_().filter(function (e) { return e.id === empId; })[0];
  if (!emp) throw new Error('La empresa ' + empId + ' no existe.');
  const db = Engine.emptyDb();
  empresaFields_().forEach(function (f) { db.empresa[f.k] = emp[f.k]; });
  db.cierre = emp.cierreRealizado ? { realizado: true, fecha: emp.cierreFecha } : { realizado: false };
  const mine = function (r) { return (r.empresaId || 1) === empId; };
  TABLES.forEach(function (t) {
    const rows = readObjects_(t.sheet, tableCols_(t), tz).filter(mine).map(function (r) { delete r.empresaId; return r; });
    if (t.child) {
      const by = {};
      readObjects_(t.child.sheet, childCols_(t), tz).filter(mine).forEach(function (k) {
        (by[k[t.child.fk]] = by[k[t.child.fk]] || []).push(k);
      });
      rows.forEach(function (r) {
        r[t.child.prop] = (by[r.id] || []).sort(function (a, b) { return a.linea - b.linea; }).map(function (k) {
          delete k[t.child.fk];
          delete k.linea;
          delete k.empresaId;
          return t.child.shape ? t.child.shape(k) : k;
        });
      });
    }
    db[t.key] = rows;
  });
  const json = JSON.stringify({ rev: rev, db: db });
  if (json.length < 90000) { try { cache.put('db_' + empId, json, CACHE_SECONDS); } catch (e) { /* caché llena */ } }
  return { db: db, rev: rev };
}

function writeDb_(empId, db, keys) {
  empId = Number(empId);
  if (keys.indexOf('empresa') >= 0 || keys.indexOf('cierre') >= 0) {
    const list = readEmpresas_().filter(function (e) { return e.id !== empId; });
    list.push(empresaRow_(empId, db));
    writeEmpresas_(list);
  }
  TABLES.forEach(function (t) { if (keys.indexOf(t.key) >= 0) writeTable_(t, db[t.key] || [], empId); });
  CacheService.getScriptCache().remove('db_' + empId);
}

function readUsers_() {
  return readObjects_(USERS_SHEET, parseCols_(['usuario:s', 'nombre:s', 'rol:s', 'activo:b', 'empresas:s', 'hash:s']), Session.getScriptTimeZone())
    .filter(function (u) { return u.usuario; })
    .map(function (u) {
      const raw = String(u.empresas || '').trim();
      // Usuarios de la versión anterior (sin columna empresas): ADMIN a todas, el resto a la empresa 1.
      u.empresas = raw === '*' || (!raw && u.rol === 'ADMIN') ? '*' : !raw ? [1] : raw.split(/[,; ]+/).map(Number).filter(function (n) { return n > 0; });
      return u;
    });
}

function writeUsers_(users) {
  writeRows_(USERS_SHEET, ['usuario', 'nombre', 'rol', 'activo', 'empresas', 'hash'], users.map(function (u) {
    const emps = u.empresas === '*' ? '*' : (u.empresas || []).join(',');
    return [u.usuario, u.nombre, u.rol, !!u.activo, emps || 'ninguna', u.hash];
  }), ['s', 's', 's', 'b', 's', 's']);
}

// =====================================================================================
// Reportes contables (R_) y hoja de cálculo de costeo (C_)
// =====================================================================================

const FMT_ = { m: '#,##0.00', q: '#,##0.00##', c: '#,##0.0000', p: '0.00%' };

function report_(name, title, sub, header, types, rows) {
  const sh = sheet_(name, true);
  sh.clear();
  sh.getRange(1, 1).setValue(title).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setValue(sub);
  sh.getRange(4, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#f6e8eb');
  sh.setFrozenRows(4);
  if (!rows.length) return name;
  const data = rows.map(function (r) {
    return header.map(function (_, j) {
      const v = r[j];
      if (v === null || v === undefined || v === '') return '';
      return FMT_[types[j]] && typeof v === 'number' ? v : (FMT_[types[j]] && !isNaN(Number(v)) ? Number(v) : String(v));
    });
  });
  types.forEach(function (t, j) { sh.getRange(5, j + 1, data.length, 1).setNumberFormat(FMT_[t] || '@'); });
  sh.getRange(5, 1, data.length, header.length).setValues(data);
  return name;
}

function stmtRows_(lines) {
  return lines.map(function (x) { return [x[0], x[1] === undefined ? '' : x[1]]; });
}

/** Escribe los reportes de una empresa. contables=false: solo la hoja de cálculo de costeo (C_). */
function generarReportes_(empId, usuario, contables) {
  const db = readDb_(empId).db;
  const c = Engine.compute(db);
  const e = db.empresa;
  const sub = e.razon + ' · RUC ' + e.ruc + ' · Periodo ' + e.periodo + ' · Expresado en soles (S/)';
  const hojas = [];

  if (contables) {
    const T = function (n) { return Math.round(n * 100) / 100; };
    const cash = function (x) { return x.lines.some(function (l) { return l.cuenta.indexOf('10') === 0; }) && x.origen.kind !== 'apertura'; };
    const diario = [];
    c.entries.forEach(function (x) {
      x.lines.forEach(function (l) { diario.push([x.num, x.fecha, x.glosa, x.origen.label, cash(x) ? (x.actividad || 'Operación') : '', l.cuenta, c.accName(l.cuenta), l.aux, l.debe || '', l.haber || '']); });
    });
    diario.push(['', '', 'TOTALES', '', '', '', '', '', Engine.sumBy(c.entries, 'debe'), Engine.sumBy(c.entries, 'haber')]);
    hojas.push(report_('R_LibroDiario', 'LIBRO DIARIO', sub, ['N° asiento', 'Fecha', 'Glosa', 'Origen', 'Actividad', 'Cuenta', 'Denominación', 'Auxiliar', 'Debe', 'Haber'], ['t', 't', 't', 't', 't', 't', 't', 't', 'm', 'm'], diario));

    const mayor = [];
    Object.keys(c.L).sort().forEach(function (code) {
      const a = c.L[code];
      let s = 0;
      a.movs.forEach(function (m) { s = T(s + m.debe - m.haber); mayor.push([code, c.accName(code), m.num, m.fecha, m.glosa, m.debe || '', m.haber || '', s]); });
      mayor.push([code, 'Total cuenta ' + code, '', '', '', a.debe, a.haber, a.saldo]);
    });
    hojas.push(report_('R_LibroMayor', 'LIBRO MAYOR', sub, ['Cuenta', 'Denominación', 'N° asiento', 'Fecha', 'Glosa', 'Debe', 'Haber', 'Saldo (D-H)'], ['t', 't', 't', 't', 't', 'm', 'm', 'm'], mayor));

    const bc = Engine.balanceComprobacion(c);
    const keys = ['debe', 'haber', 'deudor', 'acreedor', 'activo', 'pasivo', 'perdidaN', 'gananciaN', 'perdidaF', 'gananciaF'];
    const bcr = bc.rows.map(function (r) { return [r.codigo, r.nombre].concat(keys.map(function (k) { return r[k] || ''; })); });
    bcr.push(['', 'TOTALES'].concat(keys.map(function (k) { return bc.tot[k]; })));
    bcr.push(['', 'Resultado (inventario / naturaleza / función)', '', '', '', '', bc.resInventario, '', bc.resNaturaleza, '', bc.resFuncion, '']);
    hojas.push(report_('R_BalanceComprobacion', 'BALANCE DE COMPROBACIÓN', sub, ['Cuenta', 'Denominación', 'Debe', 'Haber', 'Saldo deudor', 'Saldo acreedor', 'Activo', 'Pasivo y patrimonio', 'Pérdidas (naturaleza)', 'Ganancias (naturaleza)', 'Pérdidas (función)', 'Ganancias (función)'], ['t', 't', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm'], bcr));

    // Kardex
    const TIPO = { '16': 'Saldo inicial', '02': 'Compra', '10': 'Salida a producción', '19': 'Entrada de producción', '01': 'Venta' };
    const kx = [];
    Object.keys(c.kMat.items).map(function (k) { return c.kMat.items[k]; }).concat(Object.keys(c.kPT.items).map(function (k) { return c.kPT.items[k]; })).forEach(function (it) {
      it.rows.forEach(function (r) {
        kx.push([it.clase + ' ' + it.codigo + ' ' + it.nombre, it.cuenta, r.fecha, r.tipoOp + ' ' + (TIPO[r.tipoOp] || ''), r.doc, r.detalle, r.eCant, r.eCU, r.eTot, r.oCant, r.oCU, r.oTot, r.sCant, r.sCU, r.sTot]);
      });
    });
    hojas.push(report_('R_Kardex', 'KARDEX VALORIZADO (' + (e.metodo === 'PEPS' ? 'PEPS' : 'PROMEDIO PONDERADO') + ')', sub, ['Existencia', 'Cuenta', 'Fecha', 'Tipo de operación', 'Documento', 'Detalle', 'Entrada cant.', 'Entrada C.U.', 'Entrada total', 'Salida cant.', 'Salida C.U.', 'Salida total', 'Saldo cant.', 'Saldo C.U.', 'Saldo total'], ['t', 't', 't', 't', 't', 't', 'q', 'q', 'm', 'q', 'q', 'm', 'q', 'q', 'm'], kx));

    // Hoja de costos por O/T
    const hc = [];
    Object.keys(c.cost.porOT).forEach(function (id) {
      const R = c.cost.porOT[id];
      const p = Engine.byId(db.productos, R.ot.productoId);
      const ot = R.ot.numero;
      hc.push([ot, 'O/T', (p ? p.nombre : '') + ' · ' + R.ot.cantidad + ' und · ' + R.ot.estado + ' · Cliente: ' + (R.ot.cliente || '-'), '', '', '']);
      R.mdDet.forEach(function (d) { hc.push([ot, 'Materia prima directa', d.numero + ' ' + d.material, d.cantidad, d.cu, d.total]); });
      R.modDet.forEach(function (d) { hc.push([ot, 'Mano de obra directa', d.trabajador + ' (' + d.cargo + ')', d.horas, d.tarifa, d.total]); });
      R.cifDet.forEach(function (d) { hc.push([ot, 'CIF', d.codigo + ' ' + d.concepto + ' · ' + d.inductor, d.base, d.tasa, d.total]); });
      hc.push([ot, 'TOTAL', 'MD ' + R.md + ' + MOD ' + R.mod + ' + CIF ' + R.cif, R.ot.cantidad, R.unit, R.total]);
    });
    hojas.push(report_('R_HojaCostos', 'HOJAS DE COSTOS POR ORDEN DE TRABAJO', sub, ['O/T', 'Elemento', 'Detalle', 'Cantidad / horas / base', 'C.U. / tarifa / tasa', 'Importe'], ['t', 't', 't', 'q', 'q', 'm'], hc));

    // Distribución de CIF
    const ots = db.ordenes;
    const dc = c.cost.pools.map(function (p) {
      return [p.concepto.codigo + ' ' + p.concepto.nombre, p.inductor ? p.inductor.nombre : '-', p.monto, p.baseTotal, p.tasa].concat(p.asignado);
    });
    hojas.push(report_('R_DistribucionCIF', 'DISTRIBUCIÓN DE CIF CON INDUCTORES', sub, ['Concepto CIF', 'Inductor', 'CIF real', 'Base total', 'Tasa'].concat(ots.map(function (o) { return o.numero; })), ['t', 't', 'm', 'q', 'q'].concat(ots.map(function () { return 'm'; })), dc));

    // Planilla
    const DEST = { MOD: '921 MOD', MOI: '931 CIF', ADM: '941 Administración', VEN: '951 Ventas' };
    const pl = c.pl.map(function (w) { return [w.dni, w.nombre, w.cargo, w.clasificacion, w.basico, w.af, w.bruto, w.onp, w.afp, w.renta5, w.desc, w.neto, w.essalud, w.costo, DEST[w.clasificacion] || '']; });
    pl.push(['', 'TOTAL', '', '', Engine.sumBy(c.pl, 'basico'), Engine.sumBy(c.pl, 'af'), Engine.sumBy(c.pl, 'bruto'), Engine.sumBy(c.pl, 'onp'), Engine.sumBy(c.pl, 'afp'), Engine.sumBy(c.pl, 'renta5'), Engine.sumBy(c.pl, 'desc'), Engine.sumBy(c.pl, 'neto'), Engine.sumBy(c.pl, 'essalud'), Engine.sumBy(c.pl, 'costo'), '']);
    hojas.push(report_('R_Planilla', 'PLANILLA DE REMUNERACIONES', sub, ['DNI', 'Trabajador', 'Cargo', 'Clasificación', 'Básico', 'Asig. familiar', 'Total remuneración', 'ONP', 'AFP', 'Renta 5ta', 'Total descuentos', 'Neto a pagar', 'EsSalud', 'Costo laboral', 'Cuenta de destino'], ['t', 't', 't', 't', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 't'], pl));

    const es = Engine.estadoSituacion(c);
    const esl = [];
    const sec = function (title, list, total) {
      esl.push([title]);
      list.forEach(function (r) { esl.push(['   ' + r.rubro, r.valor]); });
      esl.push(['Total ' + title.toLowerCase(), total]);
    };
    sec('ACTIVO CORRIENTE', es.AC, es.tAC); sec('ACTIVO NO CORRIENTE', es.ANC, es.tANC); esl.push(['TOTAL ACTIVO', es.tActivo]);
    sec('PASIVO CORRIENTE', es.PC, es.tPC); sec('PASIVO NO CORRIENTE', es.PNC, es.tPNC); esl.push(['TOTAL PASIVO', es.tPasivo]);
    sec('PATRIMONIO', es.PAT, es.tPAT); esl.push(['TOTAL PASIVO Y PATRIMONIO', es.tPasPat]);
    hojas.push(report_('R_EstadoSituacion', 'ESTADO DE SITUACIÓN FINANCIERA', sub, ['Concepto', 'Importe'], ['t', 'm'], stmtRows_(esl)));

    const rf = Engine.resultadosFuncion(c), rn = Engine.resultadosNaturaleza(c);
    const er = [['POR FUNCIÓN'], ['Ventas netas', rf.ventas], ['(-) Costo de ventas', -rf.cv], ['UTILIDAD BRUTA', rf.ub], ['(-) Gastos de administración', -rf.ga], ['(-) Gastos de ventas', -rf.gv],
      ['(-) Costos de producción no absorbidos', -rf.noAbs], ['UTILIDAD OPERATIVA', rf.uo], ['(-) Gastos financieros', -rf.gf], ['(+) Otros ingresos', rf.otrosIng], ['(±) Otros no destinados', rf.otros],
      ['RESULTADO ANTES DEL IMPUESTO A LA RENTA', rf.rai], ['(-) Impuesto a la renta', -rf.ir], ['RESULTADO NETO', rf.neto], [''],
      ['POR NATURALEZA'], ['Ventas netas (70)', rn.ventas], ['(-) Costo de ventas (69)', -rn.cv], ['(+) Variación de la producción almacenada (71)', rn.varProd], ['PRODUCCIÓN DEL EJERCICIO', rn.produccion],
      ['(-) Consumo de materias primas y materiales (60 + 61)', -rn.consumo], ['(-) Servicios prestados por terceros (63)', -rn.servicios], ['VALOR AGREGADO', rn.va], ['(-) Gastos de personal (62)', -rn.personal],
      ['(-) Tributos (64)', -rn.tributos], ['EXCEDENTE BRUTO DE EXPLOTACIÓN', rn.ebe], ['(-) Depreciación y provisiones (68)', -rn.deprec], ['(±) Otros ingresos y gastos', rn.otros],
      ['RESULTADO ANTES DEL IMPUESTO A LA RENTA', rn.rai], ['(-) Impuesto a la renta (88)', -rn.ir], ['RESULTADO DEL EJERCICIO', rn.neto]];
    hojas.push(report_('R_EstadoResultados', 'ESTADO DE RESULTADOS', sub, ['Concepto', 'Importe'], ['t', 'm'], stmtRows_(er)));

    const f = Engine.flujoEfectivo(c);
    const fl = [];
    f.secciones.forEach(function (s) {
      fl.push(['ACTIVIDADES DE ' + s.actividad.toUpperCase()]);
      s.lineas.forEach(function (x) { fl.push(['   ' + x.concepto, x.monto]); });
      fl.push(['Flujo neto de actividades de ' + s.actividad.toLowerCase(), s.neto]);
    });
    fl.push(['AUMENTO (DISMINUCIÓN) NETO DEL EFECTIVO', f.aumento], ['Saldo de efectivo al inicio', f.saldoInicial], ['SALDO DE EFECTIVO AL FINAL', f.saldoFinal]);
    hojas.push(report_('R_FlujoEfectivo', 'ESTADO DE FLUJO DE EFECTIVO (MÉTODO DIRECTO)', sub, ['Concepto', 'Importe'], ['t', 'm'], stmtRows_(fl)));

    // Estado de costo de producción y ventas
    const x = Engine.estadoCostos(c);
    const ec = [['Inventario inicial de materias primas', x.iiMP], ['(+) Compras de materias primas', x.comprasMP], ['(-) Inventario final de materias primas', -x.ifMP], ['Materia prima consumida', x.consumoMP],
      ['Materia prima directa (MD)', x.md], ['Mano de obra directa (MOD)', x.mod]]
      .concat(x.cifDet.map(function (d) { return ['   ' + d.concepto, d.monto]; }))
      .concat([['Costos indirectos de fabricación (CIF)', x.cif], ['COSTO DE PRODUCCIÓN DEL PERIODO', x.costoProd], ['(+) Inventario inicial de productos en proceso', x.iiPP], ['(-) Inventario final de productos en proceso', -x.ifPP],
        ['COSTO DE PRODUCCIÓN TERMINADA', x.cpt], ['(+) Inventario inicial de productos terminados', x.iiPT], ['(-) Inventario final de productos terminados', -x.ifPT], ['COSTO DE VENTAS', x.costoVentas]]);
    hojas.push(report_('R_EstadoCostos', 'ESTADO DE COSTO DE PRODUCCIÓN Y DE VENTAS', sub, ['Concepto', 'Importe'], ['t', 'm'], stmtRows_(ec)));

    const rt = Engine.ratios(c);
    hojas.push(report_('R_Ratios', 'RATIOS FINANCIEROS', sub, ['Grupo', 'Ratio', 'Fórmula', 'Cálculo', 'Resultado', 'Situación', 'Lectura'], ['t', 't', 't', 't', 'c', 't', 't'],
      rt.map(function (x) { return [x.grupo, x.nombre, x.formula, x.calculo, x.valor === null ? '' : x.valor, { ok: 'Favorable', warn: 'En observación', bad: 'Desfavorable' }[x.estado] || '', x.lectura]; })));
  }

  // Hoja de cálculo de costeo: una hoja C_ por cada pestaña de Engine.costeoSheets
  Engine.costeoSheets(c).forEach(function (s) {
    hojas.push(report_('C_' + s.name, s.title.toUpperCase(), sub, s.cols.map(function (x) { return x.l; }), s.cols.map(function (x) { return x.t; }), s.rows.map(function (r) { return r.c; })));
  });

  log_(usuario, contables ? 'Generar reportes' : 'Generar hoja de costeo', 'empresa ' + empId);
  return { url: ss_().getUrl(), hojas: hojas };
}
