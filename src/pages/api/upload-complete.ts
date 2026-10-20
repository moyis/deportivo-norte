/**
 * Ruta de confirmación de subidas de fotos históricas
 * El PUT presignado no puede limitar el tamaño del cuerpo que recibe, así que
 * el único lugar donde se aplica el tope de 25 MB es acá: se mira el objeto que
 * acaba de aterrizar y, si se pasó, se borra. Es también el único código que
 * borra algo del bucket, por lo que el recibo es la única credencial que
 * autoriza un DELETE. El orden es recibo → prefijo → tamaño → borrado, y todo
 * camino de error falla cerrado: nunca un 200 sobre una comprobación fallida.
 */

import type { APIRoute } from 'astro';
import { objectSize, deleteObject } from '../../lib/r2';
import { REASON_MESSAGE, MAX_FILE_BYTES, type FailureReason } from '../../lib/upload-config';
import { readR2Env, receiptSecret, verifyReceipt } from '../../lib/upload-server';

export const prerender = false;

// JSON en todas las respuestas, también en los errores.
const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Respuesta de rechazo con el texto compartido de `upload-config`.
const fail = (status: number, reason: FailureReason): Response =>
  json(status, { error: REASON_MESSAGE[reason], reason });

export const POST: APIRoute = async ({ request }) => {
  let payload: { key?: unknown; receipt?: unknown };

  try {
    payload = await request.json();
  } catch {
    // Un cuerpo ilegible es, a los ojos del miembro, un link inválido.
    return fail(403, 'invalid');
  }

  const key = typeof payload.key === 'string' ? payload.key : '';
  const receipt = typeof payload.receipt === 'string' ? payload.receipt : '';

  // 1) Recibo: credencial y plazo en una sola verificación. Va ANTES de tocar
  // R2 — un recibo forjado o viejo no puede hacer que el servidor mire ni borre
  // un objeto.
  const env = readR2Env(process.env);
  const secret = receiptSecret(process.env);

  if (!env || !secret) {
    console.error('upload-complete: falta configuración de R2 o el token de la convocatoria');
    return fail(503, 'ceiling');
  }

  const authorized = await verifyReceipt({ receipt, key, secret });
  if (!authorized) return fail(403, 'invalid');

  // 2) Prefijo: el recibo va atado a la clave, pero igual se exige que la clave
  // viva bajo el mismo prefijo con el que se firmó la subida (el del env ya
  // resuelto, no el default por su cuenta: si difirieran, se rechazaría una
  // foto legítima).
  if (!key.startsWith(env.R2_PREFIX)) return fail(403, 'invalid');

  try {
    // 3) Tamaño: manda el número real del bucket, no lo que declaró el cliente.
    const size = await objectSize(env, key);

    // La subida que nunca llegó no es un error: no hay nada que borrar.
    if (size === null) return json(200, { ok: false, reason: 'missing' });

    // 4) Sobrepaso: acá y solo acá se borra.
    if (size > MAX_FILE_BYTES) {
      await deleteObject(env, key);
      return json(200, { ok: false, reason: 'too-large' });
    }

    return json(200, { ok: true, size });
  } catch (error) {
    // Un HEAD 403 o un DELETE fallido NUNCA puede caer en un 200 ni disfrazarse
    // de 'missing': eso sería leer un error como un objeto ausente y dejar la
    // foto fuera del control de tamaño. Falla cerrado.
    console.error('upload-complete: no se pudo comprobar o borrar la subida', error);
    return fail(503, 'ceiling');
  }
};
