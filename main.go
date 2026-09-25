package main

import (
	"context"
	"gorm/backend/app"
	"gorm/backend/utils"
	"log"
	"os/signal"
	"syscall"
)

func main() {
	utils.LoadEnv()
	utils.InitLogger()
	utils.ValidateJWTSecret()

	application, err := app.New()
	if err != nil {
		log.Fatalf("[APP] Error inicializando la aplicación: %v", err)
	}

	// Apagado ordenado con Ctrl+C / docker stop
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := application.Run(ctx); err != nil {
		log.Fatalf("[APP] Error del servidor: %v", err)
	}
}
