/*
 * Manual de usuario integrado en el aplicativo.
 * Cada sección indica las pantallas (vistas) a las que corresponde: el botón "Ayuda" de la barra superior
 * abre la sección de la pantalla actual. Los botones con data-go abren el módulo indicado.
 */
(function (root) {
  'use strict';
  const go = (v, l) => `<button class="btn btn-secondary btn-sm" data-go="${v}">Abrir ${l}</button>`;

  root.MANUAL = [
    {
      id: 'inicio', titulo: '1. Qué es y cómo ingresar', vistas: ['dashboard'],
      html: `<p>El Sistema Contable y de Costos registra las operaciones de una empresa industrial y genera solo los asientos contables, el kardex, la hoja de costos por orden de trabajo (O/T), los libros y los estados financieros. Usa el costeo por órdenes de trabajo y el plan contable PCGE.</p>
        <h3>Ingresar</h3>
        <ol><li>Escribe tu usuario y contraseña. El usuario inicial es <b>admin</b> con la contraseña <b>uni2026</b>; cámbiala al primer ingreso.</li>
        <li>Si tu usuario tiene varias empresas, elige con cuál trabajar. Puedes cambiar de empresa en cualquier momento con <b>Cambiar empresa</b>, en la parte inferior del menú.</li></ol>
        <h3>La pantalla</h3>
        <ul><li><b>Menú lateral:</b> los módulos agrupados en Inicio, Operaciones, Producción y costos, Libros contables, Estados financieros, Cierre, Tablas y Utilitarios.</li>
        <li><b>Barra superior:</b> nombre del módulo, selector de tema (Claro, Tenue, Oscuro), periodo y método de valuación, botón <b>Ayuda</b> (abre la parte de este manual que corresponde a la pantalla) e <b>Imprimir</b>.</li>
        <li><b>Área central:</b> formularios arriba y resultados abajo. Casi todas las tablas tienen <b>Exportar CSV</b>.</li></ul>
        <h3>Panel general</h3>
        <p>Muestra ventas, utilidad neta, costo de producción, bancos, el costo de cada O/T separado en MD, MOD y CIF, y las validaciones del sistema. Si todo está en orden, aparece un recuadro verde.</p>
        <div class="actions">${go('dashboard', 'el panel')}</div>`
    },
    {
      id: 'empresas', titulo: '2. Empresas y usuarios', vistas: ['empresas', 'usuarios'],
      html: `<p>El sistema es <b>multiempresa</b>: cada empresa tiene su propio plan de cuentas, tablas maestras, documentos, asientos, libros y estados financieros. Una persona puede trabajar con más de una empresa.</p>
        <h3>Crear una empresa</h3>
        <ol><li>Ve a <b>Utilitarios → Empresas</b>.</li>
        <li>Completa razón social, RUC, actividad y periodo.</li>
        <li>Elige cómo empezar: <b>vacía</b> (solo el plan de cuentas PCGE base), <b>con datos de ejemplo</b> o <b>copiando las tablas maestras</b> de la empresa actual (cuentas agregadas, materiales, productos, inductores, conceptos CIF, activos y trabajadores, sin documentos).</li>
        <li>Pulsa <b>Crear empresa</b>. Para trabajar con ella, usa <b>Abrir</b> o <b>Cambiar empresa</b>.</li></ol>
        <p>Una empresa se puede eliminar si no es la que tienes abierta y no es la única. Se borran todos sus datos.</p>
        <h3>Usuarios y perfiles (versión Google Sheets)</h3>
        <table><thead><tr><th>Perfil</th><th>Puede</th></tr></thead><tbody>
        <tr><td>ADMIN</td><td>Todo, en todas las empresas: registrar, consultar, crear empresas y usuarios, restaurar datos.</td></tr>
        <tr><td>CONTADOR</td><td>Registrar y consultar en las empresas que tenga asignadas.</td></tr>
        <tr><td>CONSULTA</td><td>Solo consultar las empresas asignadas (ideal para el profesor).</td></tr></tbody></table>
        <p>En <b>Utilitarios → Usuarios y accesos</b> el ADMIN crea usuarios, les asigna una o varias empresas y define su perfil. Cada usuario puede cambiar su propia contraseña ahí mismo. Las contraseñas se guardan cifradas.</p>
        <div class="actions">${go('empresas', 'Empresas')}</div>`
    },
    {
      id: 'apariencia', titulo: '3. Temas de color', vistas: [],
      html: `<p>En la barra superior (y en la pantalla de inicio de sesión) elige el tema:</p>
        <ul><li><b>Claro:</b> fondo blanco, ideal para oficinas iluminadas y para imprimir.</li>
        <li><b>Tenue:</b> gris azulado de bajo brillo, cómodo para trabajar varias horas.</li>
        <li><b>Oscuro:</b> fondo casi negro, para ambientes con poca luz.</li></ul>
        <p>La elección se recuerda en el navegador. Al imprimir, el documento siempre sale en colores claros.</p>`
    },
    {
      id: 'configuracion', titulo: '4. Empresa, parámetros y tablas maestras', vistas: ['config', 'tablas'],
      html: `<h3>Empresa y parámetros</h3>
        <ol><li>Completa razón social, RUC, dirección, actividad y <b>periodo contable</b>.</li>
        <li>Elige el <b>método de valuación</b>: promedio ponderado móvil o PEPS. Al cambiarlo se recalculan kardex, costos y asientos.</li>
        <li>Revisa las tasas: IGV, EsSalud, ONP, AFP, RMV, asignación familiar e impuesto a la renta (son parametrizables; verifica las vigentes).</li>
        <li>Indica el aporte inicial en efectivo (forma parte del asiento de apertura) y pulsa <b>Guardar parámetros</b>.</li></ol>
        <h3>Tablas maestras</h3>
        <table><thead><tr><th>Pestaña</th><th>Qué registras</th></tr></thead><tbody>
        <tr><td>Plan de cuentas</td><td>Cuentas propias de la empresa, además del PCGE base. Las subcuentas de materiales (241xx/251xx), productos (211xx) y O/T (231xx) se crean solas.</td></tr>
        <tr><td>Materiales</td><td>MP (materia prima, cuenta 24) o MI (material indirecto, cuenta 25, necesita un concepto CIF).</td></tr>
        <tr><td>Productos terminados</td><td>Cada producto tiene su subcuenta 21 y su kardex.</td></tr>
        <tr><td>Activos fijos</td><td>El área define el destino de la depreciación; la de producción es CIF.</td></tr>
        <tr><td>Inductores de CIF</td><td>Bases de reparto: unidades, horas MOD (automáticas) u horas máquina, kWh (manuales).</td></tr>
        <tr><td>Conceptos CIF</td><td>Cada CIF tiene un inductor y un comportamiento (fijo o variable).</td></tr>
        <tr><td>Inventario inicial</td><td>Saldos de materiales al inicio; entran al kardex y al asiento de apertura.</td></tr></tbody></table>
        <p>No se puede eliminar un registro que ya se usa en un documento.</p>
        <div class="actions">${go('config', 'Empresa y parámetros')} ${go('tablas', 'Tablas maestras')}</div>`
    },
    {
      id: 'flujo', titulo: '5. Flujo de costos y orden de uso', vistas: [],
      html: `<p>El costo de cada O/T se arma con tres elementos que pasan por el libro mayor de fábrica (91, 92, 93) antes de llegar a la cuenta 23. Cada gasto se registra primero por naturaleza (clase 6) y luego en su destino (clase 9) contra la 79. Todos los asientos se generan a partir de los documentos.</p>
        <h3>Orden recomendado para un periodo</h3>
        <ol><li>Revisa Empresa y parámetros y las Tablas maestras.</li><li>Crea las órdenes de trabajo.</li><li>Registra las compras de materiales y servicios.</li>
        <li>Registra las requisiciones de materiales a cada O/T.</li><li>Registra la planilla y las hojas de tiempo de la MOD.</li><li>Ingresa las bases manuales de los inductores.</li>
        <li>Marca las O/T terminadas.</li><li>Registra las ventas y los cobros y pagos.</li><li>Revisa la hoja de costos, la hoja de cálculo de costeo, los libros y los estados financieros.</li><li>Revisa los ajustes y ejecuta el cierre.</li></ol>`
    },
    {
      id: 'compras', titulo: '6. Compras y kardex', vistas: ['compras', 'kardex'],
      html: `<h3>Registrar una compra</h3>
        <ol><li>Completa fecha, comprobante, serie-número, condición (crédito o contado), proveedor y RUC.</li>
        <li>Agrega ítems: <b>+ Material</b> (material, cantidad, valor unitario sin IGV), <b>+ Servicio / gasto</b> (descripción, cuenta 63x, destino y, si es CIF, su concepto) o <b>+ Activo fijo</b>.</li>
        <li>Revisa el valor, el IGV y el total, y pulsa <b>Grabar compra</b>.</li></ol>
        <table><thead><tr><th>Asiento</th><th>Debe</th><th>Haber</th></tr></thead><tbody>
        <tr><td>Compra</td><td>602/603, 63x, 33, 40111 IGV</td><td>4212</td></tr>
        <tr><td>Ingreso al almacén</td><td>241xx / 251xx</td><td>612 / 613</td></tr>
        <tr><td>Destino del gasto</td><td>931, 941 o 951</td><td>791</td></tr>
        <tr><td>Pago al contado</td><td>4212</td><td>1041</td></tr></tbody></table>
        <h3>Kardex</h3>
        <p>Elige la existencia (MP, MI o PT). Verás entradas, salidas y saldo con cantidad, costo unitario y total. El recuadro <b>Conciliación con cuenta</b> debe decir <b>Cuadra</b>. Debajo está la cuenta T del material. El kardex cambia solo cuando registras compras, requisiciones, O/T terminadas o ventas.</p>
        <div class="actions">${go('compras', 'Compras')} ${go('kardex', 'Kardex')}</div>`
    },
    {
      id: 'produccion', titulo: '7. Órdenes de trabajo, requisiciones y horas', vistas: ['ordenes', 'requisiciones', 'horas'],
      html: `<h3>Órdenes de trabajo</h3>
        <ol><li>El número se propone solo; elige producto, cantidad, cliente y fecha de inicio.</li>
        <li>Mientras se fabrica queda <b>En proceso</b> (su costo se acumula en su subcuenta 23).</li>
        <li>Al terminar, edítala con la fecha de término y el estado <b>Terminada</b>: el costo pasa a la 21 y al kardex del producto.</li></ol>
        <h3>Requisiciones</h3>
        <p>La fecha debe ser posterior a la compra del material. La <b>materia prima</b> se carga a una O/T (911 MD); el <b>material indirecto</b> va a CIF (931). El costo sale del kardex y no se puede sacar más de lo que hay.</p>
        <h3>Hojas de tiempo MOD</h3>
        <p>Registra las horas de cada trabajador MOD en cada O/T. La tarifa por hora es el costo laboral (remuneración + EsSalud) entre el total de horas. Estas horas también son la base del inductor "Horas MOD".</p>
        <div class="actions">${go('ordenes', 'Órdenes de trabajo')} ${go('requisiciones', 'Requisiciones')} ${go('horas', 'Hojas de tiempo')}</div>`
    },
    {
      id: 'planilla', titulo: '8. Planilla de remuneraciones', vistas: ['planilla'],
      html: `<table><thead><tr><th>Clasificación</th><th>Destino</th><th>Cómo llega al costo</th></tr></thead><tbody>
        <tr><td>MOD – Mano de obra directa</td><td>921</td><td>A cada O/T con las hojas de tiempo</td></tr>
        <tr><td>MOI – Mano de obra indirecta</td><td>931 CIF</td><td>Con el inductor de su concepto CIF</td></tr>
        <tr><td>ADM – Personal administrativo</td><td>941</td><td>Gasto del periodo</td></tr>
        <tr><td>VEN – Personal de ventas</td><td>951</td><td>Gasto del periodo</td></tr></tbody></table>
        <p>Registra DNI, nombre, cargo, clasificación, sueldo, sistema de pensiones, asignación familiar y retención de 5ta. La planilla se calcula sola (ONP/AFP, EsSalud, neto, costo laboral) y genera el asiento de planilla y su destino. El pago del neto se registra en Tesorería.</p>
        <div class="actions">${go('planilla', 'Planilla')}</div>`
    },
    {
      id: 'cif', titulo: '9. CIF, hoja de costos y mayor de fábrica', vistas: ['cif', 'hojaCostos', 'fabrica', 'estadoCostos', 'cvu'],
      html: `<p><b>Tasa = CIF real del periodo ÷ base total del inductor.</b> <b>CIF de la O/T = tasa × base de la O/T.</b> Ejemplo: energía de planta S/ 1,450 ÷ 1,250 kWh = S/ 1.16 por kWh; la OT-001 usó 400 kWh, recibe S/ 464.</p>
        <h3>Inductores y distribución CIF</h3>
        <p>Revisa la tabla de inductores y los conceptos CIF; escribe las bases manuales por O/T y pulsa <b>Guardar bases manuales</b>. La hoja de distribución muestra el CIF de cada concepto en cada orden.</p>
        <h3>Hoja de costos</h3><p>Elige la O/T: materia prima directa por requisición, mano de obra por trabajador y horas, CIF con inductor, base y tasa, costo total y unitario.</p>
        <h3>Libro mayor de fábrica</h3><p>Cuentas T 911, 921 y 931; se cargan con el destino de los gastos y se abonan al pasar a la 23 de cada O/T. Si todo se distribuyó, aparecen como <b>Cuenta saldada</b>.</p>
        <h3>Estado de costo de producción · Costos fijos/variables</h3><p>El estado llega al costo de ventas y lo concilia con la cuenta 69. El análisis de costos fijos y variables calcula el margen de contribución, el punto de equilibrio y compara el costeo variable con el absorbente.</p>
        <div class="actions">${go('cif', 'Distribución CIF')} ${go('hojaCostos', 'Hoja de costos')} ${go('fabrica', 'Mayor de fábrica')}</div>`
    },
    {
      id: 'hojaCalculo', titulo: '10. Hoja de cálculo de costeo', vistas: ['hojaCalculo'],
      html: `<p>Reúne todo el costeo en un libro con pestañas, como en Excel: <b>Resumen OT</b>, <b>Materia prima</b>, <b>Mano de obra</b>, <b>Distribución CIF</b>, <b>Inductores</b>, <b>Kardex</b>, <b>Costo laboral</b>, <b>Estado de costos</b>, <b>Fijos y variables</b> y <b>Punto de equilibrio</b>.</p>
        <ol><li>Cambia de hoja con las pestañas de abajo.</li><li>Haz clic en una celda para ver su referencia (por ejemplo, E5) y su valor exacto en la barra superior.</li>
        <li>Pulsa <b>Descargar Excel (.xlsx)</b> para obtener el libro completo. En la versión Google Sheets también puedes crear estas hojas (prefijo C_) dentro de tu Google Sheets.</li></ol>
        <div class="actions">${go('hojaCalculo', 'la hoja de cálculo')}</div>`
    },
    {
      id: 'ventas', titulo: '11. Ventas, tesorería y asientos manuales', vistas: ['ventas', 'tesoreria', 'asientos'],
      html: `<h3>Ventas</h3><p>Completa comprobante, cliente y productos (cantidad y valor unitario sin IGV). Se registran 1212 / 7021 / 40111 y el costo de ventas 6921 / 211xx según el kardex. No se puede vender más de lo que hay en stock.</p>
        <h3>Tesorería</h3><p>Cobranzas, pagos a proveedores, remuneraciones, tributos, préstamos, amortizaciones, aportes. El sistema propone la cuenta y la <b>actividad</b> (operación, inversión o financiamiento) que alimenta el flujo de efectivo; puedes cambiarlas.</p>
        <h3>Asientos manuales</h3><p>Para operaciones sin documento (gastos bancarios, reclasificaciones, provisiones). Indica fecha, tipo, <b>actividad</b> (operación, inversión o financiamiento) y glosa; agrega líneas hasta que el asiento quede <b>Cuadrado</b>. Si cargas un gasto de clase 6, agrega su destino (9x contra 79).</p>
        <div class="actions">${go('ventas', 'Ventas')} ${go('tesoreria', 'Tesorería')} ${go('asientos', 'Asientos manuales')}</div>`
    },
    {
      id: 'libros', titulo: '12. Libros contables', vistas: ['diario', 'mayor', 'cuentasT', 'caja', 'regCompras', 'regVentas', 'inventarios', 'comprobacion'],
      html: `<table><thead><tr><th>Libro</th><th>Uso</th></tr></thead><tbody>
        <tr><td>Libro diario</td><td>Busca por glosa, cuenta, documento o tercero; filtra por origen y por <b>actividad</b> (operación, inversión, financiamiento) de los asientos que mueven caja.</td></tr>
        <tr><td>Libro mayor</td><td>Movimientos de una cuenta con saldo acumulado y su cuenta T.</td></tr>
        <tr><td>Cuentas T</td><td>Todas las cuentas en T, filtradas por clase.</td></tr>
        <tr><td>Caja y bancos</td><td>Ingresos y egresos de la cuenta 10.</td></tr>
        <tr><td>Registros de compras y ventas</td><td>Formatos 8.1 y 14.1 simplificados.</td></tr>
        <tr><td>Inventarios y balances</td><td>Situación financiera y detalle de saldos.</td></tr>
        <tr><td>Balance de comprobación</td><td>Hoja de trabajo: los resultados por inventario, naturaleza y función deben coincidir.</td></tr></tbody></table>
        <div class="actions">${go('diario', 'Libro diario')} ${go('comprobacion', 'Balance de comprobación')}</div>`
    },
    {
      id: 'eeff', titulo: '13. Estados financieros y ratios', vistas: ['situacion', 'resultados', 'naturaleza', 'flujo', 'patrimonio', 'ratios'],
      html: `<p>Cada estado indica al pie si cuadra con la contabilidad: Activo = Pasivo + Patrimonio, resultado por función = por naturaleza, saldo final del flujo de efectivo = cuenta 10.</p>
        <h3>Ratios financieros</h3><p>Cada ratio aparece en un cuadro con su fórmula, el cálculo y una lectura. El color del borde indica la situación según rangos referenciales: <b>verde</b> favorable, <b>ámbar</b> en observación y <b>rojo</b> desfavorable. ROA y ROE son del periodo (un mes).</p>
        <div class="actions">${go('situacion', 'Estado de situación')} ${go('ratios', 'Ratios')}</div>`
    },
    {
      id: 'cierre', titulo: '14. Ajustes y cierre del ejercicio', vistas: ['ajustes', 'cierre'],
      html: `<p><b>Ajustes:</b> depreciación mensual (la de planta va a CIF) e impuesto a la renta (cálculo simplificado). Otros ajustes, con <b>+ Nuevo asiento de ajuste</b>.</p>
        <p><b>Cierre:</b> revisa las validaciones (✔ verde, ! aviso, ✖ impide cerrar), pulsa <b>Ejecutar cierre del ejercicio</b> y confirma. Se cancelan las cuentas 9 contra la 79, las de resultados contra la 89, y el resultado pasa a 59. El periodo queda bloqueado; con <b>Revertir cierre</b> se reabre.</p>
        <div class="actions">${go('ajustes', 'Ajustes')} ${go('cierre', 'Cierre')}</div>`
    },
    {
      id: 'utilitarios', titulo: '15. Backup, Google Sheets y exportación', vistas: ['backup', 'sheets', 'estadisticas', 'manual'],
      html: `<ul><li><b>Backup:</b> descarga los datos de la empresa abierta en un archivo JSON; restaura desde un archivo, vuelve a los datos de ejemplo o empieza con una base vacía.</li>
        <li><b>Base de datos (Google Sheets):</b> solo en la versión Apps Script. Abre el archivo de Google Sheets y genera los reportes: hojas R_ (libros y estados financieros) y C_ (hoja de cálculo de costeo).</li>
        <li><b>Exportar CSV</b> en cada tabla e <b>Imprimir</b> (o Guardar como PDF) en cualquier pantalla.</li>
        <li><b>Estadísticas:</b> documentos registrados, asientos por origen y gastos por naturaleza.</li></ul>`
    },
    {
      id: 'faq', titulo: '16. Preguntas frecuentes', vistas: [],
      html: `<ul><li><b>¿Por qué no se graba una requisición o una venta?</b> No hay stock en esa fecha. Revisa la fecha y el kardex.</li>
        <li><b>¿Cómo corrijo un asiento automático?</b> Edita el documento que lo generó; los asientos se recalculan solos.</li>
        <li><b>¿Por qué un CIF no se distribuye?</b> Su inductor no tiene base en ninguna O/T.</li>
        <li><b>¿Veo los datos de otra empresa?</b> No. Cada empresa tiene sus propias cuentas y asientos; cambia de empresa con <b>Cambiar empresa</b>.</li>
        <li><b>¿Por qué no puedo modificar nada?</b> El periodo está cerrado o tu perfil es de solo consulta.</li>
        <li><b>Otro usuario cambió los datos mientras trabajaba.</b> El sistema avisa y recarga la información más reciente; revisa si tu último cambio quedó registrado.</li></ul>`
    }
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
