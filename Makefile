# Atajos para el día a día (requiere Docker con Compose v2).
# En Windows sin make, usa directamente los comandos de cada objetivo.

.PHONY: up down restart logs ps reset tunnel test test-integration e2e lint build vapid-keys

up:            ## Construye y levanta todo el stack
	docker compose up -d --build

down:          ## Para los contenedores (conserva los datos)
	docker compose down

restart:       ## Reconstruye y reinicia backend y frontend
	docker compose up -d --build app web

logs:          ## Logs del backend en vivo
	docker compose logs -f app

ps:            ## Estado de los servicios
	docker compose ps

reset:         ## Borra TODOS los datos locales (BD, Redis, archivos) y vuelve a empezar
	docker compose down -v
	docker compose up -d --build

tunnel:        ## Levanta además un túnel público de Cloudflare y muestra la URL
	docker compose --profile tunnel up -d
	./scripts/setup-cloudflare.sh

test:          ## Tests unitarios del backend + lint y build del frontend
	go test ./...
	cd frontend && npm run lint && npm run build

test-integration: ## Tests de integración y e2e contra el stack de Docker (make up antes)
	POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=$${POSTGRES_PUBLIC_PORT:-5432} POSTGRES_USER=whatsapp POSTGRES_PASSWORD=whatsapp POSTGRES_DB=whatsapp \
	E2E_BASE_URL=http://localhost go test -tags e2e -count=1 ./backend/integration/

e2e:           ## Tests e2e de navegador (Playwright) contra el stack de Docker (make up antes)
	cd frontend && npm run test:e2e

vapid-keys:    ## Genera un par de claves VAPID (Web Push) para copiar a .env
	go run ./backend/cmd/vapidgen
