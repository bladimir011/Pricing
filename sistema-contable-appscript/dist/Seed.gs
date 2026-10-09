/* Datos de ejemplo · generado por build.js desde sistema-contable/public/js/seed.js. No editar aquí: editar el original. */
/*
 * Datos de ejemplo (ficticios) de OMEGA SAC, fabricante de muebles, periodo octubre 2026.
 * Todos los nombres, RUC y montos son referenciales para la demostración del curso.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(() => require('./engine.js'));
  else root.Seed = factory(() => root.Engine);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (getEngine) {
  'use strict';

  // El motor se obtiene al usarlo (en Apps Script los archivos pueden cargarse en cualquier orden).
  function create() {
    const Engine = getEngine();
    const db = Engine.emptyDb();
    Object.assign(db.empresa, {
      razon: 'OMEGA SAC', ruc: '20000000001', direccion: 'Av. Industrial 123, Lima',
      actividad: 'Fabricación de muebles de madera', periodo: '2026-10', metodo: 'PROMEDIO', cajaInicial: 60000
    });

    db.cuentas = [
      { id: 1, codigo: '1011', nombre: 'Caja' },
      { id: 2, codigo: '6391', nombre: 'Gastos bancarios' }
    ];

    db.inductores = [
      { id: 1, codigo: 'IND-01', nombre: 'Unidades producidas', unidad: 'und', fuente: 'UNIDADES' },
      { id: 2, codigo: 'IND-02', nombre: 'Horas de mano de obra directa', unidad: 'h-MOD', fuente: 'HORAS_MOD' },
      { id: 3, codigo: 'IND-03', nombre: 'Horas máquina', unidad: 'h-máq', fuente: 'MANUAL' },
      { id: 4, codigo: 'IND-04', nombre: 'Consumo de energía', unidad: 'kWh', fuente: 'MANUAL' }
    ];

    db.conceptosCIF = [
      { id: 1, codigo: 'CIF-01', nombre: 'Materiales indirectos', inductorId: 1, comportamiento: 'VARIABLE' },
      { id: 2, codigo: 'CIF-02', nombre: 'Mano de obra indirecta', inductorId: 2, comportamiento: 'FIJO' },
      { id: 3, codigo: 'CIF-03', nombre: 'Energía eléctrica de planta', inductorId: 4, comportamiento: 'VARIABLE' },
      { id: 4, codigo: 'CIF-04', nombre: 'Depreciación de maquinaria', inductorId: 3, comportamiento: 'FIJO' },
      { id: 5, codigo: 'CIF-05', nombre: 'Alquiler de planta', inductorId: 2, comportamiento: 'FIJO' },
      { id: 6, codigo: 'CIF-06', nombre: 'Mantenimiento de maquinaria', inductorId: 3, comportamiento: 'FIJO' }
    ];

    db.materiales = [
      { id: 1, codigo: 'MP-001', nombre: 'Madera tornillo', unidad: 'pie²', tipo: 'MP' },
      { id: 2, codigo: 'MP-002', nombre: 'Tablero MDF 18 mm', unidad: 'plancha', tipo: 'MP' },
      { id: 3, codigo: 'MP-003', nombre: 'Tela para tapiz', unidad: 'm', tipo: 'MP' },
      { id: 4, codigo: 'MI-001', nombre: 'Cola sintética', unidad: 'galón', tipo: 'MI', cifId: 1 },
      { id: 5, codigo: 'MI-002', nombre: 'Kit de lijas y clavos', unidad: 'kit', tipo: 'MI', cifId: 1 }
    ];

    db.productos = [
      { id: 1, codigo: 'PT-001', nombre: 'Mesa de comedor', unidad: 'und' },
      { id: 2, codigo: 'PT-002', nombre: 'Silla tapizada', unidad: 'und' }
    ];

    db.activos = [
      { id: 1, codigo: 'AF-001', nombre: 'Maquinaria de carpintería', cuenta: '3331', costo: 48000, fecha: '2026-09-30', tasa: 10, area: 'PRODUCCION', cifId: 4 },
      { id: 2, codigo: 'AF-002', nombre: 'Equipos de cómputo', cuenta: '3361', costo: 6000, fecha: '2026-09-30', tasa: 25, area: 'ADMINISTRACION' },
      { id: 3, codigo: 'AF-003', nombre: 'Muebles de sala de ventas', cuenta: '3351', costo: 3600, fecha: '2026-09-30', tasa: 10, area: 'VENTAS' },
      { id: 4, codigo: 'AF-004', nombre: 'Sierra circular industrial', cuenta: '3331', costo: 3500, fecha: '2026-10-18', tasa: 10, area: 'PRODUCCION', cifId: 4 }
    ];

    db.inventarioInicial = [{ id: 1, materialId: 1, cantidad: 500, costoUnit: 6 }];

    db.ordenes = [
      { id: 1, numero: 'OT-001', productoId: 1, cliente: 'Hotel Los Andes SAC', cantidad: 20, fechaInicio: '2026-10-02', fechaFin: '2026-10-24', estado: 'TERMINADA' },
      { id: 2, numero: 'OT-002', productoId: 2, cliente: 'Inversiones Casa Bonita SAC', cantidad: 80, fechaInicio: '2026-10-05', fechaFin: '2026-10-28', estado: 'TERMINADA' },
      { id: 3, numero: 'OT-003', productoId: 1, cliente: 'Stock para tienda', cantidad: 10, fechaInicio: '2026-10-20', fechaFin: '', estado: 'EN PROCESO' }
    ];

    const srv = (descripcion, cuenta, destino, monto, cifId) => ({ tipo: 'SERVICIO', descripcion, cuenta, destino, monto, cifId: cifId || null });
    const mat = (materialId, cantidad, costoUnit) => ({ tipo: 'MATERIAL', materialId, cantidad, costoUnit });
    db.compras = [
      { id: 1, fecha: '2026-10-01', tipoDoc: '01', documento: 'F001-00320', proveedor: 'Inmobiliaria Industrial Norte SAC', ruc: '20000000101', condicion: 'CREDITO',
        items: [srv('Alquiler de planta', '635', 'CIF', 3000, 5), srv('Alquiler de oficina administrativa', '635', 'ADM', 800), srv('Alquiler de sala de ventas', '635', 'VEN', 1200)] },
      { id: 2, fecha: '2026-10-02', tipoDoc: '01', documento: 'F001-00451', proveedor: 'Maderera San Martín SAC', ruc: '20000000102', condicion: 'CREDITO', items: [mat(1, 1500, 6.2)] },
      { id: 3, fecha: '2026-10-03', tipoDoc: '01', documento: 'F002-00120', proveedor: 'Tableros del Sur SAC', ruc: '20000000103', condicion: 'CREDITO', items: [mat(2, 60, 145)] },
      { id: 4, fecha: '2026-10-04', tipoDoc: '01', documento: 'F001-00877', proveedor: 'Textiles Lima SAC', ruc: '20000000104', condicion: 'CONTADO', items: [mat(3, 200, 22)] },
      { id: 5, fecha: '2026-10-05', tipoDoc: '01', documento: 'F003-00231', proveedor: 'Ferretería Industrial SAC', ruc: '20000000105', condicion: 'CONTADO', items: [mat(4, 20, 35), mat(5, 50, 18)] },
      { id: 6, fecha: '2026-10-10', tipoDoc: '01', documento: 'F001-01544', proveedor: 'Medios Publicitarios SAC', ruc: '20000000106', condicion: 'CREDITO', items: [srv('Campaña publicitaria en redes', '637', 'VEN', 900)] },
      { id: 7, fecha: '2026-10-15', tipoDoc: '01', documento: 'F001-00470', proveedor: 'Maderera San Martín SAC', ruc: '20000000102', condicion: 'CREDITO', items: [mat(1, 800, 6.5)] },
      { id: 8, fecha: '2026-10-18', tipoDoc: '01', documento: 'F004-00090', proveedor: 'Maquinarias Perú SAC', ruc: '20000000107', condicion: 'CONTADO',
        items: [{ tipo: 'ACTIVO', descripcion: 'Sierra circular industrial', cuenta: '3331', monto: 3500 }] },
      { id: 9, fecha: '2026-10-20', tipoDoc: '01', documento: 'F001-00610', proveedor: 'Servicios Técnicos Industriales SAC', ruc: '20000000108', condicion: 'CREDITO', items: [srv('Mantenimiento preventivo de maquinaria', '634', 'CIF', 650, 6)] },
      { id: 10, fecha: '2026-10-31', tipoDoc: '14', documento: 'S001-09876', proveedor: 'Empresa de Distribución Eléctrica SA', ruc: '20000000109', condicion: 'CREDITO',
        items: [srv('Energía eléctrica - planta', '6361', 'CIF', 1450, 3), srv('Energía eléctrica - oficinas', '6361', 'ADM', 180), srv('Energía eléctrica - sala de ventas', '6361', 'VEN', 120)] }
    ];

    db.requisiciones = [
      { id: 1, fecha: '2026-10-03', numero: 'RQ-001', otId: 1, materialId: 1, cantidad: 600 },
      { id: 2, fecha: '2026-10-03', numero: 'RQ-002', otId: 1, materialId: 2, cantidad: 20 },
      { id: 3, fecha: '2026-10-06', numero: 'RQ-003', otId: 2, materialId: 1, cantidad: 800 },
      { id: 4, fecha: '2026-10-06', numero: 'RQ-004', otId: 2, materialId: 3, cantidad: 160 },
      { id: 5, fecha: '2026-10-08', numero: 'RQ-005', otId: 2, materialId: 2, cantidad: 16 },
      { id: 6, fecha: '2026-10-12', numero: 'RQ-006', otId: null, materialId: 4, cantidad: 12 },
      { id: 7, fecha: '2026-10-12', numero: 'RQ-007', otId: null, materialId: 5, cantidad: 30 },
      { id: 8, fecha: '2026-10-21', numero: 'RQ-008', otId: 3, materialId: 1, cantidad: 400 },
      { id: 9, fecha: '2026-10-21', numero: 'RQ-009', otId: 3, materialId: 2, cantidad: 10 }
    ];

    db.trabajadores = [
      { id: 1, dni: '40000001', nombre: 'Juan Quispe', cargo: 'Carpintero', clasificacion: 'MOD', sueldo: 1800, sistema: 'ONP', asigFam: true, renta5: 0 },
      { id: 2, dni: '40000002', nombre: 'Pedro Huamán', cargo: 'Tapicero', clasificacion: 'MOD', sueldo: 1600, sistema: 'AFP', asigFam: false, renta5: 0 },
      { id: 3, dni: '40000003', nombre: 'Luis Rojas', cargo: 'Ayudante de producción', clasificacion: 'MOD', sueldo: 1300, sistema: 'AFP', asigFam: true, renta5: 0 },
      { id: 4, dni: '40000004', nombre: 'Rosa Díaz', cargo: 'Supervisora de planta', clasificacion: 'MOI', sueldo: 3200, sistema: 'AFP', asigFam: false, renta5: 0, cifId: 2 },
      { id: 5, dni: '40000005', nombre: 'Carlos Mendoza', cargo: 'Contador', clasificacion: 'ADM', sueldo: 4000, sistema: 'AFP', asigFam: false, renta5: 0 },
      { id: 6, dni: '40000006', nombre: 'Ana Torres', cargo: 'Vendedora', clasificacion: 'VEN', sueldo: 2200, sistema: 'ONP', asigFam: true, renta5: 0 }
    ];

    db.horas = [
      { id: 1, trabajadorId: 1, otId: 1, horas: 100 }, { id: 2, trabajadorId: 1, otId: 2, horas: 60 }, { id: 3, trabajadorId: 1, otId: 3, horas: 32 },
      { id: 4, trabajadorId: 2, otId: 1, horas: 32 }, { id: 5, trabajadorId: 2, otId: 2, horas: 160 },
      { id: 6, trabajadorId: 3, otId: 1, horas: 80 }, { id: 7, trabajadorId: 3, otId: 2, horas: 80 }, { id: 8, trabajadorId: 3, otId: 3, horas: 32 }
    ];

    db.basesInductor = [
      { otId: 1, inductorId: 3, valor: 60 }, { otId: 2, inductorId: 3, valor: 90 }, { otId: 3, inductorId: 3, valor: 30 },
      { otId: 1, inductorId: 4, valor: 400 }, { otId: 2, inductorId: 4, valor: 700 }, { otId: 3, inductorId: 4, valor: 150 }
    ];

    db.ventas = [
      { id: 1, fecha: '2026-10-26', tipoDoc: '01', documento: 'F001-00001', cliente: 'Hotel Los Andes SAC', ruc: '20000000201', condicion: 'CREDITO', items: [{ productoId: 1, cantidad: 20, precioUnit: 1450 }] },
      { id: 2, fecha: '2026-10-29', tipoDoc: '01', documento: 'F001-00002', cliente: 'Inversiones Casa Bonita SAC', ruc: '20000000202', condicion: 'CREDITO', items: [{ productoId: 2, cantidad: 60, precioUnit: 380 }] },
      { id: 3, fecha: '2026-10-30', tipoDoc: '03', documento: 'B001-00001', cliente: 'Clientes varios', ruc: '', condicion: 'CONTADO', items: [{ productoId: 2, cantidad: 5, precioUnit: 420 }] }
    ];

    const netoPlanilla = Engine.sumBy(Engine.planillaCalc(db), 'neto');
    db.tesoreria = [
      { id: 1, fecha: '2026-10-15', tipo: 'PRESTAMO', cuenta: '4511', aux: 'Banco Comercial (ejemplo)', documento: 'PR-2026-01', glosa: 'Préstamo bancario a 12 meses', monto: 20000 },
      { id: 2, fecha: '2026-10-20', tipo: 'PAGO_PROVEEDOR', cuenta: '4212', aux: 'Maderera San Martín SAC', documento: 'F001-00451', glosa: '', monto: 10974 },
      { id: 3, fecha: '2026-10-30', tipo: 'COBRO_CLIENTE', cuenta: '1212', aux: 'Hotel Los Andes SAC', documento: 'F001-00001', glosa: '', monto: 34220 },
      { id: 4, fecha: '2026-10-31', tipo: 'PAGO_PLANILLA', cuenta: '4111', aux: 'Trabajadores', documento: 'PL-2026-10', glosa: 'Pago de remuneraciones netas de octubre', monto: netoPlanilla }
    ];

    db.asientos = [
      { id: 1, fecha: '2026-10-31', tipo: 'Operación', actividad: 'Operación', glosa: 'Comisión de mantenimiento de cuenta bancaria',
        lineas: [{ cuenta: '6391', debe: 25, haber: 0 }, { cuenta: '1041', debe: 0, haber: 25 }, { cuenta: '941', debe: 25, haber: 0 }, { cuenta: '791', debe: 0, haber: 25 }] }
    ];

    return db;
  }

  return { create };
});
