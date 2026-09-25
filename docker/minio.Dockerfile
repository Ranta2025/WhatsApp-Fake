# syntax=docker/dockerfile:1
# MinIO (almacenamiento S3 local) compilado desde el código fuente.
# La imagen oficial minio/minio ya no está disponible en Docker Hub, así que se
# construye aquí una versión fija. La primera compilación tarda unos minutos;
# después queda en caché.

FROM golang:1.25-alpine AS build
ARG MINIO_VERSION=RELEASE.2025-04-22T22-12-26Z
ARG TARGETOS=linux
ARG TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH GOFLAGS=-mod=mod \
    go install -trimpath -ldflags="-s -w" github.com/minio/minio@${MINIO_VERSION} \
    && cp "$(go env GOPATH)/bin/minio" /minio 2>/dev/null || cp "$(go env GOPATH)/bin/${TARGETOS}_${TARGETARCH}/minio" /minio

FROM alpine:3.20
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /minio /usr/bin/minio
EXPOSE 9000 9001
VOLUME ["/data"]
HEALTHCHECK --interval=5s --timeout=5s --retries=30 \
    CMD wget -qO- http://127.0.0.1:9000/minio/health/live >/dev/null || exit 1
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
