// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://deportivo-norte.vercel.app',
  integrations: [
    preact(),
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
  vite: {
    plugins: [tailwindcss()]
  },
  image: {
    // Responsive images config - stable since Astro 5.10
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
