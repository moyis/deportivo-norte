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
export const R2_ACCOUNT_ID = 'd84d65cb9cb132052e96acd7245e258e';

// Marcador exacto que hay que reemplazar. Vive en una constante para que el
// guardia de más abajo y los tests no lo repitan como literal suelto.
export const R2_ACCOUNT_ID_PLACEHOLDER = 'REPLACE_WITH_ACCOUNT_ID';

// Nombre real del bucket, en un solo lugar. Tiene que ser el mismo valor que la
// variable `R2_BUCKET` (`.env.example`) y el que el operador creó en Cloudflare:
// `presignPutObject` arma su origen con `env.R2_BUCKET`, así que si acá dice otra
// cosa, la CSP y la firma apuntan a hosts distintos y toda subida real se
// bloquea en silencio. `astro.config.test.ts` cruza ambos valores.
export const R2_BUCKET_NAME = 'deportivo-norte-photos';

// Origen del bucket privado. Tiene que coincidir carácter a carácter con el
// origen de la URL que firma `presignPutObject`, o la CSP bloquearía cada
// subida real aunque todos los tests mockeados pasen.
export const R2_HOST = `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Guardia de despliegue para el error más probable del operador: publicar el
// marcador sin reemplazar. No puede ser un test, porque el marcador es el estado
// CORRECTO de esta rama hasta que el operador lo cambia (Task 8); un test que lo
// exigiera fallaría hoy. Tampoco puede correr al importar el módulo, porque
// vitest lo importa y en CI `CI=1` haría fallar los tests unitarios.
// Va como hook de una integración: `astro:config:setup` solo se dispara cuando
// Astro carga el config para construir o servir de verdad.
//
// Condición elegida: `VERCEL_ENV === 'production'`. Es la única puerta que hay
// que cerrar. Vercel setea `VERCEL_ENV=production` en el deploy de producción y
// `preview` en cada deploy de PR; el workflow de este repo construye un preview
// de Vercel por PR y no corre `astro build` local, así que un guardia atado a
// `CI`/`VERCEL` a secas tiraría abajo **cada preview** mientras el marcador
// siga —que es el estado correcto hasta Task 8— y rompería el build verde que
// ya existe. Producción es distinto: ahí el marcador SÍ debe estar reemplazado
// o cada socio ve la subida fallar en silencio. En local (`VERCEL_ENV` sin
// definir) no hay `CI` ni `VERCEL`, así que `bun run build` y `astro dev` siguen
// limpios.
function requireReplacedAccountId() {
  return {
    name: 'r2-account-id-guard',
    hooks: {
      'astro:config:setup': () => {
        if (process.env.VERCEL_ENV !== 'production') return;

        if (R2_ACCOUNT_ID === R2_ACCOUNT_ID_PLACEHOLDER) {
          throw new Error(
            'R2_ACCOUNT_ID sigue en el marcador ' +
              `'${R2_ACCOUNT_ID_PLACEHOLDER}'. Reemplazalo en astro.config.mjs por el ` +
              'id real de la cuenta de Cloudflare antes de desplegar a producción: sin ' +
              'eso el connect-src de la CSP no coincide con el bucket y cada subida ' +
              'falla en un navegador real (los tests mockeados no lo ven).',
          );
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
    requireReplacedAccountId(),
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
