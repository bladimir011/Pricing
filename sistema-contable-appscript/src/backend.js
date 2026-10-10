/*
 * Conector de almacenamiento para Google Apps Script (multiempresa).
 * La interfaz (js_app) llama a estas funciones; aquí se traducen a google.script.run (Code.gs),
 * que guarda todo en la hoja de cálculo de Google Sheets.
 */
(function () {
  'use strict';
  let token = null, empId = null, rev = 0, hooks = {}, queue = Promise.resolve();

  function call(fn, args) {
    return new Promise((resolve, reject) => {
      const runner = google.script.run
        .withSuccessHandler(r => {
          if (r && r.error) {
            if (r.error === 'SESION_VENCIDA') {
              if (hooks.expired) hooks.expired();
              return reject(new Error('Tu sesión venció. Vuelve a ingresar.'));
            }
            return reject(new Error(r.error));
          }
          resolve(r);
        })
        .withFailureHandler(e => reject(new Error((e && e.message) || String(e))));
      runner[fn].apply(runner, args);
    });
  }

  const status = s => { if (hooks.status) hooks.status(s); };

  window.AppBackend = {
    label: 'Google Sheets (base de datos compartida)',
    features: ['empresas', 'sheets', 'usuarios'],
    setHooks(h) { hooks = h || {}; },

    /** Devuelve el usuario y las empresas a las que tiene acceso. */
    async login(usuario, clave) {
      const r = await call('login', [usuario, clave]);
      token = r.token;
      empId = null;
      rev = 0;
      return { user: r.user, empresas: r.empresas };
    },

    logout() {
      if (token) call('logout', [token]).catch(() => {});
      token = null;
      empId = null;
    },

    /** Abre una empresa (espera a que terminen de guardarse los cambios de la anterior). */
    async open(id) {
      await queue;
      const r = await call('openEmpresa', [token, Number(id)]);
      empId = Number(id);
      rev = r.rev;
      return r.db;
    },

    current: () => empId,

    /** Guarda en segundo plano y en orden. Si otro usuario cambió los datos, se recargan los más recientes. */
    save(changes) {
      const emp = empId;
      status('saving');
      queue = queue.then(async () => {
        try {
          const r = await call('saveChanges', [token, emp, changes, rev]);
          if (emp !== empId) return status('saved');
          rev = r.rev;
          if (r.conflict && hooks.reload) {
            hooks.reload(r.db, 'Otro usuario modificó la información mientras trabajabas. Se cargaron los datos más recientes; revisa si tu último cambio quedó registrado y, si no, vuelve a hacerlo.');
          }
          status('saved');
        } catch (e) {
          status('error');
          if (hooks.error) hooks.error('No se pudo guardar en Google Sheets: ' + e.message);
          try {
            const r = await call('getDb', [token, emp]);
            if (emp === empId) {
              rev = r.rev;
              if (hooks.reload) hooks.reload(r.db);
            }
          } catch (e2) { /* sin conexión: se mantiene lo que hay en pantalla */ }
        }
      });
      return queue;
    },

    async replace(db) {
      await queue;
      const r = await call('replaceDb', [token, empId, db]);
      rev = r.rev;
      return r.db;
    },

    async reset() {
      await queue;
      const r = await call('resetDemo', [token, empId]);
      rev = r.rev;
      return r.db;
    },

    async listEmpresas() {
      return call('listEmpresas', [token]);
    },

    /** data.modo: 'vacia', 'ejemplo' o 'copia' (copia las tablas maestras de la empresa abierta). */
    async createEmpresa(data) {
      await queue;
      return call('createEmpresa', [token, empId, data]);
    },

    async deleteEmpresa(id) {
      await queue;
      return call('deleteEmpresa', [token, empId, Number(id)]);
    },

    /** Otras operaciones del servidor (usuarios, reportes). Se agregan solos el token y la empresa abierta. */
    api(fn, ...args) {
      return queue.then(() => call(fn, [token, empId].concat(args)));
    }
  };
})();
