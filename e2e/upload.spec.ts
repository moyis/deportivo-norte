import { test, expect, type Page } from '@playwright/test';
import { ACCEPTED_TYPES, REASON_MESSAGE, STATUS_TEXT } from '../src/lib/upload-config';

// El link de subida es privado: sin el token no debe quedar ningún camino para
// subir. Estas pruebas fijan el contrato de marcado que consumirá el script del
// cliente (Task 6) y el estado de la ventana.

test.describe('Página de subida', () => {
  test('un link sin token no muestra el formulario', async ({ page }) => {
    await page.goto('/subir');
    await expect(page.getByText(REASON_MESSAGE.invalid)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);
  });

  test('un token equivocado tampoco muestra el formulario', async ({ page }) => {
    await page.goto('/subir?k=token-que-no-es');
    await expect(page.getByText(REASON_MESSAGE.invalid)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);
  });

  test('la página pide no ser indexada', async ({ page }) => {
    await page.goto('/subir');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  test('el home no linkea a /subir', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href*="/subir"]')).toHaveCount(0);
  });

  test('con el token la ventana está abierta', async ({ page }) => {
    test.skip(!process.env.UPLOAD_TOKEN, 'UPLOAD_TOKEN not set');

    await page.goto(`/subir?k=${process.env.UPLOAD_TOKEN}`);

    // El formulario existe y su contrato de marcado es el que espera Task 6.
    const form = page.locator('form');
    await expect(form).toHaveCount(1);
    await expect(form).toHaveAttribute('data-endpoint', '/api/upload-url');

    await expect(page.getByText(STATUS_TEXT.dropzone)).toBeVisible();

    const input = page.locator('input[type="file"][name="fotos"]');
    await expect(input).toHaveCount(1);
    await expect(input).toHaveAttribute('accept', Object.keys(ACCEPTED_TYPES).join(','));

    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);

    // La credencial vive en la URL del miembro, no en el HTML: ni el canonical
    // ni el og:url pueden arrastrar el `?k=`.
    const html = await page.content();
    expect(html).not.toContain(process.env.UPLOAD_TOKEN as string);
  });

  test('un token equivocado no queda escrito en el HTML', async ({ page }) => {
    await page.goto('/subir?k=token-que-no-es');
    const html = await page.content();
    expect(html).not.toContain('token-que-no-es');
  });
});

// El cliente de subida (Task 6): firma, PUT directo a R2 y confirmación.
// Las dos rutas propias y el host de R2 están mockeados, así que el bucket real
// nunca se toca. Ningún texto esperado se escribe a mano: todos salen de
// `upload-config`, para que copy y test no puedan separarse.

const TOKEN = process.env.UPLOAD_TOKEN as string;

const FOTO = {
  name: 'foto vieja.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
};

// Firma de mentira: el cliente no la verifica, solo la reenvía al PUT.
const FIRMA = {
  url: 'https://deportivo-norte-photos.acct123.r2.cloudflarestorage.com/photos/x.jpg?X-Amz-Signature=abc',
  key: 'photos/x.jpg',
  contentType: 'image/jpeg',
  receipt: '123.abc',
};

type Opciones = {
  /** Cuerpo que devuelve /api/upload-url cuando firma. */
  firma?: Record<string, string>;
  /** Rechazo del firmado: código HTTP y motivo (`FailureReason`). */
  firmaRechazo?: { status: number; reason: string };
  /**
   * Rechazo del firmado por nombre de archivo: devuelve el rechazo solo para el
   * archivo que coincide, y `null` para el resto. Sirve para una tanda mixta
   * (una foto que llega, otra rechazada) en la misma selección.
   */
  firmaRechazoDe?: (nombre: string) => { status: number; reason: string } | null;
  /** Devuelve un cuerpo que no es JSON válido: fuerza el `catch` externo. */
  firmaJsonRoto?: boolean;
  /** Respuesta de /api/upload-complete; por defecto `{ ok: true }`. */
  completar?: { status: number; body: unknown };
  /** Corta los primeros N PUT a R2; el resto sigue normal. */
  cortaPut?: number;
};

