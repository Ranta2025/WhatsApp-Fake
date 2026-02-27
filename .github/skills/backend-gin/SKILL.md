---
name: gin-backend-senior
description: "Guía completa y mejores prácticas para desarrollar APIs backend robustas, escalables y mantenibles con el framework Gin en Go. Ideal para proyectos profesionales."
license: MIT
---

# 🚀 Desarrollo Backend Senior con Gin

Soy un asistente experto en backend con Go y Gin. Aplicaré las siguientes convenciones y mejores prácticas en todo el código que genere.

## 📁 Estructura del Proyecto

Usaremos una arquitectura limpia y por capas. La estructura base será:
.
├── cmd/
│ └── api/
│ └── main.go # Punto de entrada de la aplicación
├── internal/
│ ├── config/ # Configuración (variables de entorno, etc.)
│ ├── domain/ # Entidades/Modelos de negocio
│ ├── dto/ # Data Transfer Objects (request/response)
│ ├── repository/ # Acceso a datos (interfaces e implementaciones)
│ ├── service/ # Lógica de negocio
│ ├── handler/ # Controladores HTTP (handlers de Gin)
│ ├── middleware/ # Middlewares personalizados
│ ├── pkg/ # Utilidades compartidas (logger, errors, etc.)
│ └── routes/ # Definición de rutas y grupos
├── migrations/ # Archivos de migración de BD
├── tests/ # Tests de integración / e2e
├── .env.example
├── go.mod
└── Makefile # Comandos útiles (run, test, migrate, etc.)

text

## ⚙️ Configuración (config)

- Usar **Viper** para cargar configuración desde archivos `.env` o variables de entorno.
- Definir una estructura `Config` con todos los campos necesarios.
- Validar que las variables requeridas estén presentes al iniciar.

```go
package config

import (
    "github.com/spf13/viper"
)

type Config struct {
    ServerPort  string `mapstructure:"SERVER_PORT"`
    DatabaseURL string `mapstructure:"DATABASE_URL"`
    JWTSecret   string `mapstructure:"JWT_SECRET"`
    LogLevel    string `mapstructure:"LOG_LEVEL"`
}

func Load() (*Config, error) {
    viper.SetConfigFile(".env")
    viper.AutomaticEnv()

    if err := viper.ReadInConfig(); err != nil {
        return nil, err
    }

    var cfg Config
    if err := viper.Unmarshal(&cfg); err != nil {
        return nil, err
    }
    return &cfg, nil
}
🚦 Inicialización (main.go)
Inicializar logger, configuración, base de datos y dependencias.

Usar fx (opcional) o inyección manual de dependencias.

Levantar el servidor con gin.Default() o gin.New() con middlewares base.

go
package main

import (
    "log"
    "your-project/internal/config"
    "your-project/internal/routes"
    "your-project/internal/pkg/logger"
    "github.com/gin-gonic/gin"
)

func main() {
    cfg, err := config.Load()
    if err != nil {
        log.Fatalf("Error loading config: %v", err)
    }

    logInstance := logger.New(cfg.LogLevel)

    // Conectar a BD (ejemplo con GORM)
    db, err := database.NewConnection(cfg.DatabaseURL)
    if err != nil {
        logInstance.Fatal("Failed to connect to database", err)
    }

    // Inyectar dependencias en handlers (ejemplo simple)
    userRepo := repository.NewUserRepository(db)
    userService := service.NewUserService(userRepo)
    userHandler := handler.NewUserHandler(userService)

    router := gin.New()
    router.Use(gin.Recovery(), middleware.Logger(logInstance))

    routes.Setup(router, userHandler)

    if err := router.Run(":" + cfg.ServerPort); err != nil {
        logInstance.Fatal("Server failed", err)
    }
}
🛣️ Rutas (routes)
Agrupar rutas por versión y recurso (ej: /api/v1/users).

Separar la definición de rutas en un paquete routes.

go
package routes

import (
    "github.com/gin-gonic/gin"
    "your-project/internal/handler"
)

func Setup(router *gin.Engine, uh *handler.UserHandler) {
    v1 := router.Group("/api/v1")
    {
        users := v1.Group("/users")
        {
            users.GET("/", uh.GetAllUsers)
            users.GET("/:id", uh.GetUserByID)
            users.POST("/", uh.CreateUser)
            users.PUT("/:id", uh.UpdateUser)
            users.DELETE("/:id", uh.DeleteUser)
        }
        // Otros grupos (auth, products, etc.)
    }
}
🧩 Handlers (controladores)
Los handlers solo reciben la petición, validan entrada, llaman al servicio y devuelven la respuesta.

Usar binding de Gin para validar requests.

Respuestas estandarizadas mediante una función helper.

go
package handler

import (
    "net/http"
    "your-project/internal/dto"
    "your-project/internal/service"
    "your-project/internal/pkg/httpresponse"
    "github.com/gin-gonic/gin"
)

type UserHandler struct {
    userService service.UserService
}

func NewUserHandler(us service.UserService) *UserHandler {
    return &UserHandler{userService: us}
}

func (h *UserHandler) CreateUser(c *gin.Context) {
    var req dto.CreateUserRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        httpresponse.Error(c, http.StatusBadRequest, "Invalid request", err.Error())
        return
    }

    user, err := h.userService.Create(c.Request.Context(), req)
    if err != nil {
        httpresponse.Error(c, http.StatusInternalServerError, "Failed to create user", err.Error())
        return
    }

    httpresponse.Success(c, http.StatusCreated, user)
}
📦 DTOs (Data Transfer Objects)
Definir structs específicos para requests y responses.

Usar tags de validación (binding:"required", etc.) y JSON.

go
package dto

type CreateUserRequest struct {
    Name     string `json:"name" binding:"required,min=2"`
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=6"`
}

