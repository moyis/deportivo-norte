import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_FILE_BYTES } from '../../lib/upload-config';
import { signReceipt } from '../../lib/upload-server';
import { POST } from './upload-complete';

// R2 se mockea: acá se prueba la DECISIÓN (el orden, los códigos y —sobre
// todo— cuándo se borra), no la firma de R2, que ya tiene sus propios tests.
vi.mock('../../lib/r2', () => ({
  objectSize: vi.fn(async () => 1000),
  deleteObject: vi.fn(async () => {}),
}));

import { objectSize, deleteObject } from '../../lib/r2';

const OK_ENV = {
  UPLOAD_TOKEN: 'tok',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'deportivo-norte-photos',
  R2_PREFIX: 'photos/',
};

const KEY = 'photos/2026-10-19T12-00-00Z-0f0f0f0f-0000-4000-8000-000000000000.jpg';

// El recibo tiene que ser real: se firma con el mismo código que usa la ruta.
const receiptFor = (key: string) => signReceipt({ key, secret: 'tok' });

const body = async (over: Record<string, unknown> = {}, key = KEY) =>
  new Request('https://x/api/upload-complete', {
    method: 'POST',
    body: JSON.stringify({ key, receipt: await receiptFor(key), ...over }),
  });

// La ruta solo necesita `context.request`; el resto del APIContext no se toca.
const call = async (request: Request) => POST({ request } as Parameters<typeof POST>[0]);

beforeEach(() => {
  for (const [key, value] of Object.entries(OK_ENV)) vi.stubEnv(key, value);
  vi.mocked(objectSize).mockResolvedValue(1000);
  vi.mocked(deleteObject).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/upload-complete', () => {
  it('confirma el tamaño real del objeto que acaba de llegar', async () => {
    const response = await call(await body());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ ok: true, size: 1000 });
    expect(objectSize).toHaveBeenCalledExactlyOnceWith(expect.anything(), KEY);
    // Una foto legítima jamás se toca: el borrado vive solo en la rama de sobrepaso.
    expect(deleteObject).not.toHaveBeenCalled();
  });

  // Review Focus 2: lo declarado no vale; manda el tamaño real del objeto.
  it('borra una foto que pesa más que el límite aunque se haya declarado chica', async () => {
    vi.mocked(objectSize).mockResolvedValue(MAX_FILE_BYTES + 1);

    const response = await call(await body());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, reason: 'too-large' });
    expect(deleteObject).toHaveBeenCalledExactlyOnceWith(expect.anything(), KEY);
  });

  // Una subida cortada no llegó: no hay nada que borrar.
  it('avisa que la foto no llegó (200 missing) y no borra nada', async () => {
    vi.mocked(objectSize).mockResolvedValue(null);

    const response = await call(await body());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, reason: 'missing' });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  // Un recibo forjado o viejo no puede hacer que el servidor toque un objeto.
  it('rechaza un recibo forjado (403) sin llegar a tocar R2', async () => {
    const forged = `${Math.floor(Date.now() / 1000)}.${'0'.repeat(64)}`;

    const response = await call(await body({ receipt: forged }));

    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe('invalid');
    expect(objectSize).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('rechaza un recibo vencido (403) sin llegar a tocar R2', async () => {
    const stale = await signReceipt({ key: KEY, secret: 'tok', now: new Date(Date.now() - 60 * 60 * 1000) });

    const response = await call(await body({ receipt: stale }));

    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe('invalid');
    expect(objectSize).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  // La guarda del prefijo: un recibo legítimo de OTRA carpeta no sirve acá.
  it('rechaza un recibo válido de una clave fuera del prefijo (403)', async () => {
    const response = await call(await body({}, 'otros/ajena.jpg'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Ese link no es válido.', reason: 'invalid' });
    expect(objectSize).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
