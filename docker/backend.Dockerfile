# syntax=docker/dockerfile:1
# Imagen del backend (Go). Se construye desde la raíz del repositorio:
#   docker build -f docker/backend.Dockerfile .

FROM golang:1.25-alpine AS builder
WORKDIR /src

# Dependencias primero para aprovechar la caché de capas
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY main.go ./
COPY backend ./backend

# TARGETOS/TARGETARCH los pone BuildKit: funciona en amd64 y en arm64 (Mac M1/M2…)
ARG TARGETOS=linux
ARG TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -tags timetzdata -ldflags="-s -w" -o /out/server ./main.go

# Imagen final mínima: sin gestor de paquetes. Los certificados CA se copian del
# builder y la zona horaria va embebida en el binario (-tags timetzdata).
FROM alpine:3.20
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
WORKDIR /app
COPY --from=builder /out/server ./server

ENV GIN_MODE=release \
    PORT=8080
EXPOSE 8080
USER nobody

# wget viene en busybox (alpine)
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["./server"]
