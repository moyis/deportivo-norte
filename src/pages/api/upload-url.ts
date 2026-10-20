/**
 * Ruta de firma de subidas de fotos históricas
 * Decide si esta foto puede subirse y, si puede, devuelve el PUT presignado
 * (el navegador sube los bytes directo a R2) junto al recibo que después
 * autoriza el borrado. El orden de decisión es token → plazo → tipo → tamaño →
 * techo del bucket, y todo camino de error falla cerrado.
 */

import type { APIRoute } from 'astro';
import { presignPutObject, prefixUsage } from '../../lib/r2';
import {
  REASON_MESSAGE,
  MAX_FILE_BYTES,
  buildObjectKey,
  getUploadState,
  isAcceptedType,
  type FailureReason,
} from '../../lib/upload-config';
import {
  CEILING_BYTES,
  CEILING_OBJECTS,
  constantTimeEqual,
  readR2Env,
  receiptSecret,
  signReceipt,
} from '../../lib/upload-server';

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
  let payload: { k?: unknown; name?: unknown; type?: unknown; size?: unknown };

  try {
    payload = await request.json();
  } catch {
    // Un cuerpo ilegible es, a los ojos del miembro, un link inválido.
    return fail(403, 'invalid');
  }

  const provided = typeof payload.k === 'string' ? payload.k : null;
  const type = typeof payload.type === 'string' ? payload.type : '';
  const size = typeof payload.size === 'number' ? payload.size : Number.NaN;

  // 1) Token y plazo: de acá en adelante, la convocatoria está abierta. El
  // token se compara en tiempo constante (`getUploadState` no puede importar
  // código de servidor, así que el comparador se lo pasa la ruta).
  const token = process.env.UPLOAD_TOKEN ?? null;
  const state = getUploadState({
    provided,
    token,
    until: process.env.UPLOAD_UNTIL ?? null,
    equals: constantTimeEqual,
  });

  if (state === 'invalid') return fail(403, 'invalid');
  if (state === 'closed') return fail(403, 'closed');

  // 2) Tipo y 3) tamaño: baratos y no tocan la red.
  if (!isAcceptedType(type)) return fail(415, 'type');
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) return fail(413, 'size');

  // 4) Techo del bucket. Cualquier falla acá es fail-closed: mejor no recibir
  // una foto que quedarse sin bucket o autorizar un borrado sin respaldo.
  const env = readR2Env(process.env);
  const secret = receiptSecret(process.env);

  if (!env || !secret) {
    console.error('upload-url: falta configuración de R2 o el token de la convocatoria');
    return fail(503, 'ceiling');
  }

  try {
    // El cupo se pide con el techo real: sin el cap, la página del listado
    // (1000) pasaría por techo y se aceptarían fotos de más.
    const usage = await prefixUsage(env, CEILING_OBJECTS);
    if (usage.bytes >= CEILING_BYTES || usage.objects >= CEILING_OBJECTS) return fail(503, 'ceiling');

    const key = buildObjectKey({ type, prefix: env.R2_PREFIX });
    const url = await presignPutObject({ env, key, contentType: type });
    const receipt = await signReceipt({ key, secret });

    return json(200, { url, key, contentType: type, receipt });
  } catch (error) {
    // Un error de firmado o de listado NUNCA puede caer en un 200.
    console.error('upload-url: no se pudo firmar la subida', error);
    return fail(503, 'ceiling');
  }
};