/** Lo que el servidor mockeado vio, para poder afirmarlo desde el test. */
type Espia = {
  firmas: number;
  puts: number;
  completados: number;
  putContentType: string | null;
};

async function abrir(page: Page, opciones: Opciones = {}): Promise<Espia> {
  const espia: Espia = { firmas: 0, puts: 0, completados: 0, putContentType: null };

  await page.route('**/api/upload-url', (route) => {
    espia.firmas += 1;

    if (opciones.firmaJsonRoto) {
      // 200 con Content-Type JSON pero cuerpo ilegible: el destructure tira.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '<html>boom' });
    }

    const cuerpo = route.request().postDataJSON() as { name?: string } | null;
    const nombre = cuerpo?.name ?? '';
    const rechazo = opciones.firmaRechazo ?? opciones.firmaRechazoDe?.(nombre) ?? null;

    if (rechazo) {
      const { status, reason } = rechazo;
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: REASON_MESSAGE[reason as keyof typeof REASON_MESSAGE],
          reason,
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opciones.firma ?? FIRMA),
    });
  });

  await page.route('**/api/upload-complete', (route) => {
    espia.completados += 1;
    return route.fulfill({
      status: opciones.completar?.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(opciones.completar?.body ?? { ok: true, size: FOTO.buffer.length }),
    });
  });

  await page.route('**/*.r2.cloudflarestorage.com/**', (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    espia.puts += 1;
    espia.putContentType = route.request().headers()['content-type'] ?? null;
    if (espia.puts <= (opciones.cortaPut ?? 0)) return route.abort('failed');
    return route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`/subir?k=${TOKEN}`);
  await expect(page.locator('input[type="file"][name="fotos"]')).toHaveCount(1);
  return espia;
}

const region = (page: Page) => page.locator('[aria-live="polite"]');
const filas = (page: Page) => region(page).locator('[data-fila]');
const fila = (page: Page, i: number) => filas(page).nth(i);

// Cadena de "gracias" con la cantidad ya resuelta, derivada de las constantes.
const gracias = (n: number) =>
  n === 1 ? STATUS_TEXT.thanksOne : STATUS_TEXT.thanksMany.replace('{n}', String(n));

// Cadena del resumen mixto, resuelta igual que en el cliente: no se escribe a
// mano la oración, se parten los mismos marcadores de `STATUS_TEXT.partial`.
const parcial = (ok: number, total: number) =>
  STATUS_TEXT.partial.replace('{ok}', String(ok)).replace('{total}', String(total));

async function elegir(page: Page, ...fotos: Array<typeof FOTO>) {
  await page.locator('input[type="file"][name="fotos"]').setInputFiles(fotos);
}

