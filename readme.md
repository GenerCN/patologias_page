Campos de la hoja de calculo iniciando en A1 y terminando en L1:
Folio	Expediente	Nombre del Paciente	Nivel o Tipo de Patología	Fecha de entrega	Fecha de recepción de resultados	Patología Física Recibida	Requiere Cita	Fecha Cita	Enviado a Paciente	Monto	Fecha Pago Contabilidad				


App Script para manejar la hoja de cálculo:
const SHEET_NAME = "Hoja 1";

function doGet(e) {
  const action = e.parameter.action;
  if (action === "getAll") return getAll();
  if (action === "search") return search(e.parameter.query);
  if (action === "update") return updateRow(
    e.parameter.folio, 
    e.parameter.field, 
    e.parameter.value
  );
  return respond({ error: "Acción no válida" });
}

function getAll() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
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
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const q = query.toLowerCase();
  const result = rows.slice(1).filter(row =>
    row.some(cell => String(cell).toLowerCase().includes(q))
  ).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return respond(result);
}

function updateRow(folio, field, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const colIndex = headers.indexOf(field);
  if (colIndex === -1) return respond({ error: "Campo no encontrado" });
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(folio)) {
      sheet.getRange(i + 1, colIndex + 1).setValue(value);
      return respond({ success: true });
    }
  }
  return respond({ error: "Folio no encontrado" });
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

URL de github pages:
https://genercn.github.io/patologias_page/