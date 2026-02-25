package utils

import (
	"strings"
	"unicode"
)

// ValidationLenUsername verifica que el username tenga al menos 5 caracteres.
func ValidationLenUsername(username string) bool {
	return len(username) >= 5
}

// ValidationGmail verifica que el email pertenezca a @gmail.com y tenga
// una longitud mínima razonable (>10 chars incluyendo el dominio).
func ValidationGmail(gmail string) bool {
	return strings.HasSuffix(gmail, "@gmail.com") && len(gmail) > 10
}

// ValidationPasswordLen verifica que la contraseña tenga más de 7 caracteres.
func ValidationPasswordLen(password string) bool {
	return len(password) > 7
}

// ValidationPasswordNumber verifica que la contraseña contenga al menos un dígito.
func ValidationPasswordNumber(password string) bool {
	for _, i := range password {
		if unicode.IsNumber(i) {
			return true
		}
	}
	return false
}

// ValidationPasswordUpper verifica que la contraseña contenga al menos una
// letra mayúscula.
func ValidationPasswordUpper(password string) bool {
	for _, i := range password {
		if unicode.IsUpper(i) {
			return true
		}
	}
	return false
}

// ValidationPasswordCharacterSpecial verifica que la contraseña contenga al
// menos un carácter no alfanumérico (especial).
func ValidationPasswordCharacterSpecial(password string) bool {
	for _, v := range password {
		if !unicode.IsNumber(v) && !unicode.IsLetter(v) {
			return true
		}
	}
	return false
}
