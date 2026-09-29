# Observabilidad

Métricas Prometheus, request id y logs estructurados del backend, más un perfil
opcional de compose con Prometheus y Grafana.

## Qué se expone (y qué no)

| Qué | Dónde | Público |
|-----|-------|---------|
| `X-Request-ID` en cada respuesta | puertos 80 y 8080 | Sí |
| `/metrics` (Prometheus) | listener interno `app:9090` (`METRICS_ADDR`) | **No**: no se publica en el host |
| Prometheus UI | `127.0.0.1:9090` (perfil `observability`) | Solo local |
| Grafana | `127.0.0.1:3000` (perfil `observability`) | Solo local |

`/metrics` **no** está en el engine principal: `http://localhost/metrics` (nginx
responde 404) y `http://localhost:8080/metrics` (404) no devuelven métricas. Un
test e2e (`backend/integration/e2e_observability_test.go`) lo verifica.

## Activar Prometheus + Grafana

```bash
docker compose --profile observability up -d
```

- Grafana: <http://localhost:3000>, dashboard **Backend overview** (provisionado).
- Prometheus: <http://localhost:9090> (targets, consultas, reglas de ejemplo).
- Sin el perfil, `docker compose up` arranca exactamente lo de siempre.

Variables (todas opcionales, con valores por defecto para desarrollo local):

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `METRICS_ADDR` | `0.0.0.0:9090` (compose) | Listener interno de métricas; vacío = deshabilitado (runs locales sin compose) |
| `GRAFANA_ADMIN_USER` | `admin` | Usuario admin de Grafana |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | **Solo local**: cámbiala si el host es accesible por otros |
| `GRAFANA_PORT` / `PROMETHEUS_PORT` | `3000` / `9090` | Puertos en `127.0.0.1` |

Nunca se commitean credenciales reales; define `GRAFANA_ADMIN_PASSWORD` en tu
entorno o `.env` local.

## Métricas

- HTTP: `http_requests_total{method,route,status}`, `http_request_duration_seconds{method,route}`,
  `http_requests_in_flight`. `route` es la plantilla (`/api/v1/...:id`), `unmatched` si no hay ruta;
  el WebSocket y `/healthz` no entran en el histograma.
- WebSocket: `ws_connections`, `ws_rooms`, `ws_room_memberships`, `ws_connections_total`,
  `ws_disconnects_total`, `ws_messages_received_total{type}` (tipos conocidos o `unknown`),
  `ws_send_dropped_total`.
- Mensajes: `messages_sent_total{kind}` y `messages_failed_total{kind}` (`direct`|`group`).
- Dependencias: `dependency_up{dependency="postgres"|"redis"}` (chequeo cada 15 s),
  pool de Postgres (`go_sql_*`) y de Redis (`redis_pool_*`).
- Runtime: colectores de Go y de proceso.

## Request id y logs

- Cada request tiene un `X-Request-ID`: se respeta el entrante si cumple `^[A-Za-z0-9._-]{1,64}$`;
  si no, se genera (nginx lo crea en el borde). CORS lo expone al navegador.
- El access log (`method`, `path`, `status`, `duracion_ms`, `duracion`, `request_id`, `route`,
  `client_ip`, `bytes`) sale por `slog`; no incluye teléfonos, usuarios ni cuerpos.
- Los logs WebSocket llevan `conn_id` = el request id del upgrade, con `type` y `err`.

## Alertas de ejemplo

`docker/observability/alerts.yml` trae tres reglas (backend caído, dependencia caída, ratio de 5xx).
No hay Alertmanager en el stack: se ven en la UI de Prometheus.
