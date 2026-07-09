// Formata número para exibição: (98) 9 8220-9719
export function formatPhone(value) {
  if (!value) return '';
  // Remove tudo que não for dígito
  const digits = value.replace(/\D/g, '');

  // Remove código do país 55 se presente
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;

  if (local.length === 11) {
    // Celular: (XX) 9 XXXX-XXXX
    return `(${local.slice(0,2)}) ${local[2]} ${local.slice(3,7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `(${local.slice(0,2)}) ${local.slice(2,6)}-${local.slice(6)}`;
  }
  return value;
}

// Máscara ao digitar — mantém dígitos e aplica formato em tempo real
export function maskPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 3) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits[2]} ${digits.slice(3)}`;
  return `(${digits.slice(0,2)}) ${digits[2]} ${digits.slice(3,7)}-${digits.slice(7)}`;
}

// Remove máscara para salvar no banco (formato: 55XXXXXXXXXXX)
export function unformatPhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 11 && !digits.startsWith('55')) return '55' + digits;
  return digits;
}

export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  // Week starts on Monday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, day] = dateStr.split('-');
  const end = new Date(dateStr);
  end.setDate(end.getDate() + 6);
  const [ey, em, ed] = end.toISOString().split('T')[0].split('-');
  return `${day}/${m} – ${ed}/${em}/${ey}`;
}
