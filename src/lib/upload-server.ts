/**
 * Lado servidor de la subida de fotos históricas
 * Reúne lo que no puede vivir en `upload-config` (que también corre en el
 * navegador): lee las credenciales de R2, guarda los techos del bucket,
 * compara el token en tiempo constante y firma/verifica el recibo que
 * autoriza el borrado. No sabe nada de HTTP: eso es de la ruta.
 */

import type { R2Env } from './r2';
import { DEFAULT_PREFIX } from './upload-config';

/** Techo total del bucket: 8 GiB. */
export const CEILING_BYTES = 8 * 1024 ** 3;

/** Techo de objetos: 5000 fotos. */
export const CEILING_OBJECTS = 5000;

// Etiqueta con la que se deriva la clave del HMAC: ata el recibo a este uso.
const RECEIPT_LABEL = 'upload-receipt';

// Vida del recibo: cubre de sobra el ida y vuelta entre firmar y borrar.
const RECEIPT_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Lee las credenciales de R2 desde un env ya resuelto (no `process.env`, para
 * poder testearlo). Devuelve null apenas falta una: un bucket a medias no es
 * un bucket. El prefijo cae al default si no viene.
 */
export function readR2Env(env: Record<string, string | undefined>): R2Env | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;

  return {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX: env.R2_PREFIX || DEFAULT_PREFIX,
  };
}

/**
 * Secreto del recibo: se deriva del token de la convocatoria, así el operador
 * no tiene que cargar un secreto más. Devuelve null (no '') cuando falta.
 */
export function receiptSecret(env: Record<string, string | undefined>): string | null {
  return env.UPLOAD_TOKEN || null;
}

/**
 * Compara dos strings en tiempo constante. Un largo distinto puede cortar
 * temprano; con largos iguales recorre todo y recién ahí decide.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

  return diff === 0;
}

/** Firma el recibo de una subida: "<issuedAtEpochSeconds>.<hexHmacSha256>". */
export async function signReceipt({
  key,
  secret,
  now = new Date(),
}: {
  key: string;
  secret: string;
  now?: Date;
}): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const signature = await hmacHex(`${RECEIPT_LABEL}:${key}:${issuedAt}`, secret);

  return `${issuedAt}.${signature}`;
}

/**
 * Verifica un recibo contra la clave que dice proteger. Falla cerrado:
 * formato roto, firma que no cierra o recibo viejo devuelven false.
 */
export async function verifyReceipt({
  receipt,
  key,
  secret,
  now = new Date(),
  maxAgeMs = RECEIPT_MAX_AGE_MS,
}: {
  receipt: string;
  key: string;
  secret: string;
  now?: Date;
  maxAgeMs?: number;
}): Promise<boolean> {
  const dot = receipt.indexOf('.');
  if (dot <= 0) return false;

  const issuedAt = Number(receipt.slice(0, dot));
  if (!Number.isInteger(issuedAt)) return false;

  // El recibo vale desde que se emite y por una ventana corta: así no se repite.
  const age = now.getTime() - issuedAt * 1000;
  if (age < 0 || age > maxAgeMs) return false;

  const expected = await hmacHex(`${RECEIPT_LABEL}:${key}:${issuedAt}`, secret);

  return constantTimeEqual(receipt.slice(dot + 1), expected);
}

// HMAC-SHA256 con WebCrypto (global en Node 20+), en hex minúscula.
async function hmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
