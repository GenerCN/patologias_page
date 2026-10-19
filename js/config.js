export const API_URL = 'https://script.google.com/macros/s/AKfycbyfVxc0BWrZDIJtMBlShXxrL_JXpD3ZGzBP79hIc44p-ZXvTqQ3L4xbMxZn0HSIm2Su/exec';

/* Etiquetas anteriores: normalizeRecord las sigue aceptando como respaldo
   para encontrar la columna en la hoja si KEY_MAP no coincide. */
export const LABEL_ALIASES = {
  nombre_paciente:       'Nombre del Paciente',
  nivel_patologia:       'Nivel o Tipo de Patología',
  fecha_recepcion:       'Fecha de recepción de resultados digitales',
  patologia_fisica:      'Fecha de recepción de resultados físicos',
  fecha_revision_medico: 'Fecha Revisión del Médico',
  requiere_cita:         'Requiere Cita',
  fecha_cita:            'Fecha Cita',
  enviado_paciente:      'Fecha de envío a Paciente',
  fecha_pago:            'Fecha Pago Contabilidad',
};

export const FIELDS = [
  { key: 'id',               label: 'ID',                                 type: 'hidden' },
  { key: 'folio',            label: 'Folio',                              type: 'text',   section: 'Identificación' },
  { key: 'expediente',       label: 'Expediente',                         type: 'text',   section: null },
  { key: 'nombre_paciente',  label: 'Nombre del paciente',                type: 'text',   section: null, full: true },
  // El valor guardado sigue siendo 'Papanicolau'; solo se muestra como 'Papanicolaou' (ver nivelTexto).
  { key: 'nivel_patologia',  label: 'Nivel o tipo de patología',          type: 'select', options: ['', '1', '2', '3', '4', '5', 'Papanicolau'], section: 'Patología' },
  { key: 'fecha_entrega',    label: 'Fecha de entrega',                   type: 'date',   section: null },
  { key: 'fecha_recepcion',  label: 'Fecha de resultados digitales',      type: 'date',   section: null },
  { key: 'patologia_fisica', label: 'Fecha de resultados físicos',        type: 'date',   section: null },
  { key: 'fecha_revision_medico', label: 'Fecha de revisión médica',      type: 'date',   section: null },
  { key: 'requiere_cita',    label: '¿Requiere cita?',                    type: 'select', options: ['', 'Sí', 'No'], section: 'Cita' },
  { key: 'fecha_cita',       label: 'Fecha de la cita',                   type: 'date',   section: null },
  { key: 'enviado_paciente', label: 'Fecha de envío al paciente',         type: 'date',   section: 'Seguimiento' },
  { key: 'monto',            label: 'Monto',                              type: 'text',   section: 'Contabilidad' },
  { key: 'fecha_pago',       label: 'Fecha de pago',                      type: 'date',   section: null },
];

// Secciones editables por usuario (coincide con section: en FIELDS)
// La clave es el nombre de usuario en minúsculas sin acentos
export const PERMISSIONS = {
  farmacia:     ['Identificación', 'Patología', 'Cita'],
  admision:     ['Cita', 'Seguimiento'],
  contabilidad: ['Contabilidad'],
  admin:        ['Identificación', 'Patología', 'Cita', 'Seguimiento', 'Contabilidad'],
};

export const KEY_MAP = {
  id:               'ID',
  folio:            'Folio',
  expediente:       'Expediente',
  nombre_paciente:  'Nombre del Paciente',
  nivel_patologia:  'Nivel o Tipo de Patología',
  fecha_entrega:    'Fecha de entrega',
  fecha_recepcion:  'Fecha de recepción de resultados',
  patologia_fisica: 'Patología Física Recibida',
  requiere_cita:    'Requiere Cita',
  fecha_cita:       'Fecha Cita',
  enviado_paciente: 'Enviado a Paciente',
  monto:            'Monto',
  fecha_pago:       'Fecha Pago Contabilidad',
  fecha_revision_medico: 'Fecha Revisión del Médico',
};
