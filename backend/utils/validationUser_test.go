package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// ============================================
// TESTS PARA ValidationLenUsername
// ============================================

func TestValidationLenUsernameValid(t *testing.T) {
	// ✅ Caso correcto: Username con 5+ caracteres
	result := ValidationLenUsername("usuario123")
	assert.True(t, result)
}

func TestValidationLenUsernameTooShort(t *testing.T) {
	// ❌ Username muy corto: menos de 5
	result := ValidationLenUsername("usr")
	assert.False(t, result)
}

func TestValidationLenUsernameEmpty(t *testing.T) {
	// 🔲 Username vacío
	result := ValidationLenUsername("")
	assert.False(t, result)
}

func TestValidationLenUsernameExactly5(t *testing.T) {
	// ✅ Límite: exactamente 5 caracteres
	result := ValidationLenUsername("user5")
	assert.True(t, result)
}

// ============================================
// TESTS PARA ValidationGmail
// ============================================

func TestValidationGmailValid(t *testing.T) {
	// ✅ Caso correcto: email gmail válido
	result := ValidationGmail("usuario@gmail.com")
	assert.True(t, result)
}

func TestValidationGmailNotGmail(t *testing.T) {
	// ❌ Email no es gmail
	result := ValidationGmail("usuario@hotmail.com")
	assert.False(t, result)
}

func TestValidationGmailTooShort(t *testing.T) {
	// ❌ Email gmail pero muy corto (<= 10 chars)
	result := ValidationGmail("ab@gmail.co") // Exactamente 10 caracteres
	assert.False(t, result)
}

func TestValidationGmailEmpty(t *testing.T) {
	// 🔲 Email vacío
	result := ValidationGmail("")
	assert.False(t, result)
}

func TestValidationGmailNoAt(t *testing.T) {
	// ❌ Email sin @
	result := ValidationGmail("usuariogmail.com")
	assert.False(t, result)
}

// ============================================
// TESTS PARA ValidationPasswordLen
// ============================================

func TestValidationPasswordLenValid(t *testing.T) {
	// ✅ Caso correcto: Password con más de 7 caracteres
	result := ValidationPasswordLen("password123")
	assert.True(t, result)
}

func TestValidationPasswordLenTooShort(t *testing.T) {
	// ❌ Password muy corto: 7 o menos
	result := ValidationPasswordLen("pass")
	assert.False(t, result)
}

func TestValidationPasswordLenExactly7(t *testing.T) {
	// ❌ Exactamente 7: debe ser > 7, no >=
	result := ValidationPasswordLen("passwor")
	assert.False(t, result)
}

func TestValidationPasswordLenExactly8(t *testing.T) {
	// ✅ Exactamente 8: cumple > 7
	result := ValidationPasswordLen("password")
	assert.True(t, result)
}

func TestValidationPasswordLenEmpty(t *testing.T) {
	// 🔲 Password vacío
	result := ValidationPasswordLen("")
	assert.False(t, result)
}

// ============================================
// TESTS PARA ValidationPasswordNumber
// ============================================

func TestValidationPasswordNumberValid(t *testing.T) {
	// ✅ Caso correcto: Password con número
	result := ValidationPasswordNumber("password123")
	assert.True(t, result)
}

func TestValidationPasswordNumberNoNumbers(t *testing.T) {
	// ❌ Password sin números
	result := ValidationPasswordNumber("passwordabc")
	assert.False(t, result)
}

func TestValidationPasswordNumberOnlyNumbers(t *testing.T) {
	// ✅ Solo números también cuenta
	result := ValidationPasswordNumber("12345")
	assert.True(t, result)
}

func TestValidationPasswordNumberEmpty(t *testing.T) {
	// 🔲 Password vacío
	result := ValidationPasswordNumber("")
	assert.False(t, result)
}

func TestValidationPasswordNumberWithSpecialChars(t *testing.T) {
	// ✅ Password con números y caracteres especiales
	result := ValidationPasswordNumber("pass!@#$%123")
	assert.True(t, result)
}

// ============================================
// TESTS PARA ValidationPasswordUpper
// ============================================

func TestValidationPasswordUpperValid(t *testing.T) {
	// ✅ Caso correcto: Password con mayúscula
	result := ValidationPasswordUpper("Password123")
	assert.True(t, result)
}

func TestValidationPasswordUpperNoUppercase(t *testing.T) {
	// ❌ Password sin mayúscula
	result := ValidationPasswordUpper("password123")
	assert.False(t, result)
}

func TestValidationPasswordUpperOnlyUppercase(t *testing.T) {
	// ✅ Solo mayúsculas también cuenta
	result := ValidationPasswordUpper("ABCDEFG")
	assert.True(t, result)
}

func TestValidationPasswordUpperEmpty(t *testing.T) {
	// 🔲 Password vacío
	result := ValidationPasswordUpper("")
	assert.False(t, result)
}

func TestValidationPasswordUpperMultipleUppercase(t *testing.T) {
	// ✅ Múltiples mayúsculas
	result := ValidationPasswordUpper("PaSsWoRd123")
	assert.True(t, result)
}

// ============================================
// TESTS PARA ValidationPasswordCharacterSpecial
// ============================================

func TestValidationPasswordCharacterSpecialValid(t *testing.T) {
	// ✅ Caso correcto: Password con caracteres especiales
	result := ValidationPasswordCharacterSpecial("password!@#")
	assert.True(t, result)
}

func TestValidationPasswordCharacterSpecialNoSpecial(t *testing.T) {
	// ❌ Password sin caracteres especiales
	result := ValidationPasswordCharacterSpecial("password123abc")
	assert.False(t, result)
}

func TestValidationPasswordCharacterSpecialOnlySpecial(t *testing.T) {
	// ✅ Solo caracteres especiales también cuenta
	result := ValidationPasswordCharacterSpecial("!@#$%^&*()")
	assert.True(t, result)
}

func TestValidationPasswordCharacterSpecialEmpty(t *testing.T) {
	// 🔲 Password vacío
	result := ValidationPasswordCharacterSpecial("")
	assert.False(t, result)
}

func TestValidationPasswordCharacterSpecialWithNumbers(t *testing.T) {
	// ✅ Números cuentan como NO letra/número para este caso
	// Espera, números y letras son "número o letra", así que no cuenta
	// Caracteres especiales son los que NO son número y NO son letra
	result := ValidationPasswordCharacterSpecial("!@#123ABC")
	assert.True(t, result)
}

func TestValidationPasswordCharacterSpecialSpace(t *testing.T) {
	// ✅ Espacio es un carácter especial
	result := ValidationPasswordCharacterSpecial("password pass")
	assert.True(t, result)
}
