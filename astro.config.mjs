// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://deportivonorte.com.ar',
  integrations: [preact(), sitemap()],
  output: 'static',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()]
  },
  experimental: {
    svgo: true,
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
    ]
  }
});
