// @ts-check
import { defineConfig, fontProviders, svgoOptimizer } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function allowInlineStyleAttr() {
  const META = 'http-equiv="content-security-policy" content="';
  return {
    name: 'csp-style-attr',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        for (const entry of readdirSync(root, { recursive: true })) {
          const name = entry.toString();
          if (!name.endsWith('.html')) continue;
          const path = join(root, name);
          const html = readFileSync(path, 'utf8');
          if (!html.includes(META) || html.includes('style-src-attr')) continue;
          writeFileSync(path, html.replace(META, `${META}style-src-attr 'unsafe-inline';`));
        }
      },
    },
  };
}

// El id de cuenta de Cloudflare R2 todavía es un marcador: lo reemplaza el
// operador (Task 8) por su id real. No es un secreto — el id de cuenta y el
// nombre del bucket aparecen en cada URL presignada. Se deja en un solo lugar
// para que el reemplazo sea una única edición.
export const R2_ACCOUNT_ID = 'REPLACE_WITH_ACCOUNT_ID';

// Origen del bucket privado. Tiene que coincidir carácter a carácter con el
// origen de la URL que firma `presignPutObject`, o la CSP bloquearía cada
// subida real aunque todos los tests mockeados pasen.
export const R2_HOST = `https://deportivo-norte-photos.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// https://astro.build/config
export default defineConfig({
  site: 'https://www.deportivonorte.com.ar',
  integrations: [
    allowInlineStyleAttr(),
    sitemap({
      // El link de subida es privado: nunca debe entrar al sitemap ni a los
      // índices de búsqueda (el `robots` de la página lo cubre del otro lado).
      filter: (page) => !page.includes('/subir'),
      // Remove unused XML namespaces to reduce sitemap size (5.14)
      namespaces: {
        news: false,
        video: false,
        image: false,
      }
    })
  ],
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true }
  }),
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "img-src 'self' data: https://i.ytimg.com blob:",
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
        "font-src 'self'",
        `connect-src 'self' ${R2_HOST}`,
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()]
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Oswald',
      cssVariable: '--font-heading',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      fallbacks: ['sans-serif']
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-body',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      fallbacks: ['sans-serif']
    }
  ],
  experimental: {
    svgOptimizer: svgoOptimizer()
  }
});
