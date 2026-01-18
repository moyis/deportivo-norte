import { test, expect } from "@playwright/test";

test.describe("404 Page", () => {
  test("displays 404 page for non-existent routes", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
  });

  test("has correct title and meta description", async ({ page }) => {
    await page.goto("/non-existent-page");

    await expect(page).toHaveTitle(/Página no encontrada/);

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute(
      "content",
      /La página que buscas no existe/
    );
  });

  test("displays 404 content correctly", async ({ page }) => {
    await page.goto("/random-invalid-url");

    // Check 404 heading is visible
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("404");

    // Check football-themed error message is visible
    await expect(page.getByText("¡Al travesaño!")).toBeVisible();
    await expect(
      page.getByText(/casi, pero no entró/i)
    ).toBeVisible();

    // Check return home link exists
    const homeLink = page.getByRole("link", { name: "Volver al inicio" });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("return home link navigates to homepage", async ({ page }) => {
    await page.goto("/does-not-exist");

    const homeLink = page.getByRole("link", { name: "Volver al inicio" });
    await homeLink.click();

    await expect(page).toHaveURL("/");
    await expect(page).toHaveTitle(/Club Deportivo Norte/);
  });

  test("no unexpected console errors on 404 page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Filter out expected 404 network error
        if (!text.includes("status of 404")) {
          errors.push(text);
        }
      }
    });

    await page.goto("/non-existent-route");
    await page.waitForLoadState("networkidle");

    expect(errors).toHaveLength(0);
  });

  test("404 page is responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/invalid-page");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    const homeLink = page.getByRole("link", { name: "Volver al inicio" });
    await expect(homeLink).toBeVisible();

    // Check button is clickable (not cut off)
    const box = await homeLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  });
});
