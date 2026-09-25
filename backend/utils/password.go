package utils

import (
	"golang.org/x/crypto/bcrypt"
)

// bcryptCost es el costo de bcrypt. 12 (~250 ms) es el estándar recomendado;
// 14 tardaba ~1 s por hash, lo que ralentizaba el login y facilitaba agotar la
// CPU del servidor con peticiones de login concurrentes. Los hashes existentes
// con costo 14 se siguen verificando sin problema (el costo va en el hash).
const bcryptCost = 12

// Hash genera un hash bcrypt de la contraseña.
func Hash(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
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
