# Club Deportivo Norte

Sitio web oficial del Club Deportivo Norte, institución de fútbol fundada en 1937 en Mar del Plata, Argentina.

🌐 **[Ver sitio en producción](https://deportivo-norte.vercel.app/)**

## 📋 Descripción

Landing page moderna y responsive para el Club Deportivo Norte. El sitio incluye:

- **Hero** - Presentación del club con estadísticas clave
- **Asociate** - Información y formulario para nuevos socios
- **Historia** - Timeline con los momentos más importantes del club
- **FAQ** - Preguntas frecuentes
- **Footer** - Contacto y redes sociales
- **404** - Página de error con temática futbolística

## 🛠️ Stack Tecnológico

- [Astro](https://astro.build/) v5 - Framework web
- [Tailwind CSS](https://tailwindcss.com/) v4 - Estilos
- [Preact](https://preactjs.com/) - Componentes interactivos
- [Vercel](https://vercel.com/) - Hosting y deploy

## 🚀 Desarrollo Local

### Requisitos

- [Bun](https://bun.sh/) (recomendado) o Node.js 18+

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/deportivo-norte.git
cd deportivo-norte

# Instalar dependencias
bun install
```

### Comandos

| Comando          | Descripción                                    |
| :--------------- | :--------------------------------------------- |
| `bun dev`        | Inicia servidor de desarrollo en `localhost:4321` |
| `bun build`      | Genera build de producción en `./dist/`        |
| `bun preview`    | Preview del build local                        |
| `bun test:e2e`   | Ejecuta tests e2e con Playwright               |

## 📁 Estructura del Proyecto

```
/
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/          # Imágenes y SVGs
│   ├── components/      # Componentes Astro y Preact
│   │   ├── ClubAge.tsx  # Calculador de años del club
│   │   ├── FAQ.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── Historia.astro
│   │   └── Navbar.astro
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   ├── 404.astro    # Página de error 404
│   │   └── index.astro
│   └── styles/
│       └── global.css
├── e2e/                  # Tests end-to-end
│   ├── 404.spec.ts
│   └── sanity.spec.ts
├── astro.config.mjs
├── package.json
└── vercel.json
```

## 🎨 Colores del Club

El sitio utiliza los colores oficiales del club definidos en Tailwind:

- **Primary** (Amarillo): Color principal del club
- **Secondary** (Negro): Color secundario

## 📝 Licencia

Este proyecto es privado y pertenece al Club Deportivo Norte.

---

⚽ *"Más que un club, somos pasión, historia y comunidad"* - Club Deportivo Norte, desde 1937
