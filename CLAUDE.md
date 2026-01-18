# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # Start dev server at localhost:4321
bun build        # Production build to ./dist/
bun test:e2e     # Run all Playwright e2e tests
bun test:e2e -- e2e/404.spec.ts  # Run specific test file
bun test:e2e:ui  # Run tests with Playwright UI
```

## Architecture

**Stack**: Astro 5 + Tailwind CSS 4 + Preact + Vercel

This is a single-page landing site for Club Deportivo Norte (football club). The homepage (`src/pages/index.astro`) composes section components in order: Navbar → Hero → Asociate → Historia → FAQ → Footer.

### Key Patterns

**Styling**: Tailwind 4 with custom theme colors defined in `src/styles/global.css` via `@theme` block. Club colors are yellow (`--color-primary: #FFCC00`) and black. Button classes (`btn-primary`, `btn-secondary`, etc.) are defined in global.css, not as Tailwind utilities.

**Fonts**: Configured in `astro.config.mjs` using Astro's experimental fonts API. Oswald for headings (`--font-heading`), Inter for body (`--font-body`).

**Images**: Import from `src/assets/` and use `.src` property (e.g., `import img from '../assets/image.webp'` then `src={img.src}`).

**Interactive components**: Preact (`.tsx`) for client-side reactivity (e.g., `ClubAge.tsx`). Use `client:load` directive when including in Astro files.

**Navigation**: Navbar uses absolute paths (`/#section`) to work from any page. Logo links to `/#` to scroll to top on homepage or navigate home from other pages.

### Language

Site content is in Spanish (Argentina). Use "vos" conjugation (buscás, podés) and Argentine expressions.