type UserResponse struct {
    ID    uint   `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}
🗄️ Repositorios (acceso a datos)
Cada entidad tiene su interfaz de repositorio en el paquete domain o repository.

Implementación con GORM (u otro ORM).

Usar contexto para propagar cancelaciones y timeouts.

go
package repository

import (
    "context"
    "your-project/internal/domain"
    "gorm.io/gorm"
)

type UserRepository interface {
    Create(ctx context.Context, user *domain.User) error
    FindByID(ctx context.Context, id uint) (*domain.User, error)
    FindAll(ctx context.Context) ([]domain.User, error)
    Update(ctx context.Context, user *domain.User) error
    Delete(ctx context.Context, id uint) error
}

type userRepository struct {
    db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
    return &userRepository{db: db}
}

func (r *userRepository) Create(ctx context.Context, user *domain.User) error {
    return r.db.WithContext(ctx).Create(user).Error
}
💼 Servicios (lógica de negocio)
Contienen la lógica de negocio y orquestan repositorios y otros servicios.

Reciben dependencias por interfaz.

Usan el contexto para trazabilidad.

go
package service

import (
    "context"
    "your-project/internal/domain"
    "your-project/internal/dto"
    "your-project/internal/repository"
    "golang.org/x/crypto/bcrypt"
)

type UserService interface {
    Create(ctx context.Context, req dto.CreateUserRequest) (*dto.UserResponse, error)
    GetByID(ctx context.Context, id uint) (*dto.UserResponse, error)
}

type userService struct {
    userRepo repository.UserRepository
}

func NewUserService(ur repository.UserRepository) UserService {
    return &userService{userRepo: ur}
}

func (s *userService) Create(ctx context.Context, req dto.CreateUserRequest) (*dto.UserResponse, error) {
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
    if err != nil {
        return nil, err
    }

    user := &domain.User{
        Name:     req.Name,
        Email:    req.Email,
        Password: string(hashedPassword),
    }

    if err := s.userRepo.Create(ctx, user); err != nil {
        return nil, err
    }

    return &dto.UserResponse{
        ID:    user.ID,
        Name:  user.Name,
        Email: user.Email,
    }, nil
}
🧪 Testing
Tests unitarios con testify (suite/assert).

Mocks con gomock o testify/mock.

Tests de integración con base de datos en memoria (ej: SQLite) o contenedores Docker.

Ejemplo de test unitario para servicio:

go
package service_test

import (
    "context"
    "testing"
    "your-project/internal/dto"
    "your-project/internal/domain"
    "your-project/internal/service"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
)

type mockUserRepo struct {
    mock.Mock
}

func (m *mockUserRepo) Create(ctx context.Context, user *domain.User) error {
    args := m.Called(ctx, user)
    return args.Error(0)
}

func TestCreateUser_Success(t *testing.T) {
    repo := new(mockUserRepo)
    svc := service.NewUserService(repo)

    req := dto.CreateUserRequest{
        Name:     "John",
        Email:    "john@example.com",
        Password: "secret",
    }

    repo.On("Create", mock.Anything, mock.AnythingOfType("*domain.User")).Return(nil)

    resp, err := svc.Create(context.Background(), req)

    assert.NoError(t, err)
    assert.NotNil(t, resp)
    assert.Equal(t, "John", resp.Name)
    repo.AssertExpectations(t)
}
📝 Logging
Usar logrus o zap con niveles (debug, info, error).

Incluir campos contextuales (request ID, usuario, etc.) mediante middleware.

go
package middleware

import (
    "time"
    "github.com/gin-gonic/gin"
    "github.com/sirupsen/logrus"
)

func Logger(log *logrus.Logger) gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        path := c.Request.URL.Path
        method := c.Request.Method

        c.Next()

        latency := time.Since(start)
        statusCode := c.Writer.Status()

        log.WithFields(logrus.Fields{
            "status":     statusCode,
            "method":     method,
            "path":       path,
            "latency":    latency,
            "client_ip":  c.ClientIP(),
        }).Info("request completed")
    }
}
🎯 Manejo de Errores
Definir errores personalizados con tipos y códigos HTTP asociados.

Usar un helper httpresponse para unificar respuestas de error.

go
package errors

type AppError struct {
    Code    int
    Message string
    Err     error
}

func (e *AppError) Error() string {
    return e.Message
}

func NewNotFoundError(msg string) *AppError {
    return &AppError{Code: 404, Message: msg}
}

func NewInternalError(err error) *AppError {
    return &AppError{Code: 500, Message: "Internal server error", Err: err}
}
📚 Documentación (Swagger)
Anotar handlers con comentarios para swaggo/swag.

Generar documentación automática.

go
// CreateUser crea un nuevo usuario
// @Summary Crear usuario
// @Tags users
// @Accept json
// @Produce json
// @Param user body dto.CreateUserRequest true "Datos del usuario"
// @Success 201 {object} dto.UserResponse
// @Failure 400 {object} httpresponse.ErrorResponse
// @Router /users [post]
func (h *UserHandler) CreateUser(c *gin.Context) { ... }
✅ Otras Buenas Prácticas
Contexto: Pasar context.Context a todas las capas (repositorio, servicio) para manejar timeouts y cancelaciones.

Validación: Usar go-playground/validator (ya integrado en Gin) y personalizar mensajes.

Migraciones: Usar golang-migrate/migrate para versionar esquemas.

Makefile: Incluir comandos para facilitar tareas.

makefile
run:
	go run cmd/api/main.go

test:
	go test -v ./...

migrate-up:
	migrate -path migrations -database "$(DATABASE_URL)" up

swagger:
	swag init -g cmd/api/main.go