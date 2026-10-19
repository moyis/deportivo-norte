import { describe, it, expect } from 'vitest';
import config, { R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_HOST } from './astro.config.mjs';
// El firmador real: la MISMA función que arma el origen de cada URL presignada.
// Importarla es honesto y barato — `r2Endpoint` es una función pura, sin efectos
// de lado, y `aws4fetch` (lo único que arrastra el módulo) se importa sin
// problema en este test. Ver el "mutation-verified RED" del reporte.
import { r2Endpoint } from './src/lib/r2';

// Normaliza las directivas CSP del config real. `defineConfig` es identidad,
// así que el default export es el objeto de configuración tal cual se escribió.
type CspDirective = string;

const directives = (
  (config as { security?: { csp?: { directives?: CspDirective[] } } }).security?.csp
    ?.directives ?? []
) as CspDirective[];

const directive = (name: string): CspDirective | undefined =>
  directives.find((d) => d.startsWith(name));

// La CSP es lo único que separa al navegador real de R2: si `connect-src` pierde
// el host del bucket, el PUT presignado se bloquea en silencio (los tests
// mockeados igual pasan). Si `img-src` pierde `blob:`, las previsualizaciones
// locales tampoco se ven. Estas afirmaciones existen para que una edición CSP
// equivocada falle acá y no en producción.
describe('CSP del config real', () => {
  it('permite conectar al host de R2 en connect-src', () => {
    expect(directive('connect-src')).toBeDefined();
    expect(directive('connect-src')).toContain(R2_HOST);
  });

  it('sigue permitiendo al propio origen en connect-src', () => {
    expect(directive('connect-src')).toContain("'self'");
  });

  it('permite blob: en img-src', () => {
    expect(directive('img-src')).toBeDefined();
    expect(directive('img-src')).toContain('blob:');
  });

  it('conserva los orígenes de imagen que ya estaban', () => {
    expect(directive('img-src')).toContain("'self'");
    expect(directive('img-src')).toContain('data:');
    expect(directive('img-src')).toContain('https://i.ytimg.com');
  });

  // El host del bucket tiene que ser el MISMO origen que arma el firmador real
  // `presignPutObject`, carácter a carácter: la CSP que viaja en cada página
  // nombra `R2_HOST`, y el navegador manda el `PUT` a lo que firma
  // `r2Endpoint(env)`. Si los dos strings divergen, la CSP bloquea todas las
  // subidas reales en silencio (los e2e interceptan el origen con un wildcard,
  // así que un id o un bucket equivocados pasan en verde igual).
  //
  // Esto es lo que la afirmación vieja NO probaba: un regex de forma lo satisface
  // el marcador `REPLACE_WITH_ACCOUNT_ID` igual de contento que un id real, y no
  // dice nada sobre el bucket.
  //
  // El nombre canónico del bucket va como LITERAL acá a propósito — es el valor
  // con el que se creó el bucket real en Cloudflare y el que `.env.example` fija
  // como `R2_BUCKET`. Si el test construyera `r2Endpoint` con `R2_BUCKET_NAME`,
  // ambos lados del `toBe` se moverían juntos y renombrar el bucket en un solo
  // lugar pasaría en verde (una verificación que no puede fallar no verifica
  // nada). Con el literal, cambiar `R2_BUCKET_NAME` rompe este test: es el
  // mutation-verified RED del reporte.
  it('coincide carácter a carácter con el origen que firma r2Endpoint', () => {
    const signed = r2Endpoint({
      R2_BUCKET: 'deportivo-norte-photos',
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: 'no-se-usa-para-el-origen',
      R2_SECRET_ACCESS_KEY: 'no-se-usa-para-el-origen',
      R2_PREFIX: 'photos/',
    });

    expect(R2_HOST).toBe(signed);
  });

  // El nombre del bucket vive una sola vez (`R2_BUCKET_NAME`), atado al literal
  // con el que existe el bucket real: si alguien lo vuelve a escribir inline en
  // `R2_HOST` con otro valor, o lo renombra acá, esta afirmación lo delata.
  it('arma R2_HOST desde el nombre de bucket exportado', () => {
    expect(R2_BUCKET_NAME).toBe('deportivo-norte-photos');
    expect(R2_HOST).toContain(`https://${R2_BUCKET_NAME}.`);
    expect(R2_HOST).not.toContain('${');
  });
});
