import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  r2Endpoint,
  presignPutObject,
  r2Fetch,
  objectSize,
  deleteObject,
  prefixUsage,
  type R2Env,
} from './r2';

// Credenciales de mentira: el firmado es cripto pura, no sale ningún pedido de acá.
const env: R2Env = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'deportivo-norte-photos',
  R2_PREFIX: 'photos/',
};

const INSTANT = new Date('2026-10-19T12:00:00Z');

afterEach(() => {
  vi.unstubAllGlobals();
});

// La URL que el navegador va a PUTear, y la forma que el CSP tiene que nombrar igual.
describe('presignPutObject', () => {
  it('firma un PUT contra el host virtual-hosted del bucket', async () => {
    const url = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: INSTANT });

    expect(new URL(url).origin).toBe('https://deportivo-norte-photos.acct123.r2.cloudflarestorage.com');
    expect(new URL(url).pathname).toBe('/photos/x.jpg');
    expect(new URL(url).searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('600');
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fija el content-type dentro de la firma, que es la única defensa de tipo que R2 aplica', async () => {
    const url = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: INSTANT });
    const signedHeaders = decodeURIComponent(new URL(url).searchParams.get('X-Amz-SignedHeaders')!);

    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('host');
  });

  it('firma igual con el mismo reloj y las mismas credenciales, y distinto con otro contenido', async () => {
    const url = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: INSTANT });
    const again = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: INSTANT });
    const other = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/png', now: INSTANT });

    // Si no fuera determinista, el techo y la lógica de reintento no se podrían razonar.
    expect(again).toBe(url);
    expect(other).not.toBe(url);
  });

  it('firma distinto cuando cambia el reloj, así el vencimiento es real', async () => {
    const soon = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: INSTANT });
    const later = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: new Date(INSTANT.getTime() + 10 * 60 * 1000) });

    // Mismo recurso y credenciales: la firma solo puede cambiar por el X-Amz-Date inyectado.
    expect(later).not.toBe(soon);
  });

  it('firma HEAD y DELETE por headers, sin query de firma ni filtrado del secreto', async () => {
    // La red se mira pero no se toca: la firma se arma antes del pedido.
    const seen: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      seen.push(request);
      return new Response(null, { status: request.method === 'HEAD' ? 200 : 204 });
    }));

    await r2Fetch({ env, method: 'HEAD', path: '/photos/x.jpg', now: INSTANT });
    await r2Fetch({ env, method: 'DELETE', path: '/photos/x.jpg', now: INSTANT });

    const [head, del] = seen;
    expect(head.method).toBe('HEAD');
    expect(del.method).toBe('DELETE');
    // Firma por headers (signQuery apagado): el secreto solo vive adentro de la firma.
    expect(new URL(head.url).searchParams.has('X-Amz-Signature')).toBe(false);
    expect(new URL(del.url).searchParams.has('X-Amz-Signature')).toBe(false);
    expect(head.headers.get('Authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(del.headers.get('Authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(head.headers.get('Authorization')).not.toContain(env.R2_SECRET_ACCESS_KEY);
  });

  it('arma el endpoint con el bucket y la cuenta', () => {
    expect(r2Endpoint(env)).toBe('https://deportivo-norte-photos.acct123.r2.cloudflarestorage.com');
  });
});

// Respuesta canónica de ListObjectsV2: dos objetos, la lista cortada en dos páginas.
const PAGE_ONE = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>deportivo-norte-photos</Name>
  <Prefix>photos/</Prefix>
  <KeyCount>2</KeyCount>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>TOKEN-2</NextContinuationToken>
  <Contents><Key>photos/a.jpg</Key><Size>1000000</Size></Contents>
  <Contents><Key>photos/b.jpg</Key><Size>2000000</Size></Contents>
</ListBucketResult>`;

const PAGE_TWO = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>deportivo-norte-photos</Name>
  <Prefix>photos/</Prefix>
  <IsTruncated>false</IsTruncated>
  <Contents><Key>photos/c.jpg</Key><Size>500</Size></Contents>
</ListBucketResult>`;

describe('prefixUsage', () => {
  it('suma los bytes y cuenta los objetos siguiendo la paginación', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String((input as Request).url ?? input));
      const page = calls.length === 1 ? PAGE_ONE : PAGE_TWO;
      return new Response(page, { status: 200 });
    }));

    expect(await prefixUsage(env)).toEqual({ bytes: 3000500, objects: 3 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('list-type=2');
    expect(calls[0]).toContain('prefix=photos%2F');
    expect(calls[1]).toContain('continuation-token=TOKEN-2');
  });

  it('corta cuando ya alcanzó el techo de objetos y no pide más páginas', async () => {
    let served = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      served += 1;
      return new Response(PAGE_ONE, { status: 200 });
    }));

    // El techo que usa Task 3: con 2 objetos ya cumplidos, la primera página alcanza.
    expect(await prefixUsage(env, 2)).toEqual({ bytes: 3000000, objects: 2 });
    expect(served).toBe(1);
  });
});

describe('objectSize', () => {
  it('devuelve null cuando el objeto no está (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    expect(await objectSize(env, 'photos/x.jpg')).toBeNull();
  });

  it('devuelve la cantidad de bytes de content-length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200, headers: { 'content-length': '2048' } })));

    expect(await objectSize(env, 'photos/x.jpg')).toBe(2048);
  });
});

describe('deleteObject', () => {
  it('manda un DELETE y no devuelve el objeto ni las credenciales', async () => {
    let seen: Request | undefined;
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      seen = request;
      return new Response(null, { status: 204 });
    }));

    const result = await deleteObject(env, 'photos/x.jpg');

    expect(seen?.method).toBe('DELETE');
    expect(new URL(seen!.url).pathname).toBe('/photos/x.jpg');
    expect(result).toBeUndefined();
    expect(JSON.stringify(result)).toBeUndefined();
  });
});

// Única prueba de que la firma es válida de verdad: los mocks pasarían con una firma equivocada.
// Sin credenciales reales se saltea sola (localmente todavía no hay).
describe.skipIf(!process.env.R2_ACCESS_KEY_ID)('integración contra R2 (opt-in)', () => {
  it('firma un PUT, sube 20 bytes, los mide y borra', async () => {
    const realEnv: R2Env = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
      R2_BUCKET: process.env.R2_BUCKET!,
      R2_PREFIX: process.env.R2_PREFIX ?? 'photos/',
    };
    const key = `${realEnv.R2_PREFIX}_integration-test.bin`;

    const url = await presignPutObject({ env: realEnv, key, contentType: 'application/octet-stream' });
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(20) });
    expect(put.status).toBe(200);

    expect(await objectSize(realEnv, key)).toBe(20);

    await deleteObject(realEnv, key);
  });
});
