package utils

import (
	"golang.org/x/crypto/bcrypt"
)

// Hash genera un hash bcrypt de la contraseña con costo 14.
func Hash(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// ComparePassword verifica que la contraseña en texto plano coincida con el hash bcrypt.
func ComparePassword(password string, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
