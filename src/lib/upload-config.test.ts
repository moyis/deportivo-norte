import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_BYTES,
  ACCEPTED_TYPES,
  isAcceptedType,
  extensionFor,
  buildObjectKey,
  getUploadState,
  REASON_MESSAGE,
} from './upload-config';

// window state — the boundary that decides whether a shared link still works
describe('getUploadState', () => {
  it('deja la ventana abierta mientras el plazo no pasó', () => {
    expect(getUploadState({ provided: 'x', token: 'x', until: '2026-11-01T00:00:00Z', now: new Date('2026-10-31T23:59:59Z') })).toBe('open');
  });

  it('cierra la ventana cuando el plazo ya pasó', () => {
    expect(getUploadState({ provided: 'x', token: 'x', until: '2026-11-01T00:00:00Z', now: new Date('2026-11-01T00:00:01Z') })).toBe('closed');
  });

  it('es inválido sin token provisto', () => {
    expect(getUploadState({ provided: null, token: 'x', until: '2026-11-01T00:00:00Z' })).toBe('invalid');
  });

  it('es inválido con un token que no coincide', () => {
    expect(getUploadState({ provided: 'wrong', token: 'x', until: '2026-11-01T00:00:00Z' })).toBe('invalid');
  });

  // fail closed: a broken or absent deadline never opens the window
  it('es inválido con un plazo que no es fecha', () => {
    expect(getUploadState({ provided: 'x', token: 'x', until: 'no-es-fecha' })).toBe('invalid');
  });

  it('es inválido sin token ni plazo', () => {
    expect(getUploadState({ provided: 'x', token: undefined, until: undefined })).toBe('invalid');
  });
});

// Review Focus 1: a valid HEIC is accepted, an unknown type is not, and the key ignores the filename
describe('accepted types and extensions', () => {
  it('acepta HEIC y rechaza lo desconocido', () => {
    expect(isAcceptedType('image/heic')).toBe(true);
    expect(extensionFor('image/heic')).toBe('heic');
    expect(extensionFor('image/avif')).toBeNull();
    expect(extensionFor('')).toBeNull();
  });
});

// Review Focus 4 & 5: names never reach the key; same-instant calls stay unique
describe('buildObjectKey', () => {
  it('arma una clave URL-safe sin mirar el nombre del archivo', () => {
    const key = buildObjectKey({ type: 'image/jpeg', prefix: 'photos/', now: new Date('2026-10-19T12:00:00Z'), id: 'abc' });
    expect(key).toBe('photos/2026-10-19T12-00-00Z-abc.jpg');
  });

  it('no colisiona entre dos llamadas en el mismo instante', () => {
    expect(buildObjectKey({ type: 'image/png', now: new Date('2026-10-19T12:00:00Z'), id: 'abc' }))
      .not.toBe(buildObjectKey({ type: 'image/png', now: new Date('2026-10-19T12:00:00Z'), id: 'def' }));
  });
});

// the copy the e2e tests assert
describe('pinned limits and copy', () => {
  it('fija el mensaje de tamaño y el límite de bytes', () => {
    expect(REASON_MESSAGE['size']).toBe('Pesa más de 25 MB.');
    expect(MAX_FILE_BYTES).toBe(26214400);
  });

  it('fija el orden de los tipos aceptados', () => {
    expect(Object.keys(ACCEPTED_TYPES)).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
  });
});
