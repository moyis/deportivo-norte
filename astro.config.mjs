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

// https://astro.build/config
export default defineConfig({
  site: 'https://www.deportivonorte.com.ar',
  integrations: [
    allowInlineStyleAttr(),
    sitemap({
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
        "img-src 'self' data: https://i.ytimg.com",
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
        "font-src 'self'",
        "connect-src 'self'",
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
