package utils

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func GenerateToken(username string) (string, error) {
	claim := jwt.MapClaims{}
	claim["username"] = username
	claim["exp"] = time.Now().Add(15 * time.Minute).Unix()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claim)
	hash_token,err := token.SignedString([]byte(os.Getenv("SECRETKEY")))
	if err != nil {
		return "", errors.New("Error al crear token")
	}
	return hash_token, nil
}

func DecodeToken(token string) (string, error) {

	tokenDecode, err := jwt.Parse(token,func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("Token invalido")
		}
		return []byte(os.Getenv("SECRETKEY")),nil
	})

	if err != nil || !tokenDecode.Valid{
		return "", errors.New("Token invallido")
	}

	claims, flag := tokenDecode.Claims.(jwt.MapClaims)
	if !flag {
		return "",errors.New("Error al extraer datos del token")
	}
	username := claims["username"].(string)

	return username, nil
}