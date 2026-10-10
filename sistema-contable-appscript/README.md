# Sistema Contable y de Costos UNI · versión Google Apps Script

En esta versión, la aplicación web se publica con Google Apps Script y la **base de datos es una hoja de cálculo de Google Sheets**. Cada tabla del sistema es una pestaña de esa hoja. Es **multiempresa**: una misma hoja guarda varias empresas, y cada usuario trabaja solo con las empresas que se le asignan.

No necesitas GitHub, Cloudflare ni ningún servidor propio. Solo una cuenta de Google.

## Archivos que vas a pegar

Están en la carpeta `dist/`. En el editor de Apps Script, el nombre del archivo va **sin** la extensión.

| Archivo | Tipo en Apps Script | Contenido |
|---|---|---|
| `Code.gs` | Secuencia de comandos (puedes usar el archivo `Código.gs` que ya viene) | Servidor: base de datos, usuarios, reportes, menú |
| `Engine.gs` | Secuencia de comandos | Motor contable y de costos (servidor) |
| `Seed.gs` | Secuencia de comandos | Datos de ejemplo de OMEGA SAC |
| `Index.html` | HTML | Página principal |
| `css.html` | HTML | Estilos |
| `js_engine.html` | HTML | Motor contable (navegador) |
| `js_xlsx.html` | HTML | Descarga de la hoja de costeo en Excel (.xlsx) |
| `js_manual.html` | HTML | Manual de usuario integrado (botón Ayuda) |
| `js_backend.html` | HTML | Conexión de la página con Google Sheets |
| `js_app.html` | HTML | Interfaz (más de 40 módulos, incluidos Empresas, Google Sheets y Usuarios) |
| `appsscript.json` | Manifiesto (opcional) | Zona horaria de Lima y permisos de la aplicación web |

## Instalación paso a paso

1. **Crea la hoja de cálculo.** Entra a Google Sheets, crea una hoja en blanco y ponle un nombre, por ejemplo *Sistema Contable UNI - Base de datos*.
2. **Abre Apps Script.** En la hoja, ve a **Extensiones → Apps Script**. Se abre el editor con un archivo `Código.gs`.
3. **Pega el servidor.** Borra todo el contenido de `Código.gs` y pega el de `Code.gs`. Puedes dejarle el nombre `Código`.
4. **Crea los otros scripts.** Pulsa **+** junto a *Archivos* → **Secuencia de comandos** y nómbralo `Engine`. Pega el contenido de `Engine.gs`. Haz lo mismo con `Seed` y `Seed.gs`.
5. **Crea los archivos HTML.** Pulsa **+** → **HTML** y crea `Index`, `css`, `js_engine`, `js_xlsx`, `js_manual`, `js_backend` y `js_app`, en ese orden. En cada uno, borra lo que trae y pega el contenido del archivo `.html` con el mismo nombre.
6. **Manifiesto (opcional, recomendado).**
    1. Ve a **Configuración del proyecto** (ícono de engranaje) y marca *Mostrar el archivo de manifiesto "appsscript.json" en el editor*.
    2. Vuelve al editor, abre `appsscript.json` y reemplaza su contenido por el del archivo entregado.
    3. Si no lo haces, cambia al menos la zona horaria a *(GMT-05:00) Lima* en Configuración del proyecto.
7. **Guarda** con el ícono de disquete (o Ctrl + S).
8. **Instala la base de datos.**
    1. En la barra superior del editor, elige la función `instalar` y pulsa **Ejecutar**.
    2. Google pedirá permisos: **Revisar permisos** → elige tu cuenta.
    3. Si aparece "Google no ha verificado esta aplicación", entra a **Configuración avanzada → Ir a (nombre del proyecto)** y pulsa **Permitir**. Es normal en scripts personales.
    4. Al terminar, la hoja de cálculo tendrá todas las pestañas con los datos de ejemplo.
9. **Publica la aplicación web.**
    1. Pulsa **Implementar → Nueva implementación**.
    2. En el engranaje de *Seleccionar tipo* elige **Aplicación web**.
    3. Configura:
        - **Descripción:** Versión 1.
        - **Ejecutar como:** Yo (tu cuenta).
        - **Quién tiene acceso:** Cualquier usuario. Así tu profesor puede entrar sin cuenta de Google; el sistema tiene su propio login.
    4. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
10. **Ingresa.** Abre la URL y entra con usuario **admin** y contraseña **uni2026**. Cámbiala de inmediato en **Utilitarios → Usuarios y accesos**.

