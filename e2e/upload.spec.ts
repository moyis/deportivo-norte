import { test, expect } from '@playwright/test';
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
