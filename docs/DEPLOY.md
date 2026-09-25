# Despliegue gratuito: Render (backend) + Vercel (frontend)

Esta guía deja la app en producción usando solo planes gratuitos.

```
Navegador ──► Vercel (frontend React)
   │            └─ /api/*  ──(rewrite)──►  Render: whatsapp-fake-api (Go)
   │                                         ├─ Render PostgreSQL (o Neon)
   │                                         ├─ Render Key Value / Redis (o Upstash)
   │                                         ├─ Cloudflare R2 (fotos, audios, videos)
   │                                         └─ Brevo (emails con códigos)
   └─ WebSocket (wss) directo ─────────────►  Render
```

- Las peticiones HTTP pasan por Vercel (mismo dominio → las cookies de sesión funcionan).
- El WebSocket va directo a Render (Vercel no reenvía WebSockets) y se autentica con un
  ticket de un solo uso que el frontend pide a `/api/v1/ws-ticket`.

| Servicio | Proveedor gratuito | Límites a tener en cuenta |
|---|---|---|
| Backend | Render Web Service (free) | Se duerme tras 15 min sin tráfico (primer acceso tarda ~1 min) |
| PostgreSQL | Render Postgres (free) **o** [Neon](https://neon.tech) | La de Render caduca a los 30 días; Neon es permanente |
| Redis | Render Key Value (free) **o** [Upstash](https://upstash.com) | 25 MB / 256 MB |
| Archivos | [Cloudflare R2](https://developers.cloudflare.com/r2/) | 10 GB gratis |
| Email | [Brevo](https://www.brevo.com) | 300 emails/día |
| Llamadas | [ZegoCloud](https://www.zegocloud.com) | Minutos gratis al mes |
| Frontend | [Vercel](https://vercel.com) (Hobby) | Uso personal |

---

## 1. Cloudflare R2 (almacenamiento de archivos)

1. Cloudflare Dashboard → **R2** → *Create bucket* → nombre `media`.
2. En el bucket → *Settings* → **Public access** → habilita *R2.dev subdomain*. Copia la URL
   pública (`https://pub-xxxxxxxx.r2.dev`).
3. R2 → *Manage R2 API Tokens* → *Create API token* con permiso **Object Read & Write**
   sobre el bucket `media`. Guarda el *Access Key ID*, el *Secret Access Key* y el
   endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

Valores para Render:

| Variable | Valor |
|---|---|
| `MINIO_ENDPOINT` | `<ACCOUNT_ID>.r2.cloudflarestorage.com` (sin `https://`) |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | las claves del token |
| `MEDIA_PUBLIC_BASE_URL` | `https://pub-xxxxxxxx.r2.dev` |

(`MINIO_BUCKET=media`, `MINIO_USE_SSL=true`, `MINIO_REGION=auto` y
`MINIO_MANAGE_BUCKET=false` ya vienen en el blueprint.)

## 2. Brevo (envío de códigos por email)

Render puede bloquear los puertos SMTP en el plan gratuito, así que se usa la API HTTP.

1. Crea una cuenta en Brevo → *Senders, Domains & Dedicated IPs* → añade y verifica tu
   email como remitente.
2. *SMTP & API* → *API Keys* → genera una clave.

Valores para Render: `BREVO_API_KEY` = la clave, `EMAIL_FROM` = el email verificado.

> Si despliegas en un servidor propio puedes seguir usando Gmail (`GMAIL_FROM` +
> `GMAIL_PASSWORD` con una contraseña de aplicación) y dejar `BREVO_API_KEY` vacío.

## 3. ZegoCloud (llamadas) — opcional

Crea un proyecto en la consola de ZegoCloud y copia `AppID` → `ZEGO_APP_ID` y
`ServerSecret` → `ZEGO_SERVER_SECRET`. Sin estas variables todo funciona salvo las llamadas.

## 4. Backend en Render

1. Render Dashboard → **New → Blueprint** → conecta este repositorio. Render lee
   `render.yaml` y crea:
   - `whatsapp-fake-api` (Docker, `docker/dockerfile`, health check `/healthz`)
   - `whatsapp-fake-db` (PostgreSQL) y `whatsapp-fake-redis` (Key Value)
   - `SECRETKEY` generada automáticamente, `DATABASE_URL` y `REDIS_URL` conectadas solas.
2. Rellena las variables que pide (`sync: false`) con los valores de los pasos 1-3.
   `CORS_ALLOWED_ORIGINS` puedes dejarla vacía por ahora (paso 6).
3. Espera al primer deploy y comprueba `https://whatsapp-fake-api.onrender.com/healthz`
   → `{"postgres":"ok","redis":"ok"}`.

Las tablas se crean solas al arrancar (migraciones automáticas).

**Usar Neon en vez de la Postgres de Render (recomendado, no caduca):** crea un proyecto
en Neon, copia la *connection string* (`postgres://…?sslmode=require`), borra el bloque
`databases:` de `render.yaml` y define `DATABASE_URL` a mano en Render.

**Usar Upstash en vez de Render Key Value:** crea una base Redis en Upstash y pon su URL
`rediss://default:<password>@<host>:6379` en `REDIS_URL`.

## 5. Frontend en Vercel

1. Si tu servicio de Render no se llama `whatsapp-fake-api`, cambia la URL de destino en
   `frontend/vercel.json`.
2. Vercel → **Add New → Project** → importa el repositorio.
   - **Root Directory:** `frontend`
   - Framework: Vite (se detecta solo)
3. Variables de entorno del proyecto:

   | Variable | Valor |
   |---|---|
   | `VITE_WS_URL` | `wss://whatsapp-fake-api.onrender.com` |

   (`VITE_API_URL` se deja vacía: la API se usa desde el mismo dominio gracias a las rewrites.)
4. Deploy. Copia la URL final, por ejemplo `https://whatsapp-fake.vercel.app`.

## 6. Conectar ambos

En Render → `whatsapp-fake-api` → *Environment*:

- `CORS_ALLOWED_ORIGINS` = `https://whatsapp-fake.vercel.app` (tu URL de Vercel, sin `/` final;
  separa varias con comas).
- `CLIENT_IP_HEADER` = `X-Real-IP` (opcional: usa la IP real del usuario para los límites
  de peticiones cuando el tráfico llega a través de Vercel).

Guarda (Render redespliega). Abre la URL de Vercel, regístrate, activa la cuenta con el
código del email y listo.

## Comprobaciones rápidas

- `GET /healthz` en Render responde 200.
- En la app, el punto junto a tu avatar se pone verde (WebSocket conectado).
- Si el WebSocket no conecta: revisa `VITE_WS_URL` en Vercel y `CORS_ALLOWED_ORIGINS`
  en Render.
- Si no llegan los emails: revisa el remitente verificado en Brevo y los logs de Render
  (`[EMAIL] …`).

## Desarrollo local (sin cambios)

```bash
cp .env.example .env          # y ajusta los valores
docker compose -f docker/compose.yml up -d --build
```

Tests:

```bash
go test ./...                                   # unitarios
go test -tags integration ./backend/integration # contra Postgres/Redis reales
E2E_BASE_URL=http://localhost:8080 go test -tags e2e ./backend/integration
cd frontend && npm run lint && npm run build
```