Si vuelves a abrir la hoja de cálculo, aparece el menú **Sistema Contable** con estas opciones: instalar o verificar, generar reportes de una empresa, ver el enlace de la aplicación, restaurar datos de ejemplo en una empresa y restablecer la contraseña de admin. Las opciones que actúan sobre una empresa piden su ID (columna `id` de la hoja Empresas).

## Cómo actualizar el código después

1. Pega el nuevo contenido en los archivos y guarda.
2. Ve a **Implementar → Gestionar implementaciones**, pulsa el lápiz, elige **Versión: Nueva versión** e **Implementar**.

La URL no cambia.

**Si ya tenías instalada la versión de una sola empresa:** pega todos los archivos nuevos (incluidos los nuevos `js_xlsx` y `js_manual`), guarda y ejecuta `instalar` una vez. La hoja `Config` se convierte en la hoja `Empresas` (tu empresa queda como empresa 1), las filas existentes se asignan a la empresa 1 y los usuarios que no son ADMIN quedan asignados a la empresa 1. No se pierden datos.

## Base de datos en Google Sheets

| Hoja | Contenido |
|---|---|
| Empresas | Una fila por empresa: ID, razón social, RUC, periodo, parámetros (IGV, EsSalud, AFP, ONP, RMV, IR, método de valuación) y estado del cierre |
| Usuarios | Usuario, nombre, perfil, estado, empresas a las que accede (`*` = todas, o los ID separados por comas, por ejemplo `1,3`) y contraseña cifrada (SHA-256 con sal) |
| Bitacora | Registro de ingresos y cambios (fecha, usuario, acción) |
| Cuentas, Materiales, Productos, Inductores, ConceptosCIF, ActivosFijos, InventarioInicial | Tablas maestras |
| OrdenesTrabajo, Requisiciones, HojasTiempo, BasesInductor | Producción y costos |
| Compras + ComprasDetalle, Ventas + VentasDetalle | Comprobantes (cabecera y detalle) |
| Trabajadores | Planilla (MOD, MOI, ADM, VEN) |
| Tesoreria, Asientos + AsientosDetalle | Cobros, pagos y asientos manuales (con su actividad: operación, inversión o financiamiento) |
| R_* | Reportes generados de la empresa elegida: libro diario (con la actividad del flujo), mayor, kardex, hoja de costos, distribución de CIF, planilla, balance de comprobación, estados financieros y ratios |
| C_* | Hoja de cálculo de costeo: resumen por O/T, materia prima, mano de obra, distribución de CIF, inductores, kardex, costo laboral, estado de costos, costos fijos y variables y punto de equilibrio |

Todas las tablas de datos tienen la columna **empresaId**: así cada empresa tiene su propio plan de cuentas, tablas maestras, documentos y asientos manuales. Si editas a mano en Sheets, no cambies esa columna.

**Cómo se comporta la base de datos:**
- **Guardado:** los cambios se guardan solos al grabar en la aplicación. En la barra superior aparece "Guardado en Google Sheets".
- **Asientos:** no se guardan en la base porque el sistema los calcula a partir de los documentos. Para verlos en la hoja usa **Utilitarios → Base de datos (Google Sheets) → Generar reportes**.
- **Validación:** el servidor vuelve a validar cada cambio antes de escribirlo (stock, cuadre, periodo cerrado y perfil del usuario).
- **Dos usuarios a la vez:** si cambian datos al mismo tiempo, el segundo recibe un aviso y se le recargan los datos más recientes. Así nadie borra sin saberlo lo que hizo el otro.
- **Edición a mano en Sheets:** se puede, respetando los encabezados. Las fechas van como `aaaa-mm-dd`.
- **Empresas:** solo un ADMIN las crea o elimina (*Utilitarios → Empresas*). Al eliminar una empresa se borran sus filas de todas las hojas y se quita de los usuarios que la tenían asignada. Los ID no se reutilizan.

## Perfiles

| Perfil | Puede |
|---|---|
| ADMIN | Todo, en todas las empresas: registrar, consultar, crear empresas, usuarios, restaurar backup o datos de ejemplo |
| CONTADOR | Registrar y consultar en sus empresas asignadas |
| CONSULTA | Solo consultar sus empresas asignadas (ideal para el profesor) |

Un usuario con más de una empresa elige con cuál trabajar al ingresar y puede cambiar con el botón **Cambiar empresa** del menú lateral.

## Pruebas (para desarrolladores)

```
npm run build        # genera dist/ desde ../sistema-contable/public
npm test             # pruebas del servidor con un simulador de Apps Script y Google Sheets
npm run test:e2e     # la página real en Chromium conectada al simulador
```

El motor contable, los estilos y la interfaz son los mismos de `../sistema-contable` (versión Cloudflare). `build.js` los copia a `dist/`, así que **no edites `dist/` a mano**.
