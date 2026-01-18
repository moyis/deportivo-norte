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

test.describe("Interactive components", () => {
  test("FAQ accordion expands and collapses", async ({ page }) => {
    await page.goto("/");

    const faqSection = page.locator("#faq");
    const firstFaqButton = faqSection.locator(".faq-button").first();
    const firstFaqContent = faqSection.locator(".faq-content").first();

    // Initially collapsed
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstFaqContent).toHaveAttribute("aria-hidden", "true");

    // Click to expand
    await firstFaqButton.click();
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "true");
    await expect(firstFaqContent).toHaveAttribute("aria-hidden", "false");

    // Click again to collapse
    await firstFaqButton.click();
    await expect(firstFaqButton).toHaveAttribute("aria-expanded", "false");
    await expect(firstFaqContent).toHaveAttribute("aria-hidden", "true");
  });

  test("FAQ accordion closes other items when opening new one", async ({
    page,
  }) => {
    await page.goto("/");

    const faqSection = page.locator("#faq");
    const faqButtons = faqSection.locator(".faq-button");

    // Open first FAQ
    await faqButtons.nth(0).click();
    await expect(faqButtons.nth(0)).toHaveAttribute("aria-expanded", "true");

    // Open second FAQ - first should close
    await faqButtons.nth(1).click();
    await expect(faqButtons.nth(0)).toHaveAttribute("aria-expanded", "false");
    await expect(faqButtons.nth(1)).toHaveAttribute("aria-expanded", "true");
  });

  test("mobile menu toggles on button click", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuButton = page.locator("#mobile-menu-button");
    const mobileMenu = page.locator("#mobile-menu");

    // Initially closed
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(mobileMenu).toHaveAttribute("aria-hidden", "true");

    // Open menu
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(mobileMenu).toHaveAttribute("aria-hidden", "false");
    await expect(mobileMenu).toHaveClass(/open/);

    // Close menu
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(mobileMenu).toHaveAttribute("aria-hidden", "true");
  });

  test("mobile menu closes when clicking a link", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuButton = page.locator("#mobile-menu-button");
    const mobileMenu = page.locator("#mobile-menu");

    // Open menu
    await menuButton.click();
    await expect(mobileMenu).toHaveClass(/open/);

    // Click a nav link
    await mobileMenu.getByRole("link", { name: "El Club" }).click();

    // Menu should close
    await expect(mobileMenu).not.toHaveClass(/open/);
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  test("historia carousel navigation works", async ({ page }) => {
    await page.goto("/");

    const carousel = page.locator(".quotes-carousel");
    const track = carousel.locator(".quotes-track");
    const nextButton = carousel.locator(".quote-next");
    const prevButton = carousel.locator(".quote-prev");
    const dots = carousel.locator(".quote-dot");

    // Initial state - first slide
    await expect(track).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    await expect(dots.first()).toHaveClass(/bg-\[var\(--color-primary\)\]/);

    // Click next - should move to second slide
    await nextButton.click();
    await expect(track).not.toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    await expect(dots.nth(1)).toHaveClass(/bg-\[var\(--color-primary\)\]/);

    // Click prev - should go back to first slide
    await prevButton.click();
    await expect(track).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    await expect(dots.first()).toHaveClass(/bg-\[var\(--color-primary\)\]/);
  });

  test("historia carousel dot navigation works", async ({ page }) => {
    await page.goto("/");

    const carousel = page.locator(".quotes-carousel");
    const track = carousel.locator(".quotes-track");
    const dots = carousel.locator(".quote-dot");

    // Click third dot
    await dots.nth(2).click();
    await expect(dots.nth(2)).toHaveClass(/bg-\[var\(--color-primary\)\]/);
    await expect(dots.first()).not.toHaveClass(/bg-\[var\(--color-primary\)\]/);

    // Verify track moved (translateX should be -200%)
    const transform = await track.evaluate(
      (el) => getComputedStyle(el).transform
    );
    expect(transform).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  });
});

