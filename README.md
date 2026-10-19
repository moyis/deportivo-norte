# Club Deportivo Norte

Sitio web oficial del Club Deportivo Norte, institución de fútbol fundada en 1937 en Mar del Plata, Argentina.

🌐 **[Ver sitio en producción](https://www.deportivonorte.com.ar)**

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
│   ├── components/      # Componentes Astro
│   │   ├── ClubAge.astro # Calculador de años del club
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

## 📸 Fotos de la historia

Abrimos una ventana para que los socios, las familias y los vecinos nos manden
las fotos viejas del club. Cada uno recibe un link privado, elige las fotos desde
el celular y las sube directo a un bucket privado de Cloudflare R2. Nada se
publica solo: lo que llega queda guardado, sin tocar, para curarlo a mano
después.

Esta sección es la receta para dejar el link funcionando. Está escrita para
alguien con acceso a la cuenta de Cloudflare, a Vercel y al repositorio, pero sin
suponer que es desarrollador: cada paso dice qué se está haciendo y por qué.

### Qué necesita el sistema

El sistema se apoya en siete variables de entorno. Las siete van cargadas en
Vercel (Preview **y** Production). Si falta una, la falla es silenciosa: sin
`UPLOAD_TOKEN` o `UPLOAD_UNTIL` la página directamente dice que el link no es
válido, y sin las de R2 la subida se rechaza con un "por ahora no podemos
recibir más fotos". Ninguna de esas pistas dice cuál variable falta.

| Variable | Qué es | Dónde se consigue |
| :--- | :--- | :--- |
| `UPLOAD_TOKEN` | La contraseña que viaja en el link. Es la **única** credencial. | Se inventa. Tiene que ser largo y aleatorio (ver abajo). |
| `UPLOAD_UNTIL` | Fecha y hora en que se cierra la convocatoria (ISO 8601 en UTC). | Se elige, por ejemplo `2026-11-01T00:00:00Z`. |
| `R2_ACCOUNT_ID` | El id de la cuenta de Cloudflare (32 caracteres hexadecimales). | En el panel de Cloudflare, en la página de R2. |
| `R2_ACCESS_KEY_ID` | Access key del token de R2. | Se genera al crear el token de R2 (paso 2). |
| `R2_SECRET_ACCESS_KEY` | Secret access key del mismo token. | Igual que el anterior, se muestra una sola vez. |
| `R2_BUCKET` | Nombre del bucket: `deportivo-norte-photos`. | El que se crea en el paso 1. |
| `R2_PREFIX` | La "carpeta" dentro del bucket. Por defecto `photos/`. | Se elige. En local conviene cambiarlo (ver abajo). |

Los nombres y los valores de ejemplo ya están en `.env.example`: ese archivo es
la referencia. El `UPLOAD_TOKEN` **no** puede ser una palabra común ni el ejemplo
del archivo — cualquiera que lo adivine puede subir fotos. Conviene generarlo con
algo como `openssl rand -hex 32` y pegarlo tal cual.

### Puesta en marcha

**1. Crear el bucket.** En el panel de Cloudflare, en la sección de R2, crear un
bucket llamado `deportivo-norte-photos`. Tiene que ser un bucket propio del club,
**nunca** el de otro proyecto (por ejemplo, el de las fotos del casamiento). El
bucket queda privado: sin dominio público, sin URL `r2.dev`, sin acceso de nadie
desde afuera para leer.

**2. Crear el token de R2.** En el panel de Cloudflare, en la sección de R2, crear
un **token de API** acotado a **ese bucket**, con permiso de lectura y escritura
de objetos. Al crearlo, Cloudflare muestra el access key ID y el secret access
key: el secret **se ve una sola vez**, así que hay que copiarlo en el momento. El
id de cuenta aparece en esa misma pantalla.

**3. Cargar las siete variables en Vercel.** En el proyecto del sitio, en
**Settings → Environment Variables**, cargar las siete tanto para Preview como
para Production. La página de subida se renderiza en el servidor en cada visita
(no es un archivo estático), y las dos rutas de API también son funciones: las
tres leen estas variables en el momento del pedido. Después de cargar o cambiar
una variable en Vercel, hay que **volver a desplegar** (`Redeploy`) para que el
despliegue la tome.

**4. Reemplazar el marcador en `astro.config.mjs`.** El archivo tiene, arriba de
todo:

```js
export const R2_ACCOUNT_ID = 'REPLACE_WITH_ACCOUNT_ID';
```

Ese texto es un **marcador**. Hay que reemplazarlo por el id real de la cuenta.
La razón es concreta: de ahí se calcula `R2_HOST`, que es el origen
`https://deportivo-norte-photos.<id-de-cuenta>.r2.cloudflarestorage.com`, y ese
origen queda escrito en la política de seguridad de contenido (`connect-src`) que
viaja en cada página. Si el marcador queda sin reemplazar, el `connect-src` no
coincide con el bucket real y **cada subida falla en un navegador de verdad**
—aunque todas las pruebas automáticas pasen, porque las pruebas viven en otro
host—. Es un cambio de una línea y se hace una sola vez.

**5. Configurar CORS en el bucket.** El navegador sube la foto directo a R2, y R2
vive en otro origen (`r2.cloudflarestorage.com`), así que el navegador primero
manda una consulta previa (preflight) y R2 tiene que responder que sí. Sin esto
la subida falla en silencio. En el panel de Cloudflare, en el bucket, **Settings →
CORS Policy → Add CORS policy**, en la pestaña **JSON**, pegar:

```json
[
  {
    "AllowedOrigins": [
      "https://www.deportivonorte.com.ar",
      "https://deportivonorte.com.ar"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

El método es `PUT` porque el navegador sube los bytes con un `PUT`; el header
`Content-Type` es el que declaró el firmado (`image/jpeg`, `image/png`,
`image/webp` o `image/heic`) y viaja adentro de la firma. Los dos orígenes son el
sitio en producción y su versión sin `www`. El preflight del `PUT` no lleva
headers firmados extra: solo el `Content-Type`, por eso la lista es esa y nada
más.

> También se puede aplicar por CLI con Wrangler, si se prefiere: se guarda un
> archivo `cors.json` y se ejecuta `npx wrangler r2 bucket cors set
> deportivo-norte-photos --file cors.json` (y `npx wrangler r2 bucket cors list
> deportivo-norte-photos` para revisar). El CLI usa otro formato de archivo:
>
> ```json
> {
>   "rules": [
>     {
>       "allowed": {
>         "origins": [
>           "https://www.deportivonorte.com.ar",
>           "https://deportivonorte.com.ar"
>         ],
>         "methods": ["PUT"],
>         "headers": ["Content-Type"]
>       }
>     }
>   ]
> }
> ```
>
> Si se usa el CLI, necesita un `wrangler login` previo. Los cambios de CORS
> pueden tardar hasta 30 segundos en propagarse.

**6. Armar el link de la campaña.** El link es la página `/subir` más el token:

```
https://www.deportivonorte.com.ar/subir?k=<UPLOAD_TOKEN>
```

`<UPLOAD_TOKEN>` es exactamente el valor que se cargó en Vercel, sin signos `<`
`>` ni comillas. Ese link es el que se comparte por WhatsApp, por correo o en
mano. La página no está linkeada desde ningún lado del sitio y está marcada con
`noindex, nofollow`, así que solo se llega por el link compartido.

### Seguridad

- **El link es la única credencial.** Quien lo tenga puede subir fotos hasta que
  se cierre la ventana. No hay usuario ni contraseña, y nada pregunta quién es.
- **Rotar el token mata el link al instante.** Si el link se filtró más de lo
  previsto, se cambia `UPLOAD_TOKEN` en Vercel: el link viejo deja de ser válido
  y la página pasa a decir "Ese link no es válido" en la siguiente visita. La
  próxima campaña arranca con su propio token, así el anterior queda muerto.
- **Cambiar `UPLOAD_UNTIL` cambia la ventana sin editar ni escribir código.**
  Se cambia la variable en Vercel y se hace `Redeploy` (una variable nueva o
  cambiada solo llega al despliegue siguiente). No hay ningún valor de la ventana
  grabado en el sitio compilado: la página y las dos rutas leen la variable en el
  servidor en cada pedido, así que el cambio se aplica solo con volver a
  desplegar, sin commit ni modificación de archivos.
- **Límites que acotan el daño.** La firma para subir dura 10 minutos; el
  `Content-Type` queda pegado en la firma; una foto de más de 25 MB que igual
  llegue se borra al confirmarse; y el bucket tiene un techo total de 8 GiB y
  5000 objetos, que se mide leyendo el bucket antes de firmar. Pasado el techo,
  el sistema deja de recibir y avisa.
- **Todo falla cerrado.** Si falta configuración, si el token no coincide, si el
  plazo es ilegible o si R2 responde un error, la respuesta es un rechazo, nunca
  un falso "llegó".

### Dónde quedan las fotos

Las fotos llegan al bucket `deportivo-norte-photos`, bajo el prefijo
`R2_PREFIX` (por defecto `photos/`). La clave se arma sola, nunca usa el nombre
del archivo original: es `<prefijo><fecha-hora>-<uuid>.<ext>`, por ejemplo
`photos/2026-10-19T12-00-00Z-8f3a...c1.jpg`. Por eso dos fotos con el mismo
nombre no se pisan, y por eso subir la misma foto dos veces deja dos objetos
—que es lo que se espera: para el miembro, mandarla dos veces es mandarla dos
veces.

**Curation: se hace a mano, mirando el bucket.** No hay galería ni pantalla de
curaduría todavía: el material se revisa entrando al bucket en el panel de
Cloudflare y descargando lo que se quiera. Este proyecto es solo la mitad de
"mándanos tus fotos"; mostrar lo curado en el sitio es la próxima pieza.

### Probar en local sin ensuciar lo real

En local conviene usar un prefijo distinto, para que las pruebas de práctica no
se mezclen con las fotos de verdad:

```
R2_PREFIX=dev/
```

Con eso, todo lo que subas en tu máquina queda en `dev/` dentro del mismo bucket
y se distingue de un vistazo. Ojo con una cosa: el bucket y el token de R2 son
**reales** también en local —no hay bucket de prueba—, así que lo que se suba
ahí ocupa lugar de verdad. Si preferís no ensuciar el bucket, usá un prefijo
`dev/` y borrá esa carpeta después.

### Checklist antes de compartir el link

Esto lo corre una persona, con un celular, **antes** de mandar el link a nadie.
Es el único paso que prueba de verdad la firma, el CORS y la CSP reales: las
pruebas automáticas interceptan la ruta de firma, el `PUT` a R2 y el origen, así
que un firmador equivocado, un `R2_HOST` mal armado o un CORS mal puesto **pasan
en verde igual**. Sin este recorrido, el primer error lo encontraría un socio.

- [ ] Reemplazar `REPLACE_WITH_ACCOUNT_ID` en `astro.config.mjs` por el id real y desplegar a producción.
- [ ] Abrir el link real en un celular, elegir una foto de la galería y confirmar que llega.
- [ ] Confirmar que el objeto existe en el bucket, bajo el prefijo `R2_PREFIX`.
- [ ] Abrir la consola del navegador: sin violaciones de CSP.
- [ ] Mandar la misma foto dos veces y confirmar que quedan dos objetos.
- [ ] Elegir un archivo de más de 25 MB y confirmar que se rechaza y que **no** está en el bucket.
- [ ] Poner `UPLOAD_UNTIL` en ayer en un despliegue de preview y confirmar que el link explica que la ventana cerró.
- [ ] Abrir el link sin el `k` y confirmar que aparece el mensaje de link inválido.

## 🎨 Colores del Club

El sitio utiliza los colores oficiales del club definidos en Tailwind:

- **Primary** (Amarillo): Color principal del club
- **Secondary** (Negro): Color secundario

## 📝 Licencia

Este proyecto es privado y pertenece al Club Deportivo Norte.

---

⚽ *"Más que un club, somos pasión, historia y comunidad"* - Club Deportivo Norte, desde 1937
