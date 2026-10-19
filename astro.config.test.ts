import { describe, it, expect } from 'vitest';
import config, { R2_HOST } from './astro.config.mjs';

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

  // El host del bucket tiene que ser el origen COMPUTADO: el mismo string que
  // aparece en cada URL presignada. Si no coinciden carácter a carácter, la CSP
  // bloquea todas las subidas reales.
  it('computa el host de R2 desde el id de cuenta', () => {
    expect(R2_HOST).toMatch(
      /^https:\/\/deportivo-norte-photos\.[^/]+\.r2\.cloudflarestorage\.com$/,
    );
    expect(R2_HOST).not.toContain('${');
  });
});
