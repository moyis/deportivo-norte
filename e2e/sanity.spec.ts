import { test, expect } from "@playwright/test";

test.describe("Sanity checks", () => {
  test("homepage loads successfully", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("has correct title and meta description", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Club Deportivo Norte/);

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute(
      "content",
      /Club Deportivo Norte/
    );
  });

  test("main sections are visible", async ({ page }) => {
    await page.goto("/");

    // Navbar
    await expect(
      page.getByRole("navigation", { name: "Navegación principal" })
    ).toBeVisible();
    await expect(page.getByText("Deportivo Norte").first()).toBeVisible();

    // Main content sections
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator("#asociate")).toBeVisible();
    await expect(page.locator("#historia")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();

    // Footer (main page footer with id "contacto")
    await expect(page.locator("footer#contacto")).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");

    const mainNav = page.getByRole("navigation", {
      name: "Navegación principal",
    });

    // Check that nav links exist in main navigation
    await expect(
      mainNav.getByRole("link", { name: "Asociate", exact: true })
    ).toBeVisible();
    await expect(mainNav.getByRole("link", { name: "El Club" })).toBeVisible();
    await expect(
      mainNav.getByRole("link", { name: "Preguntas Frecuentes" })
    ).toBeVisible();
  });

  test("no console errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(errors).toHaveLength(0);
  });
});
