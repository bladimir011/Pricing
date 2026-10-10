/*
 * Arma la carpeta dist/ con los archivos que se pegan en el editor de Google Apps Script.
 * El motor contable, los estilos y la interfaz se toman de ../sistema-contable/public,
 * así las dos versiones (Cloudflare y Apps Script) comparten el mismo código.
 * Uso: node build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WEB = path.join(ROOT, '..', 'sistema-contable', 'public');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const read = p => fs.readFileSync(p, 'utf8');
const header = (what, from) => `/* ${what} · generado por build.js desde ${from}. No editar aquí: editar el original. */\n`;

function script(code, from) {
  if (/<\/script/i.test(code)) throw new Error(`${from} contiene "</script>" y rompería el HTML`);
  return `<script>\n${header('Script', from)}${code}\n</script>\n`;
}

function indexHtml() {
  const web = read(path.join(WEB, 'index.html'));
  const body = web.slice(web.indexOf('<body>') + 6, web.indexOf('<script src='));
  const demo = 'Login demostrativo (sin servidor). Al recargar la página se vuelve a pedir.';
  if (!body.includes(demo)) throw new Error('No se encontró el texto del recuadro de acceso en index.html');
  // Script del <head> que aplica el tema guardado (Claro, Tenue u Oscuro) antes de dibujar la página.
  const m = web.match(/<head>[\s\S]*?(<script>[\s\S]*?<\/script>)[\s\S]*?<\/head>/);
  if (!m || !m[1].includes('uni_tema')) throw new Error('No se encontró el script de tema en el <head> de index.html');
  const themeScript = m[1];
  const gasBody = body.replace(demo, 'Usuarios guardados en Google Sheets. Cambia la contraseña inicial en Utilitarios → Usuarios y accesos.')
    .replace('Usuario: <b>admin</b> · Contraseña: <b>uni2026</b>', 'Usuario inicial: <b>admin</b> · Contraseña inicial: <b>uni2026</b>');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<base target="_top">
<meta charset="utf-8">
<title>Sistema Contable y de Costos UNI</title>
${themeScript}
<?!= include('css'); ?>
</head>
<body>${gasBody}<?!= include('js_engine'); ?>
<?!= include('js_xlsx'); ?>
<?!= include('js_manual'); ?>
<?!= include('js_backend'); ?>
<?!= include('js_app'); ?>
</body>
</html>
`;
}

function build() {
  fs.mkdirSync(DIST, { recursive: true });
  const engine = read(path.join(WEB, 'js', 'engine.js'));
  const files = {
    'Code.gs': read(path.join(SRC, 'Code.gs')),
    'Engine.gs': header('Motor contable', 'sistema-contable/public/js/engine.js') + engine,
    'Seed.gs': header('Datos de ejemplo', 'sistema-contable/public/js/seed.js') + read(path.join(WEB, 'js', 'seed.js')),
    'Index.html': indexHtml(),
    'css.html': `<style>\n${read(path.join(WEB, 'css', 'styles.css'))}\n</style>\n`,
    'js_engine.html': script(engine, 'sistema-contable/public/js/engine.js'),
    'js_xlsx.html': script(read(path.join(WEB, 'js', 'xlsx.js')), 'sistema-contable/public/js/xlsx.js'),
    'js_manual.html': script(read(path.join(WEB, 'js', 'manual.js')), 'sistema-contable/public/js/manual.js'),
    'js_backend.html': script(read(path.join(SRC, 'backend.js')), 'sistema-contable-appscript/src/backend.js'),
    'js_app.html': script(read(path.join(WEB, 'js', 'app.js')), 'sistema-contable/public/js/app.js'),
    'appsscript.json': read(path.join(SRC, 'appsscript.json'))
  };
  Object.entries(files).forEach(([name, content]) => fs.writeFileSync(path.join(DIST, name), content));
  return Object.keys(files);
}

if (require.main === module) {
  const names = build();
  console.log('dist/ listo: ' + names.join(', '));
}
module.exports = { build, DIST };
