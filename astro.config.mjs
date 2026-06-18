// @ts-check
import { defineConfig, fontProviders, svgoOptimizer } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.deportivonorte.com.ar',
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
  security: {
    // CSP stable since Astro 6.0. Emitted as a per-page <meta> tag for static output.
    // Astro auto-manages script-src/style-src with generated hashes; the rest below.
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
  image: {
    // Responsive images config - stable since Astro 5.10
  },
  // Fonts stable since Astro 6.0 (moved out of experimental)
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
    // svgo flag renamed to svgOptimizer in Astro 6.0
    svgOptimizer: svgoOptimizer()
  }
});
