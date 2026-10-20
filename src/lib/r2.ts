/**
 * Acceso firmado a Cloudflare R2 para las fotos históricas
 * Presigna el PUT que hace el navegador (los bytes nunca pasan por Vercel) y
 * firma el HEAD, el DELETE y el listado que usan las rutas del servidor.
 * Solo se ejecuta del lado del servidor: lee credenciales desde el env.
 */

import { AwsClient } from 'aws4fetch';

/** Variables de entorno del bucket de R2 (todas obligatorias). */
export interface R2Env {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PREFIX: string;
}

// Métodos que firma este módulo por headers (el PUT va aparte, por query).
type R2Method = 'HEAD' | 'DELETE' | 'GET';

// Techo de objetos por página del listado: corta el sumar de bytes temprano.
const DEFAULT_LIST_CAP = 1000;

// Vida de la firma del PUT: alcanza para que arranque una subida lenta de un celular.
const PRESIGN_EXPIRES_SECONDS = 600;

/** Host virtual-hosted del bucket: esta es la cadena exacta que el CSP tiene que nombrar. */
export function r2Endpoint(env: R2Env): string {
  return `https://${env.R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/**
 * Cliente de firma: uno por llamada, con las credenciales de este env.
 * La región 'auto' y el servicio 's3' son los que espera R2.
 */
function awsClient(env: R2Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

/**
 * Un pedido firmado contra R2. Un estado no-2xx es un error y lanza: nada aguas
 * arriba puede confundir un error con un dato real (un 403 leído como "0 bytes"
 * saltaría el techo, y un DELETE fallido quedaría invisible). Los estados que sí
 * son un resultado legítimo para el llamador se declaran en `allow`.
 */
async function send({
  env,
  method,
  path,
  query,
  body,
  contentType,
  now,
  allow = [],
}: {
  env: R2Env;
  method: R2Method;
  path: string;
  query?: Record<string, string>;
  body?: BodyInit;
  contentType?: string;
  now?: Date;
  allow?: number[];
}): Promise<Response> {
  const url = new URL(buildPath(path), r2Endpoint(env));
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;

  const client = awsClient(env);
  const request = await client.sign(url.toString(), {
    method,
    headers,
    body,
    // Fecha explícita en UTC (sin milisegundos); `now` la fija en los tests.
    aws: { datetime: formatAmzDate(now ?? new Date()) },
  });

  const response = await fetch(request);

  if (!response.ok && !allow.includes(response.status)) {
    throw new Error(`R2 ${method} ${url.pathname} falló con ${response.status}`);
  }

  return response;
}

/**
 * Presigna un PutObject para que el navegador suba la foto directo a R2.
 * Devuelve la URL firmada (nunca un Request: el cliente la usa tal cual) y el
 * Content-Type queda pegado en la firma, así que R2 rechaza un cuerpo que no
 * coincida con el declarado.
 */
export async function presignPutObject({
  env,
  key,
  contentType,
  now = new Date(),
}: {
  env: R2Env;
  key: string;
  contentType: string;
  now?: Date;
}): Promise<string> {
  const url = new URL(buildPath(key), r2Endpoint(env));
  // aws4fetch ignora `aws.expires` al firmar por query (solo lo emite si falta), así que la
  // ventana se fija acá; si no, la firma duraría 24 h y sería un agujero reusable.
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_EXPIRES_SECONDS));

  const client = awsClient(env);
  const request = await client.sign(url.toString(), {
    method: 'PUT',
    // La firma de query no mete los headers comunes, pero aws4fetch sí firma los que
    // se le pasan; con `allHeaders` el content-type queda adentro de la firma.
    headers: { 'Content-Type': contentType },
    aws: {
      signQuery: true,
      allHeaders: true,
      // `X-Amz-Date` es el instante exacto (reloj sin milisegundos), no un relleno interno.
      datetime: formatAmzDate(now),
    },
  });

  return request.url;
}

/**
 * Pedido firmado por headers (no por query) contra el bucket: el que usan HEAD,
 * DELETE y el listado. Lanza si R2 responde un error.
 */
export async function r2Fetch({
  env,
  method,
  path,
  query,
  now = new Date(),
}: {
  env: R2Env;
  method: R2Method;
  path: string;
  query?: Record<string, string>;
  now?: Date;
}): Promise<Response> {
  return send({ env, method, path, query, now });
}

/** Tamaño real del objeto en bytes, o null si no está (subida que nunca llegó). */
export async function objectSize(env: R2Env, key: string): Promise<number | null> {
  // 404 es un resultado legítimo (la foto nunca llegó), no un error.
  const response = await send({ env, method: 'HEAD', path: key, allow: [404] });

  if (response.status === 404) return null;

  const length = Number(response.headers.get('content-length'));

  return Number.isFinite(length) ? length : null;
}

/** Borra un objeto del bucket. Un borrado fallido lanza: nunca queda invisible. */
export async function deleteObject(env: R2Env, key: string): Promise<void> {
  await send({ env, method: 'DELETE', path: key });
}

/**
 * Suma los bytes y cuenta los objetos bajo el prefijo, leyendo lo que hay de
 * verdad en el bucket (no hay contador aparte que se desincronice). Sigue
 * `<IsTruncated>`/`<NextContinuationToken>` y corta al llegar a `cap` objetos.
 * Un error del listado lanza: jamás se informa un techo falso.
 */
export async function prefixUsage(env: R2Env, cap: number = DEFAULT_LIST_CAP): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;

  while (true) {
    const query: Record<string, string> = { 'list-type': '2', prefix: env.R2_PREFIX };
    if (token) query['continuation-token'] = token;

    const response = await send({ env, method: 'GET', path: '/', query });
    const xml = await response.text();

    bytes += sumSizes(xml);
    objects += countObjects(xml);

    // Se corta ni bien se alcanza el techo: no hace falta seguir paginando.
    if (objects >= cap || !isTruncated(xml)) break;

    // El token va des-escapado: R2/S3 escapan el texto del XML y reenviarlo crudo
    // corrompería la paginación.
    const next = contentOf(xml, 'NextContinuationToken');
    token = next === undefined ? undefined : unescapeXml(next);
  }

  return { bytes, objects };
}

// Fecha en el formato de SigV4: 20261019T120000Z.
function formatAmzDate(now: Date): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

// Arma el path codificando cada segmento por separado: un `#` o un `?` en la clave
// rompería la resolución relativa de `new URL(key, endpoint)` (la cortaría en silencio).
function buildPath(key: string): string {
  const clean = key.replace(/^\/+/, '');
  return `/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

// Des-escapado mínimo de XML (texto de elementos): entidades con nombre y numéricas.
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

// Estos tres parseos siguen el estilo de youtube.ts: regex sobre el XML crudo.
function isTruncated(xml: string): boolean {
  return contentOf(xml, 'IsTruncated') === 'true';
}

function contentOf(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'))?.[1];
}

function sumSizes(xml: string): number {
  let total = 0;
  for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) total += Number(match[1]);
  return total;
}

function countObjects(xml: string): number {
  return Array.from(xml.matchAll(/<Contents>/g)).length;
}
