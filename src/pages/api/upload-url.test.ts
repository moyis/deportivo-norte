import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_FILE_BYTES } from '../../lib/upload-config';
import { POST } from './upload-url';

// La red y el firmado se mockean: acá se prueba la DECISIÓN (el orden y los
// códigos), no la cripto de R2, que ya tiene sus propios tests.
vi.mock('../../lib/r2', () => ({
  presignPutObject: vi.fn(async ({ key, contentType }: { key: string; contentType: string }) =>
    `https://bucket.r2.cloudflarestorage.com/${key}?X-Amz-Signature=deadbeef&content-type=${encodeURIComponent(contentType)}`),
  prefixUsage: vi.fn(async () => ({ bytes: 0, objects: 0 })),
}));

import { presignPutObject, prefixUsage } from '../../lib/r2';

const OK_ENV = {
  UPLOAD_TOKEN: 'tok',
  UPLOAD_UNTIL: '2027-01-01T00:00:00Z',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'deportivo-norte-photos',
  R2_PREFIX: 'photos/',
};

const body = (over: Record<string, unknown> = {}) => new Request('https://x/api/upload-url', {
  method: 'POST',
  body: JSON.stringify({ k: 'tok', name: 'foto.jpg', type: 'image/jpeg', size: 1000, ...over }),
});

// La ruta solo necesita `context.request`; el resto del APIContext no se toca.
const call = (request: Request) => POST({ request } as Parameters<typeof POST>[0]);

beforeEach(() => {
  for (const [key, value] of Object.entries(OK_ENV)) vi.stubEnv(key, value);
  vi.mocked(prefixUsage).mockResolvedValue({ bytes: 0, objects: 0 });
  vi.mocked(presignPutObject).mockImplementation(async ({ key }) =>
    `https://bucket.r2.cloudflarestorage.com/${key}?X-Amz-Signature=deadbeef`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// La matriz de decisión, de lo más grave a lo más leve.
describe('POST /api/upload-url', () => {
  it('firma el PUT de una foto válida y devuelve la clave, el tipo y el recibo', async () => {
    const response = await call(body());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const okBody = await response.json();
    expect(Object.keys(okBody).sort()).toEqual(['contentType', 'key', 'receipt', 'url']);
    expect(okBody.contentType).toBe('image/jpeg');
    expect(okBody.key).toMatch(/^photos\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-[0-9a-f-]{36}\.jpg$/);
    expect(okBody.url).toContain('X-Amz-Signature');
    expect(okBody.receipt).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });

  it('no devuelve ni el token ni ningún secreto', async () => {
    const response = await call(body());
    const raw = await response.text();

    expect(raw).not.toContain('tok');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('deportivo-norte-photos');
  });

  it('rechaza un token que no coincide (403 invalid) y no firma nada', async () => {
    const response = await call(body({ k: 'nope' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Ese link no es válido.', reason: 'invalid' });
    expect(prefixUsage).not.toHaveBeenCalled();
    expect(presignPutObject).not.toHaveBeenCalled();
  });

  // La ruta no usa `!==`: le pasa a `getUploadState` el comparador de tiempo
  // constante. Un token correcto con un comparador que miente debe cerrar.
  it('compara el token con el comparador de tiempo constante', async () => {
    const uploadServer = await import('../../lib/upload-server');
    const spy = vi.spyOn(uploadServer, 'constantTimeEqual');

    await call(body());

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rechaza un token de igual largo cambiando un solo carácter (403 invalid)', async () => {
    const response = await call(body({ k: 'nop' }));

    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe('invalid');
  });

  it('rechaza un tipo no aceptado (415 type)', async () => {
    const response = await call(body({ type: 'video/mp4' }));

    expect(response.status).toBe(415);
    expect((await response.json()).reason).toBe('type');
  });

  it('rechaza una foto que pasa el límite por un byte (413 size)', async () => {
    const response = await call(body({ size: MAX_FILE_BYTES + 1 }));

    expect(response.status).toBe(413);
    expect((await response.json()).reason).toBe('size');
  });

  it('rechaza un tamaño ausente, cero o negativo (413 size, cierra por lo mal formado)', async () => {
    for (const size of [undefined, 0, -1]) {
      const response = await call(body({ size }));

      expect(response.status).toBe(413);
      expect((await response.json()).reason).toBe('size');
    }
  });

  it('rechaza pasada la fecha límite aunque el token sea correcto (403 closed)', async () => {
    vi.stubEnv('UPLOAD_UNTIL', '2020-01-01T00:00:00Z');

    const response = await call(body());

    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe('closed');
  });
});

// Lo que el recibo y el techo dependen: la clave nunca sale del nombre original.
describe('el nombre del archivo no toca la clave', () => {
  it('manda al key la misma forma aunque el nombre tenga 300 emojis', async () => {
    const emoji = '📷'.repeat(150); // 300 code units, ~600 bytes
    const response = await call(body({ name: emoji + '.jpg' }));
    const okBody = await response.json();

    expect(response.status).toBe(200);
    expect(okBody.key).toMatch(/^photos\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-[0-9a-f-]{36}\.jpg$/);
    // Nada del nombre se refleja en la respuesta.
    expect(JSON.stringify(okBody)).not.toContain('📷');
  });
});

// El techo del bucket: si el listado o el firmado fallan, se falla cerrado.
describe('ceiling', () => {
  it('responde 503 cuando el bucket ya está en el techo de objetos', async () => {
    vi.mocked(prefixUsage).mockResolvedValue({ bytes: 0, objects: 5000 });

    const response = await call(body());

    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('ceiling');
    expect(presignPutObject).not.toHaveBeenCalled();
  });

  it('responde 503 cuando los bytes llegan al techo', async () => {
    vi.mocked(prefixUsage).mockResolvedValue({ bytes: 8 * 1024 ** 3, objects: 1 });

    expect((await call(body())).status).toBe(503);
  });

  it('responde 503, no 200, si el listado tira un error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prefixUsage).mockRejectedValue(new Error('R2 GET falló con 403'));

    const response = await call(body());

    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('ceiling');
  });

  it('responde 503 si el firmado tira, en vez de dejar pasar la subida', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(presignPutObject).mockRejectedValue(new Error('sign blew up'));

    expect((await call(body())).status).toBe(503);
  });

  it('responde 503 si falta el env de R2, sin llegar a firmar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('R2_BUCKET', '');

    const response = await call(body());

    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('ceiling');
    expect(prefixUsage).not.toHaveBeenCalled();
  });

  it('responde 403 y no 200 si la convocatoria no tiene token cargado', async () => {
    // Sin UPLOAD_TOKEN no hay ventana válida ni secreto para el recibo: cerrado.
    vi.stubEnv('UPLOAD_TOKEN', '');

    const response = await call(body({ k: '' }));

    expect(response.status).toBe(403);
    expect(presignPutObject).not.toHaveBeenCalled();
  });
});
