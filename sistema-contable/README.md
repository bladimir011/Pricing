# Sistema Contable y de Costos UNI · V5

Proyecto académico del curso de **Sistema de Costos**. Es un sitio estático para Cloudflare que integra contabilidad general y costeo por **órdenes de trabajo (O/T)**, con datos de ejemplo de OMEGA SAC, una fábrica de muebles, para octubre de 2026. Es **multiempresa**: cada empresa tiene su propio plan de cuentas, tablas, documentos y asientos.

## Acceso
- Usuario: `admin`
- Contraseña: `uni2026`

El login es solo demostrativo: no hay servidor y la sesión no se guarda, así que al recargar se vuelve a pedir.

## Cómo funciona
Los asientos contables **no se digitan uno por uno**: el motor (`public/js/engine.js`) los genera a partir de los documentos. Gracias a eso, el diario, el mayor, el kardex, la hoja de costos y los EEFF siempre están sincronizados.

| Documento | Asientos que genera |
|---|---|
| Compra de materia prima | 60 / 40 / 42 y el ingreso al almacén 24xx (una subcuenta y un kardex por cada MP) contra 61 |
| Compra de servicio (luz, alquiler, mantenimiento) | Gasto por naturaleza 63 / 40 / 42 y su destino: 93 CIF (con su concepto e inductor), 94 o 95, contra 79 |
| Requisición | Salida del kardex (61 / 24) y destino a 91 MD (si es MP de una O/T) o a 93 CIF (si es material indirecto) |
| Planilla | 62 / 40 / 41 y destino según la clasificación: MOD → 92, MOI → 93, administrativo → 94, ventas → 95 |
| Depreciación | 68 / 39 y destino: la de planta es CIF (93) |
| O/T | MD + MOD + CIF → 23xx (una subcuenta por O/T) / 71, contra 79 / 91, 92 y 93. Al terminar, 21 / 71 y 71 / 23 |
| Venta | 12 / 70 / 40 y costo de ventas 69 / 21, valorizado con el kardex de productos terminados |
| Tesorería y asientos manuales | Cobros y pagos en la cuenta 10, clasificados por actividad (operación, inversión o financiamiento) para el flujo de efectivo. La actividad se ve y se filtra en el libro diario |
| Cierre | 79 / 9x, cuentas de resultados contra 89, y 89 → 59 |

Los CIF se distribuyen así: tasa = CIF real del periodo ÷ base total del inductor, y CIF de la O/T = tasa × base de la O/T. Cada concepto CIF tiene **un inductor**.

## Novedades de esta versión
- **Temas de color:** Claro, Tenue (azul grisáceo suave) y Oscuro. El selector está en el login y en la barra superior; se recuerda en el navegador. Al imprimir siempre se usa el tema claro.
- **Ratios en cuadros:** cada ratio en su propio cuadro, con su fórmula, el cálculo, el resultado y un color según su situación (verde favorable, ámbar en observación, rojo desfavorable).
- **Hoja de cálculo de costeo:** todo el costeo del periodo en un libro de 10 hojas (resumen por O/T, materia prima, mano de obra, distribución de CIF, inductores, kardex, costo laboral, estado de costos, costos fijos y variables, punto de equilibrio). Se ve como Excel (columnas A, B, C…, filas numeradas y barra de fórmulas) y se descarga en `.xlsx`.
- **Multiempresa:** *Utilitarios → Empresas* crea empresas vacías, con datos de ejemplo o copiando las tablas maestras (plan de cuentas, materiales, productos, CIF, inductores, activos y trabajadores) de la empresa abierta. Con *Cambiar empresa* se pasa de una a otra.
- **Manual de usuario integrado:** *Utilitarios → Manual de usuario* y el botón **Ayuda** de la barra superior, que abre la sección de la pantalla en la que estás.

## Módulos (más de 40 opciones de menú)
- **Operaciones:** compras, ventas, tesorería, planilla (MOD / MOI / administración / ventas), asientos manuales.
- **Producción y costos:** hoja de cálculo de costeo, órdenes de trabajo, requisiciones, hojas de tiempo MOD, inductores y distribución de CIF, hoja de costos por O/T, kardex (MP, MI, PT) con su cuenta T, libro mayor de fábrica, estado de costo de producción y ventas, costos fijos/variables con punto de equilibrio y comparación entre costeo variable y absorbente.
- **Libros:** diario, mayor, cuentas T, caja y bancos, registro de compras, registro de ventas, inventarios y balances, balance de comprobación (hoja de trabajo).
- **Estados financieros:** situación financiera, resultados por función y por naturaleza, flujo de efectivo, cambios en el patrimonio y ratios.
- **Cierre:** ajustes (depreciación e impuesto a la renta) y cierre del ejercicio con validaciones.
- **Tablas y utilitarios:** plan de cuentas (PCGE simplificado), materiales, productos, activos, inductores, conceptos CIF, inventario inicial, terceros, empresas, backup y restauración en JSON, estadísticas y manual de usuario.

Además, todas las tablas se pueden exportar a CSV y cualquier pantalla se puede imprimir o guardar en PDF. El kardex se valoriza por promedio ponderado o por PEPS, según se elija en *Empresa y parámetros*.

## Estructura
```
public/
  index.html        Pantallas (login y estructura)
  css/styles.css    Estilos
  js/engine.js      Motor contable y de costos (lógica pura, sin DOM)
  js/seed.js        Datos de ejemplo
  js/xlsx.js        Generador de archivos Excel (.xlsx) sin librerías externas
  js/manual.js      Manual de usuario (secciones del botón Ayuda)
  js/app.js         Interfaz
  _headers          Cabeceras de Cloudflare (sin caché)
tests/
  engine.test.js    Pruebas unitarias del motor
  e2e.js            Prueba end-to-end en el navegador (Playwright)
```

## Pruebas
```
npm test            # pruebas unitarias (node:test)
npm run test:e2e    # recorre todos los módulos en Chromium (requiere Playwright)
```
Las pruebas verifican que:
- cada asiento cuadre (Debe = Haber);
- Activo = Pasivo + Patrimonio;
- el resultado por naturaleza sea igual al resultado por función;
- el flujo de efectivo coincida con la cuenta 10;
- cada kardex coincida con su cuenta 24, 25 o 21;
- el estado de costos coincida con la cuenta 69;
- las cuentas 91 a 93 queden saldadas;
- no se pueda sacar más de lo que hay en stock;
- el cierre funcione correctamente.

## Despliegue
- Con Wrangler: `npm install` y luego `npm run deploy`.
- En Cloudflare Pages: publica la carpeta `public`.

Los datos se guardan en el `localStorage` del navegador: la lista de empresas en `uni_contable_v5_empresas` y cada empresa en `uni_contable_v5_db_<id>`. Si existían datos de la versión de una sola empresa, pasan a ser la empresa 1. El tema elegido se guarda en `uni_tema`.

## Versión Google Apps Script
La carpeta `../sistema-contable-appscript` publica este mismo sistema con Google Apps Script y guarda los datos en Google Sheets, con usuarios, perfiles y la asignación de cada usuario a una o varias empresas. La interfaz usa un conector de almacenamiento: sin `window.AppBackend` guarda en el navegador (esta versión); con el conector de Apps Script guarda en Google Sheets.

## Notas
- Las tasas (RMV, AFP, EsSalud, ONP e IR) son parametrizables. Verifica las vigentes antes de presentar.
- El impuesto a la renta se calcula de forma simplificada sobre la utilidad contable.
- Trabaja con un solo periodo mensual a la vez.
