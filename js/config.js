export const API_URL = 'https://script.google.com/macros/s/AKfycbyfVxc0BWrZDIJtMBlShXxrL_JXpD3ZGzBP79hIc44p-ZXvTqQ3L4xbMxZn0HSIm2Su/exec';

export const FIELDS = [
  { key: 'folio',            label: 'Folio',                              type: 'text',   section: 'Identificación' },
  { key: 'expediente',       label: 'Expediente',                         type: 'text',   section: null },
  { key: 'nombre_paciente',  label: 'Nombre del Paciente',                type: 'text',   section: null, full: true },
  { key: 'nivel_patologia',  label: 'Nivel o Tipo de Patología',          type: 'select', options: ['', '1', '2', '3', '4', 'Papanicolau'], section: 'Patología' },
  { key: 'fecha_entrega',    label: 'Fecha de entrega',                   type: 'date',   section: null },
  { key: 'fecha_recepcion',  label: 'Fecha de recepción de resultados digitales',   type: 'date',   section: null },
  { key: 'patologia_fisica', label: 'Fecha de recepción de resultados físicos', type: 'date', section: null },
  { key: 'fecha_revision_medico', label: 'Fecha Revisión del Médico',     type: 'date',   section: null },
  { key: 'requiere_cita',    label: 'Requiere Cita',                      type: 'select', options: ['', 'Sí', 'No'], section: 'Cita' },
  { key: 'fecha_cita',       label: 'Fecha Cita',                         type: 'date',   section: null },
  { key: 'enviado_paciente', label: 'Fecha de envío a Paciente',                 type: 'date',   section: 'Seguimiento' },
  { key: 'monto',            label: 'Monto',                              type: 'text',   section: 'Contabilidad' },
  { key: 'fecha_pago',       label: 'Fecha Pago Contabilidad',            type: 'date',   section: null },
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