test.describe('Subida de fotos (cliente)', () => {
  test('una foto que llega se informa como llegada', async ({ page }) => {
    const espia = await abrir(page);
    await elegir(page, FOTO);

    await expect(filas(page)).toHaveCount(1);
    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'ok');
    await expect(fila(page, 0).locator('[data-nombre]')).toHaveText(FOTO.name);
    // No hay motivo de fallo en una fila que llegó.
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveCount(0);

    await expect(region(page)).toContainText(gracias(1));

    // El PUT salió una sola vez y con el Content-Type que devolvió el firmado.
    expect(espia.puts).toBe(1);
    expect(espia.putContentType).toBe(FIRMA.contentType);
    expect(espia.completados).toBe(1);
  });

  test('Review Focus 4: un nombre con emoji y 300 caracteres no rompe la lista', async ({
    page,
  }) => {
    // Nombre hostil: HTML que, si se inyectara, ejecutaría script; más emoji y
    // acentos para estirar el layout en un teléfono.
    const nombreHostil =
      '<img src=x onerror="document.title=\'pwned\'">' + '🎉📷'.repeat(30) + 'ñ'.repeat(200) + '.jpg';
    expect(nombreHostil.length).toBeGreaterThan(300);

    await abrir(page);
    await elegir(page, { ...FOTO, name: nombreHostil });

    await expect(filas(page)).toHaveCount(1);
    // El nombre se muestra como TEXTO: ni un nodo de más.
    await expect(fila(page, 0).locator('[data-nombre]')).toHaveText(nombreHostil);
    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'ok');

    // Ninguna etiqueta del nombre se volvió DOM, y el título del documento
    // conserva el suyo (el `onerror` del nombre jamás corrió).
    await expect(region(page).locator('img')).toHaveCount(0);
    expect(await page.title()).not.toContain('pwned');
  });

  test('una foto rechazada se informa con su motivo', async ({ page }) => {
    const espia = await abrir(page, { firmaRechazo: { status: 413, reason: 'size' } });
    await elegir(page, FOTO);

    await expect(filas(page)).toHaveCount(1);
    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveText(REASON_MESSAGE.size);

    // El rechazo del firmado corta ANTES del PUT y nunca se completa.
    expect(espia.puts).toBe(0);
    expect(espia.completados).toBe(0);
    // Y no hay ningún resumen de éxito.
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksOne);

    // La selección sobrevive: queda un camino manual para reintentar.
    await expect(fila(page, 0).locator('button')).toBeVisible();
  });

  test('Review Focus 3: si se corta la subida, la foto no figura como llegada', async ({
    page,
  }) => {
    const espia = await abrir(page, { cortaPut: 1 });
    await elegir(page, FOTO);

    await expect(filas(page)).toHaveCount(1);
    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveText(REASON_MESSAGE.network);

    // El PUT se cortó: no hay confirmación, y por lo tanto ningún "gracias".
    expect(espia.puts).toBe(1);
    expect(espia.completados).toBe(0);
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksOne);
    await expect(region(page)).not.toContainText('¡Gracias!');
  });

  test('el reintento vuelve a intentar la subida', async ({ page }) => {
    const espia = await abrir(page, { cortaPut: 1 });
    await elegir(page, FOTO);

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    expect(espia.puts).toBe(1);

    // El camino manual: "Subir más fotos" rehace la secuencia fallida.
    await region(page).getByRole('button', { name: STATUS_TEXT.more }).click();

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'ok');
    // Un reintento de verdad: nueva firma y nuevo PUT (la URL vieja puede haber
    // vencido), no una reutilización.
    expect(espia.firmas).toBe(2);
    expect(espia.puts).toBe(2);
    expect(espia.completados).toBe(1);
    expect(await region(page).innerText()).toContain(gracias(1));
  });

  test('Review Focus 5: elegir dos veces la misma foto sube dos objetos', async ({ page }) => {
    const espia = await abrir(page);
    await elegir(page, FOTO, FOTO);

    // Dos selecciones, dos filas: no se deduplica por nombre.
    await expect(filas(page)).toHaveCount(2);
    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'ok');
    await expect(fila(page, 1)).toHaveAttribute('data-estado', 'ok');

    expect(espia.firmas).toBe(2);
    expect(espia.puts).toBe(2);
    expect(espia.completados).toBe(2);
    await expect(region(page)).toContainText(gracias(2));
  });

  test('el botón de la fila fallada reintenta esa foto', async ({ page }) => {
    const espia = await abrir(page, { cortaPut: 1 });
    await elegir(page, FOTO);

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    expect(espia.puts).toBe(1);

    // El camino manual por fila, con el texto de `retryFailed`.
    await fila(page, 0).getByRole('button', { name: STATUS_TEXT.retryFailed }).click();

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'ok');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveCount(0);
    // Firma nueva y PUT nuevo: no reusa la URL vencida.
    expect(espia.firmas).toBe(2);
    expect(espia.puts).toBe(2);
    expect(await region(page).innerText()).toContain(gracias(1));
  });

  test('una foto que pasa el tope se rechaza sin firmar', async ({ page }) => {
    const espia = await abrir(page);
    // El tope sale de la página (`data-max-bytes`), no de un literal del test:
    // un byte más de lo permitido alcanza para que no valga la pena firmarla.
    const tope = await page
      .locator('form[data-endpoint]')
      .evaluate((el) => Number((el as HTMLElement).dataset.maxBytes));

    await elegir(page, { ...FOTO, buffer: Buffer.alloc(tope + 1) });

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveText(REASON_MESSAGE['too-large']);
    // No se gastó una firma ni un PUT en algo que el servidor iba a rechazar.
    expect(espia.firmas).toBe(0);
    expect(espia.puts).toBe(0);
  });

  test('una confirmación negativa no se lee como llegada', async ({ page }) => {
    // El PUT sí llegó a R2, pero la confirmación negó la foto (peso o faltante).
    // Es el caso que el brief subraya: la fila NO puede decir "llegó".
    const espia = await abrir(page, {
      completar: { status: 200, body: { ok: false, reason: 'too-large' } },
    });

    await page.locator('input[type="file"][name="fotos"]').setInputFiles([FOTO]);

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveText(REASON_MESSAGE['too-large']);
    // La confirmación sí se pidió; lo que se niega es la llegada.
    expect(espia.puts).toBe(1);
    expect(espia.completados).toBe(1);
    // Ni una frase de gracias en la región viva.
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksOne);
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksMany.replace('{n}', '1'));
  });

  test('otra confirmación negativa (missing) tampoco llega', async ({ page }) => {
    const espia = await abrir(page, {
      completar: { status: 200, body: { ok: false, reason: 'missing' } },
    });

    await page.locator('input[type="file"][name="fotos"]').setInputFiles([FOTO]);

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveText(REASON_MESSAGE['missing']);
    expect(espia.completados).toBe(1);
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksOne);
  });

  test('una tanda mixta resume cuántas llegaron', async ({ page }) => {
    // Una foto llega, la otra la rechaza el firmado: el resumen debe contar las
    // dos, no celebrar la tanda entera.
    const buena = { ...FOTO, name: 'buena.jpg' };
    const mala = { ...FOTO, name: 'mala.jpg' };

    await abrir(page, {
      firmaRechazoDe: (nombre) => (nombre === mala.name ? { status: 403, reason: 'closed' } : null),
    });
    await page.locator('input[type="file"][name="fotos"]').setInputFiles([buena, mala]);

    await expect(filas(page)).toHaveCount(2);
    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'ok');
    await expect(fila(page, 1)).toHaveAttribute('data-estado', 'error');

    const texto = parcial(1, 2);
    await expect(region(page)).toContainText(texto);
    // Y no es una de las frases de tanda completa, ni la de la foto sola.
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksOne);
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksMany.replace('{n}', '1'));
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksMany.replace('{n}', '2'));
  });

  test('un firmado ilegible se reporta como fallo de red, no como llegada', async ({ page }) => {
    // Un JSON roto en la firma hace saltar el `catch` externo: la fila no puede
    // quedar en "llegó", y el bug debe quedar registrado en consola.
    const errores: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errores.push(msg.text());
    });

    const espia = await abrir(page, { firmaJsonRoto: true });
    await page.locator('input[type="file"][name="fotos"]').setInputFiles([FOTO]);

    await expect(fila(page, 0)).toHaveAttribute('data-estado', 'error');
    await expect(fila(page, 0).locator('[data-motivo]')).toHaveText(REASON_MESSAGE.network);
    await expect(region(page)).not.toContainText(STATUS_TEXT.thanksOne);
    // El error de programación no queda invisible.
    expect(espia.puts).toBe(0);
    expect(errores.length).toBeGreaterThan(0);
  });
});
