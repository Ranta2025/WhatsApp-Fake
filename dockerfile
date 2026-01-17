FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache build-base ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o server ./main.go

FROM alpine:3.20

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/server .

ENV GIN_MODE=release \
    PORT=8080

EXPOSE 8080

USER app

CMD ["./server"]
