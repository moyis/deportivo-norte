import { describe, it, expect } from 'vitest';
import {
  constantTimeEqual,
  readR2Env,
  receiptSecret,
  signReceipt,
  verifyReceipt,
  CEILING_BYTES,
  CEILING_OBJECTS,
} from './upload-server';

// El recibo es lo único que protege el borrado: si se puede falsificar, cualquiera
// borra fotos ajenas. Por eso cada campo tiene que estar adentro de la firma.
describe('receipts', () => {
  it('firma un recibo atado a la clave, y lo acepta recién emitido', async () => {
    const receipt = await signReceipt({ key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:00:00Z') });

    // "<issuedAtEpochSeconds>.<hexHmacSha256>", con el instante derivado del mismo `now`.
    const issuedAt = Math.floor(Date.parse('2026-10-19T12:00:00Z') / 1000);
    expect(receipt.startsWith(`${issuedAt}.`)).toBe(true);
    expect(receipt).toMatch(/^\d+\.[0-9a-f]{64}$/);

    expect(await verifyReceipt({ receipt, key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:05:00Z') })).toBe(true);
  });

  it('rechaza un recibo de otra clave', async () => {
    const receipt = await signReceipt({ key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:00:00Z') });

    expect(await verifyReceipt({ receipt, key: 'photos/b.jpg', secret: 's' })).toBe(false);
  });

  it('rechaza una firma alterada', async () => {
    const receipt = await signReceipt({ key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:00:00Z') });

    expect(await verifyReceipt({ receipt: receipt.replace(/.$/, '0'), key: 'photos/a.jpg', secret: 's' })).toBe(false);
  });

  it('rechaza un recibo firmado con otro secreto', async () => {
    const receipt = await signReceipt({ key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:00:00Z') });

    expect(await verifyReceipt({ receipt, key: 'photos/a.jpg', secret: 'other' })).toBe(false);
  });

  it('rechaza un recibo viejo: no se puede repetir', async () => {
    const receipt = await signReceipt({ key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:00:00Z') });

    expect(await verifyReceipt({ receipt, key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T13:00:00Z') })).toBe(false);
  });

  it('rechaza un recibo con formato basura, sin explotar', async () => {
    expect(await verifyReceipt({ receipt: 'garbage', key: 'photos/a.jpg', secret: 's' })).toBe(false);
  });
});

// Comparación de tokens: la longitud puede cortar temprano, el contenido no.
describe('constantTimeEqual', () => {
  it('compara el contenido de strings del mismo largo', () => {
    expect(constantTimeEqual('token', 'token')).toBe(true);
    expect(constantTimeEqual('token', 'tokeN')).toBe(false);
    // Diferir recién en el último carácter también tiene que fallar.
    expect(constantTimeEqual('aaaaaaaa', 'aaaaaaab')).toBe(false);
  });

  it('corta temprano con largos distintos y con lo vacío', () => {
    expect(constantTimeEqual('token', 'token!')).toBe(false);
    expect(constantTimeEqual('', 'x')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

// Lectura de credenciales: falta una sola y no hay bucket, nunca un valor a medias.
describe('readR2Env', () => {
  const full = {
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'bucket',
    R2_PREFIX: 'photos/',
  };

  it('devuelve el env completo cuando está todo', () => {
    expect(readR2Env(full)).toEqual(full);
  });

  it('aplica el prefijo por defecto si falta R2_PREFIX', () => {
    const withoutPrefix = { ...full, R2_PREFIX: '' };

    expect(readR2Env(withoutPrefix)?.R2_PREFIX).toBe('photos/');
  });

  it('devuelve null apenas falta una credencial', () => {
    for (const missing of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      const partial: Record<string, string> = { ...full };
      delete partial[missing];

      expect(readR2Env(partial)).toBeNull();
    }
  });

  it('devuelve null sin ningún env', () => {
    expect(readR2Env({})).toBeNull();
  });
});

describe('receiptSecret', () => {
  it('deriva el secreto del token de la convocatoria', () => {
    expect(receiptSecret({ UPLOAD_TOKEN: 'tok' })).toBe('tok');
  });

  it('devuelve null (no un string vacío) sin token', () => {
    expect(receiptSecret({})).toBeNull();
    expect(receiptSecret({ UPLOAD_TOKEN: '' })).toBeNull();
  });
});

// Los techos del bucket: se exportan para que la ruta no los re-invente.
describe('techos', () => {
  it('fija el techo de bytes en 8 GiB y el de objetos en 5000', () => {
    expect(CEILING_BYTES).toBe(8 * 1024 ** 3);
    expect(CEILING_OBJECTS).toBe(5000);
  });
});