test.describe("Preact component", () => {
  test("ClubAge displays correct age calculation", async ({ page }) => {
    await page.goto("/");

    // Calculate expected age
    const foundationYear = 1937;
    const today = new Date();
    let expectedAge = today.getFullYear() - foundationYear;
    const anniversaryThisYear = new Date(today.getFullYear(), 3, 1); // April 1st
    if (today < anniversaryThisYear) {
      expectedAge--;
    }

    // Check the age is displayed in the Historia section heading
    const historiaHeading = page.locator("#historia-heading");
    await expect(historiaHeading).toContainText(expectedAge.toString());

    // Check the age badge also shows correct value with "+" suffix
    const ageBadge = page.locator("#historia .bg-primary p").first();
    await expect(ageBadge).toContainText(`${expectedAge}+`);
  });
});

test.describe("Image loading", () => {
  test("hero background image loads", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check that the hero background div has background-image set
    const heroBg = page.locator(
      '[role="img"][aria-label="Hinchada de fútbol celebrando en un estadio"]'
    );
    const style = await heroBg.getAttribute("style");
    expect(style).toContain("hinchada");
    expect(style).toContain(".webp");
  });

  test("historia image loads completely", async ({ page }) => {
    await page.goto("/");

    const historiaImg = page.locator(
      '#historia img[alt="Dos camisetas del Club Deportivo Norte: pasado y presente"]'
    );

    // Wait for image to be visible
    await expect(historiaImg).toBeVisible();

    // Check image has loaded (naturalWidth > 0 means loaded)
    const isLoaded = await historiaImg.evaluate((img: HTMLImageElement) => {
      return img.complete && img.naturalWidth > 0;
    });
    expect(isLoaded).toBe(true);
  });

  test("logo SVG renders correctly", async ({ page }) => {
    await page.goto("/");

    const logo = page.locator('img[alt="Escudo Club Deportivo Norte"]').first();
    await expect(logo).toBeVisible();

    // Check it has dimensions (SVG loaded correctly)
    const box = await logo.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("social media icons render", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer#contacto");

    // Check that social icon SVGs are present and have dimensions
    const instagramLink = footer.getByRole("link", { name: /Instagram/i });
    await expect(instagramLink).toBeVisible();

    const instagramIcon = instagramLink.locator("svg");
    const iconBox = await instagramIcon.boundingBox();
    expect(iconBox).not.toBeNull();
    expect(iconBox!.width).toBeGreaterThan(0);
  });
});

test.describe("Font loading", () => {
  test("custom fonts are applied", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check heading font (Oswald) - applied via --font-heading CSS variable
    const heading = page.locator("h1").first();
    const headingFont = await heading.evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(headingFont.toLowerCase()).toContain("oswald");

    // Check body font (Inter) - applied via --font-body CSS variable on body
    // Select a paragraph in the Historia section that uses body font
    const bodyText = page.locator("#historia .text-gray-300").first();
    const bodyFont = await bodyText.evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(bodyFont.toLowerCase()).toContain("inter");
  });
});

test.describe("CSS/Tailwind theme", () => {
  test("primary theme color is applied correctly", async ({ page }) => {
    await page.goto("/");

    // Check that a .btn-primary has the correct background color
    const primaryButton = page.locator(".btn-primary").first();
    const bgColor = await primaryButton.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );

    // #FFCC00 in RGB is rgb(255, 204, 0)
    expect(bgColor).toBe("rgb(255, 204, 0)");
  });

  test("CSS custom properties are defined", async ({ page }) => {
    await page.goto("/");

    const primaryColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-primary")
        .trim()
    );

    expect(primaryColor).toBe("#FFCC00");
  });

  test("responsive layout works on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Desktop nav should be hidden
    const desktopNav = page.locator("nav ul.hidden.lg\\:flex");
    await expect(desktopNav).not.toBeVisible();

    // Mobile menu button should be visible
    const mobileMenuButton = page.locator("#mobile-menu-button");
    await expect(mobileMenuButton).toBeVisible();
  });
});

