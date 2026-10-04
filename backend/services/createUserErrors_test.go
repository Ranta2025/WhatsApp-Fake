package services

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"

	"gorm/backend/models"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// fakeTx devuelve un *gorm.DB sin conexión sobre el que Rollback es inofensivo.
func fakeTx() *gorm.DB {
	return &gorm.DB{Config: &gorm.Config{}, Statement: &gorm.Statement{}}
}

func createUserWithInsertError(t *testing.T, insertErr error) error {
	t.Helper()
	repo := new(MockUserRepo)
	svc := InitServices(repo, new(MockUserCache))
	ctx := context.Background()
	user := models.UserDataBase{
		User:     models.User{Username: "newuser", Gmail: "n@x.com", Telephon: "+5355123456"},
		Password: "password123",
	}
	repo.On("UsernameExist", user.Username, ctx).Return(false)
	repo.On("EmailExist", user.Gmail, ctx).Return("", false)
	repo.On("TelephonExist", user.Telephon, ctx).Return(false)
	repo.On("BeginTx").Return(fakeTx())
	repo.On("CreateUserTx", mock.Anything, mock.Anything, ctx).Return(insertErr)
	return svc.CreateUser(user, ctx)
}

func TestCreateUser_UniqueViolationMapsToFieldMessage(t *testing.T) {
	cases := map[string]string{
		"uni_user_data_bases_username": "Username ya existe",
		"uni_user_data_bases_gmail":    "Email ya existe",
		"uni_user_data_bases_telephon": "Telefono ya existe",
	}
	for constraint, want := range cases {
		t.Run(constraint, func(t *testing.T) {
			pgErr := &pgconn.PgError{Code: "23505", ConstraintName: constraint}
			err := createUserWithInsertError(t, errors.Join(errors.New("insert"), pgErr))
			assert.EqualError(t, err, want)
		})
	}
}

func TestCreateUser_OtherInsertErrorIsGenericAndLogged(t *testing.T) {
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	err := createUserWithInsertError(t, errors.New("pq: connection reset secret-detail"))
	assert.EqualError(t, err, "error al crear usuario")
	assert.Contains(t, logs.String(), "secret-detail", "la causa real debe quedar en el log")
}
