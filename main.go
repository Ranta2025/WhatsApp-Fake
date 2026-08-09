package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gorm/backend/cache"
	"gorm/backend/config"
	"gorm/backend/database"
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/repos"
	"gorm/backend/routers"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func main() {
	utils.LoadEnv()
	utils.InitLogger()
	utils.ValidateJWTSecret()
	db, rd, mc, err := database.GetConection()
	if err != nil {
		panic(err)
	}

	serviceMedia := services.InitServiceMedia(mc)
	handlerMedia := handlers.InitHandlerMedia(serviceMedia)

	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())

	repo := repos.InitRepoContact(db, rd)

	hub := websocket.NewHub(repo)
	go hub.Run()

	handlerContact, handlerChat, serviceChat, serviceContact := GetHandlerApi(db, rd, hub)
	handlerLog := GetHandlerLog(db, rd, hub)
	handlerBugReport := GetHandlerBugReport()

	serviceCall := services.InitServiceCall(repo)
	handlerCall := handlers.InitHandlerCall(serviceCall)

	repoGroup := repos.InitRepoGroup(db, rd)
	serviceGroup := services.InitServiceGroup(repoGroup, repo)
	handlerGroup := handlers.InitHandlerGroup(serviceGroup, hub)

	repoStatus := repos.InitRepoStatus(db)
	serviceStatus := services.InitServiceStatus(repoStatus)
	handlerStatus := handlers.InitHandlerStatus(serviceStatus, hub)

	middleware.InitRateLimiter(rd)
	routers.Router(*handlerLog, app.app, *handlerContact, *handlerChat, handlerCall, hub, serviceChat, serviceContact, handlerBugReport, serviceCall, handlerMedia, handlerGroup, serviceGroup, handlerStatus)

	app.Welcome()
	app.Run()
}

type app struct {
	app *gin.Engine
}

func (a *app) Run() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    "0.0.0.0:" + port,
		Handler: a.app,
	}

	go func() {
		slog.Info("servidor iniciado", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("error fatal del servidor", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("apagando servidor...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("error durante shutdown", "error", err)
	}

	slog.Info("servidor detenido")
}

func (a *app) Welcome() {
	a.app.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Welcome"})
	})

	a.app.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "timestamp": time.Now().UTC().Format(time.RFC3339)})
	})
}

func GetApp() app {
	app := app{app: gin.Default()}
	return app
}

func GetHandlerLog(data *gorm.DB, rd *redis.Client, hub *websocket.Hub) *handlers.HandlerUser {
	repo := repos.GetRespositorieUser(data)
	cache := cache.InitChacheUser(rd, repo)
	service := services.InitServices(repo, cache)
	handler := handlers.GetHandlerUser(service, hub)
	return handler
}

func GetHandlerApi(data *gorm.DB, rd *redis.Client, hub *websocket.Hub) (*handlers.HandlerContact, *handlers.HandlerChat, services.ChatServicer, services.ContactServicer) {
	repo := repos.InitRepoContact(data, rd)
	serviceMessage := services.InitServiceMessage(repo)
	serviceContact := services.InitServiceContact(repo)
	handlerContact := handlers.InitHandlerApiMessage(serviceContact, hub)
	handlerChat := handlers.InitHandlerChat(serviceMessage, hub)
	return handlerContact, handlerChat, serviceMessage, serviceContact
}

func GetHandlerBugReport() *handlers.HandlerBugReport {
	githubToken := os.Getenv("GITHUB_TOKEN")
	githubOwner := os.Getenv("GITHUB_OWNER")
	githubRepo := os.Getenv("GITHUB_REPO")
	httpClient := &http.Client{Timeout: 10 * time.Second}
	service := services.InitServiceBugReport(githubToken, githubOwner, githubRepo, httpClient)
	handler := handlers.InitHandlerBugReport(service)
	return handler
}
