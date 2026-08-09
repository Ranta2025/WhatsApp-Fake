package utils

import (
	"log/slog"
	"os"
)

var Logger *slog.Logger

func InitLogger() {
	var handler slog.Handler
	if os.Getenv("ENV") == "production" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	Logger = slog.New(handler)
	slog.SetDefault(Logger)
}
