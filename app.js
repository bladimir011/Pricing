/* Lista de precios A4 vinculada a Google Sheets (CSV público). */

const els = {
  sheetId: document.getElementById("sheetId"),
  sheetName: document.getElementById("sheetName"),
  docTitle: document.getElementById("docTitle"),
  docSubtitle: document.getElementById("docSubtitle"),
  currency: document.getElementById("currency"),
  reload: document.getElementById("reload"),
  print: document.getElementById("print"),
  status: document.getElementById("status"),
  title: document.getElementById("title"),
  subtitle: document.getElementById("subtitle"),
  today: document.getElementById("today"),
  headerRow: document.getElementById("headerRow"),
  bodyRows: document.getElementById("bodyRows"),
};

const STORAGE_KEY = "pricing-config-v1";

/* ---------- Persistencia simple ---------- */
function saveConfig() {
  const cfg = {
    sheetId: els.sheetId.value.trim(),
    sheetName: els.sheetName.value.trim(),
    docTitle: els.docTitle.value,
    docSubtitle: els.docSubtitle.value,
    currency: els.currency.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    els.sheetId.value = cfg.sheetId ?? "";
    els.sheetName.value = cfg.sheetName ?? "";
    els.docTitle.value = cfg.docTitle ?? "Lista de Precios";
    els.docSubtitle.value = cfg.docSubtitle ?? "";
    els.currency.value = cfg.currency ?? "$";
  } catch {
    /* ignore */
  }
}

/* ---------- Helpers ---------- */
function setStatus(msg, kind = "") {
  els.status.textContent = msg;
  els.status.className = "status " + kind;
}

function extractSheetId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

function buildCsvUrl(sheetId, sheetName) {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  return sheetName ? `${base}&sheet=${encodeURIComponent(sheetName)}` : base;
}

/* RFC4180-ish CSV parser: respeta comillas, comas y saltos de línea. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") { continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

function isNumeric(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim().replace(/\./g, "").replace(",", ".");
  if (s === "") return false;
  return !isNaN(Number(s));
}

function formatPrice(value, currency) {
  if (!isNumeric(value)) return value ?? "";
  const n = Number(String(value).trim().replace(/\./g, "").replace(",", "."));
  return `${currency} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ---------- Render ---------- */
function renderTable(rows, currency) {
  if (!rows.length) {
    els.headerRow.innerHTML = "<th>Producto</th><th>Código</th><th class='num'>Precio</th>";
    els.bodyRows.innerHTML = `<tr><td colspan="3" class="empty">El Sheet está vacío.</td></tr>`;
    return;
  }

  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1);

  els.headerRow.innerHTML = headers
    .map((h, i) => {
      const numeric = i >= 2;
      return `<th class="${numeric ? "num" : ""}">${escapeHtml(h)}</th>`;
    })
    .join("");

  els.bodyRows.innerHTML = data
    .map(r => {
      const cells = headers
        .map((_, i) => {
          const raw = r[i] ?? "";
          const numeric = i >= 2;
          const value = numeric ? formatPrice(raw, currency) : escapeHtml(raw);
          return `<td class="${numeric ? "num" : ""}">${numeric ? value : value}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyMeta() {
  els.title.textContent = els.docTitle.value || "Lista de Precios";
  els.subtitle.textContent = els.docSubtitle.value || "";
  els.subtitle.style.display = els.docSubtitle.value ? "block" : "none";
  els.today.textContent = new Date().toLocaleDateString("es-AR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

/* ---------- Carga ---------- */
async function loadSheet() {
  applyMeta();
  saveConfig();

  const id = extractSheetId(els.sheetId.value);
  if (!id) {
    setStatus("Ingresá el ID o URL del Google Sheet.", "error");
    return;
  }

  const url = buildCsvUrl(id, els.sheetName.value.trim());
  setStatus("Cargando datos...");

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    renderTable(rows, els.currency.value || "$");
    setStatus(`Cargado: ${Math.max(0, rows.length - 1)} productos.`, "ok");
  } catch (err) {
    setStatus(
      `No se pudo cargar. Verificá que el Sheet sea público ("Cualquier persona con el enlace"). Detalle: ${err.message}`,
      "error"
    );
  }
}

/* ---------- Eventos ---------- */
els.reload.addEventListener("click", loadSheet);
els.print.addEventListener("click", () => window.print());
[els.docTitle, els.docSubtitle, els.currency].forEach(el =>
  el.addEventListener("input", () => { applyMeta(); saveConfig(); })
);

loadConfig();
applyMeta();
if (els.sheetId.value) loadSheet();
