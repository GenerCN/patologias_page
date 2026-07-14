Campos de la hoja de calculo iniciando en A1 y terminando en L1:
Folio	Expediente	Nombre del Paciente	Nivel o Tipo de Patología	Fecha de entrega	Fecha de recepción de resultados	Patología Física Recibida	Requiere Cita	Fecha Cita	Enviado a Paciente	Monto	Fecha Pago Contabilidad				


const SHEET_NAME = "Hoja 1";

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "getAll")  return getAll();
    if (action === "search")  return search(e.parameter.query);
    if (action === "update")  return updateRow(e.parameter.folio, e.parameter.expediente, e.parameter.field, e.parameter.value);
    if (action === "create")  return createRow(e.parameter);
    if (action === "login")   return loginUser(e.parameter.usuario, e.parameter.clave);
    return respond({ error: "Acción no válida: " + action });
  } catch (err) {
    return respond({ error: "Error interno: " + err.message });
  }
}

function getAll() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return respond({ error: "Hoja no encontrada: " + SHEET_NAME });
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const result = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return respond(result);
}

function search(query) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return respond({ error: "Hoja no encontrada: " + SHEET_NAME });
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const q = (query || "").toLowerCase();
  const result = rows.slice(1).filter(row =>
    row.some(cell => String(cell).toLowerCase().includes(q))
  ).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return respond(result);
}

function updateRow(folio, expediente, field, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const colIndex = headers.indexOf(field);
  if (colIndex === -1) return respond({ error: "Campo no encontrado: " + field });

  for (let i = 1; i < rows.length; i++) {
    const coincide = expediente
      ? String(rows[i][1]) === String(expediente)   // busca por expediente (col B)
      : String(rows[i][0]) === String(folio);        // fallback a folio (col A)
    if (coincide) {
      sheet.getRange(i + 1, colIndex + 1).setValue(value);
      return respond({ success: true });
    }
  }
  return respond({ error: "Registro no encontrado" });
}

function createRow(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return respond({ error: "Hoja no encontrada: " + SHEET_NAME });
  const headers = sheet.getDataRange().getValues()[0];
  const newRow  = headers.map(h => params[h] || '');
  sheet.appendRow(newRow);
  return respond({ success: true });
}

function loginUser(usuario, clave) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Usuarios");
  if (!sheet) return respond({ error: "Hoja Usuarios no encontrada" });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(usuario || "").trim() &&
        String(rows[i][1]).trim() === String(clave   || "").trim()) {
      return respond({ success: true, nombre: String(rows[i][0]) });
    }
  }
  return respond({ error: "Usuario o contraseña incorrectos" });
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

URL de github pages:
https://genercn.github.io/patologias_page/