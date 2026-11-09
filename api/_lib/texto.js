// Limpieza de texto libre que llega de formularios o pasarelas de pago (Tally, Stripe).
// Defensa en la entrada: el panel de administración además escapa todo al mostrarlo.

// Caracteres de control, de ancho cero y separadores de línea Unicode.
const INVISIBLES = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Devuelve el texto sin caracteres de control ni < > (que permitirían inyectar HTML),
 * con espacios normalizados y longitud máxima.
 */
export function limpiarTexto(valor, max = 100) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .normalize('NFC')
    .replace(INVISIBLES, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