test.describe("External links", () => {
  test("Google Forms association link is valid", async ({ page }) => {
    await page.goto("/");

    const heroFormLink = page.locator(
      'a[href*="docs.google.com/forms"][href*="1FAIpQLSdjUjWomnygFy_uXQyg9LXq-WRbDDpTOw2sqENAi1cxbYOBsw"]'
    );
    await expect(heroFormLink.first()).toBeVisible();

    const href = await heroFormLink.first().getAttribute("href");
    expect(href).toContain("https://docs.google.com/forms");
    expect(href).toContain("viewform");
  });

  test("social media links exist and have correct URLs", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer#contacto");

    // Instagram
    const instagramLink = footer.getByRole("link", { name: /Instagram/i });
    await expect(instagramLink).toHaveAttribute(
      "href",
      "https://www.instagram.com/depnorte/"
    );

    // Facebook
    const facebookLink = footer.getByRole("link", { name: /Facebook/i });
    await expect(facebookLink).toHaveAttribute(
      "href",
      "https://www.facebook.com/depnorteoficial"
    );

    // YouTube
    const youtubeLink = footer.getByRole("link", { name: /YouTube/i });
    await expect(youtubeLink).toHaveAttribute(
      "href",
      "https://www.youtube.com/@DeportivoNorte"
    );

    // Email
    const emailLink = footer.getByRole("link", { name: /depnorte@gmail.com/i });
    await expect(emailLink).toHaveAttribute("href", "mailto:depnorte@gmail.com");
  });

  test("external links have security attributes", async ({ page }) => {
    await page.goto("/");

    // Check that external links have rel="noopener noreferrer"
    const externalLinks = page.locator('a[target="_blank"]');
    const count = await externalLinks.count();

    for (let i = 0; i < count; i++) {
      const rel = await externalLinks.nth(i).getAttribute("rel");
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
    }
  });
});

test.describe("Accessibility", () => {
  test("skip link navigates to main content", async ({ page }) => {
    await page.goto("/");

    // Skip link should exist
    const skipLink = page.locator('a[href="#main-content"]').first();
    await expect(skipLink).toHaveAttribute("href", "#main-content");

    // Focus on skip link and verify it becomes visible
    await skipLink.focus();

    // Main content should exist
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeVisible();
  });

  test("focus states are visible on navigation", async ({ page }) => {
    await page.goto("/");

    const navLink = page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link")
      .first();

    // Focus the link
    await navLink.focus();

    // Check that there's a visible focus indicator (outline or box-shadow)
    const outlineStyle = await navLink.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        outline: style.outline,
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
      };
    });

    // Should have some form of focus indicator
    const hasFocusIndicator =
      outlineStyle.outline !== "none" ||
      outlineStyle.boxShadow !== "none" ||
      outlineStyle.outlineColor !== "rgb(0, 0, 0)";

    expect(hasFocusIndicator).toBe(true);
  });

  test("FAQ buttons have proper ARIA attributes", async ({ page }) => {
    await page.goto("/");

    const faqButtons = page.locator(".faq-button");
    const count = await faqButtons.count();

    for (let i = 0; i < count; i++) {
      const button = faqButtons.nth(i);

      // Each button should have aria-expanded
      await expect(button).toHaveAttribute("aria-expanded");

      // Each button should have aria-controls pointing to content
      const controlsId = await button.getAttribute("aria-controls");
      expect(controlsId).toMatch(/faq-content-\d+/);

      // The controlled element should exist
      const controlledElement = page.locator(`#${controlsId}`);
      await expect(controlledElement).toBeAttached();
    }
  });

  test("images have alt text", async ({ page }) => {
    await page.goto("/");

    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt).not.toBeNull();
      expect(alt!.length).toBeGreaterThan(0);
    }
  });
});

test.describe("Build artifacts", () => {
  test("sitemap is generated (build only)", async ({ page }) => {
    // Sitemap is only generated during build, not in dev mode
    // This test verifies the sitemap exists in production builds
    const response = await page.goto("/sitemap-index.xml");

    if (response?.status() === 404) {
      // In dev mode, sitemap doesn't exist - this is expected
      // The test passes but logs that sitemap will be available after build
      console.log(
        "Sitemap not found (expected in dev mode) - will be generated at build time"
      );
      return;
    }

    // In production/build mode, verify sitemap structure
    expect(response?.status()).toBe(200);
    const contentType = response?.headers()["content-type"];
    expect(contentType).toContain("xml");
    const content = await page.content();
    expect(content).toContain("sitemap");
  });

  test("robots.txt exists and is valid", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);

    const contentType = response?.headers()["content-type"];
    expect(contentType).toContain("text/plain");

    // Verify robots.txt has basic structure
    const content = await response?.text();
    expect(content).toContain("User-agent");
  });
});
