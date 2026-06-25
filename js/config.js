export const API_URL = 'https://script.google.com/macros/s/AKfycbxCizixBrUqO0EQ3K8cp2vmRcRxgFla66gb-3aIhSHNhCBuxK-L0lp6uMOZ6r3Ngm__/exec';

export const FIELDS = [
  { key: 'folio',            label: 'Folio',                              type: 'text',   section: 'Identificación' },
  { key: 'expediente',       label: 'Expediente',                         type: 'text',   section: null },
  { key: 'nombre_paciente',  label: 'Nombre del Paciente',                type: 'text',   section: null, full: true },
  { key: 'nivel_patologia',  label: 'Nivel o Tipo de Patología',          type: 'text',   section: 'Patología' },
  { key: 'fecha_entrega',    label: 'Fecha de entrega',                   type: 'date',   section: null },
  { key: 'fecha_recepcion',  label: 'Fecha de recepción de resultados',   type: 'date',   section: null },
  { key: 'patologia_fisica', label: 'Patología Física Recibida',          type: 'select', options: ['', 'Sí', 'No'], section: null },
  { key: 'requiere_cita',    label: 'Requiere Cita',                      type: 'select', options: ['', 'Sí', 'No'], section: 'Cita' },
  { key: 'fecha_cita',       label: 'Fecha Cita',                         type: 'date',   section: null },
  { key: 'enviado_paciente', label: 'Enviado a Paciente',                 type: 'select', options: ['', 'Sí', 'No'], section: 'Seguimiento' },
  { key: 'monto',            label: 'Monto',                              type: 'text',   section: 'Contabilidad' },
  { key: 'fecha_pago',       label: 'Fecha Pago Contabilidad',            type: 'date',   section: null },
];

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
};
