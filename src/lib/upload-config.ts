/**
 * Reglas compartidas de la subida de fotos históricas
 * Decisiones puras y client-safe: límites, tipos aceptados, cómo se arma la
 * clave en R2, si la convocatoria sigue abierta y el texto que comparten la
 * página y los tests. No lee process.env ni secretos: también lo importa el navegador.
 */

// Límite por archivo: 25 MB.
export const MAX_FILE_BYTES = 26214400;

// Prefijo (carpeta) por defecto dentro del bucket R2.
export const DEFAULT_PREFIX = 'photos/';

// Tipos aceptados y la extensión con la que se guardan.
export const ACCEPTED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
} as const;

/** Estado de la ventana de carga según el link compartido. */
export type UploadState = 'invalid' | 'open' | 'closed';

/** Motivo por el que una foto no llegó a subirse. */
export type FailureReason =
  | 'invalid'
  | 'closed'
  | 'type'
  | 'size'
  | 'ceiling'
  | 'too-large'
  | 'missing'
  | 'network';

/**
 * Devuelve la extensión con la que se guarda un tipo aceptado, o null si no lo es.
 */
export function extensionFor(type: string): string | null {
  return ACCEPTED_TYPES[type as keyof typeof ACCEPTED_TYPES] ?? null;
}

/** Indica si el tipo MIME está entre los aceptados. */
export function isAcceptedType(type: string): boolean {
  return extensionFor(type) !== null;
}

/**
 * Arma la clave del objeto en R2. Nunca usa el nombre original del archivo:
 * el sello de tiempo es URL-safe (sin milisegundos ni dos puntos).
 */
export function buildObjectKey({
  type,
  prefix = DEFAULT_PREFIX,
  now = new Date(),
  id = crypto.randomUUID(),
}: {
  type: string;
  prefix?: string;
  now?: Date;
  id?: string;
}): string {
  const ext = extensionFor(type);

  // "2026-10-19T12:00:00.000Z" -> "2026-10-19T12-00-00Z"
  const stamp = `${now.toISOString().slice(0, 19)}Z`.replace(/:/g, '-');

  return `${prefix}${stamp}-${id}.${ext}`;
}

/**
 * Decide si la convocatoria sigue abierta. Falla cerrado: un token que falta o
 * no coincide, o un plazo ausente o ilegible, siempre dan 'invalid'.
 *
 * El comparador se inyecta desde el servidor para poder comparar el token en
 * tiempo constante: este módulo también corre en el navegador y no puede
 * importar `upload-server` (arrastraría código de servidor al bundle).
 */
export function getUploadState({
  provided,
  token,
  until,
  now = new Date(),
  equals = (a: string, b: string) => a === b,
}: {
  provided: string | null | undefined;
  token: string | null | undefined;
  until: string | null | undefined;
  now?: Date;
  equals?: (a: string, b: string) => boolean;
}): UploadState {
  // Sin token en la config, o sin nada con qué compararlo, no hay ventana.
  if (!token || !until || typeof provided !== 'string') return 'invalid';
  // El comparador solo ve strings: un token provisto que falta ya salió arriba.
  if (!equals(token, provided)) return 'invalid';

  const deadline = new Date(until);
  if (Number.isNaN(deadline.getTime())) return 'invalid';

  return now.getTime() >= deadline.getTime() ? 'closed' : 'open';
}

// Texto por motivo de fallo.
export const REASON_MESSAGE: Record<FailureReason, string> = {
  invalid: 'Ese link no es válido.',
  closed: 'La convocatoria ya cerró.',
  type: 'No es una foto que podamos recibir (JPEG, PNG, WebP o HEIC).',
  size: 'No pudimos leer el tamaño de esa foto.',
  'too-large': 'Pesa más de 25 MB.',
  ceiling: 'Por ahora no podemos recibir más fotos.',
  missing: 'La foto no llegó completa.',
  network: 'No pudimos subir esta foto. Probá de nuevo.',
};

// Copia de la página: los e2e también afirman estos textos.
export const STATUS_TEXT = Object.freeze({
  dropzone: 'Arrastrá tus fotos acá o tocá para elegirlas. Podés mandar varias a la vez.',
  hint: 'Aceptamos JPEG, PNG, WebP y HEIC de hasta 25 MB cada una.',
  thanksOne: '¡Gracias! Llegó la foto.',
  thanksMany: '¡Gracias! Llegaron las {n} fotos.',
  partial: 'Llegaron {ok} de {total}. Estas no pudieron subirse:',
  more: 'Subir más fotos',
  retryFailed: 'Reintentar',
});
