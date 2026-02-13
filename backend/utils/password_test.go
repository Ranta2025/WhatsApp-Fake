package utils

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================
// TESTS PARA LA FUNCIÓN Hash()
// ============================================

// Caso 1: Hash exitoso con contraseña válida
func TestHashSuccess(t *testing.T) {
	// ARRANGE
	password := "miContraseña123"

	// ACT
	hash, err := Hash(password)

	// ASSERT
	require.NoError(t, err)                 // ✅ No debe haber error
	assert.NotEmpty(t, hash)                // ✅ Hash no vacío
	assert.NotEqual(t, hash, password)      // ✅ Hash ≠ contraseña original
	assert.GreaterOrEqual(t, len(hash), 50) // ✅ bcrypt genera hashes largos
}

// Caso 2: Hash con contraseña corta
func TestHashShortPassword(t *testing.T) {
	// ARRANGE
	password := "abc"

	// ACT
	hash, err := Hash(password)

	// ASSERT
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, hash, password)
}

// Caso 3: Hash con contraseña vacía (debería funcionar, pero es inseguro)
func TestHashEmptyPassword(t *testing.T) {
	// ARRANGE
	password := ""

	// ACT
	hash, err := Hash(password)

	// ASSERT - bcrypt permite contraseñas vacías, pero no las recomendamos
	assert.NoError(t, err)
	assert.NotEmpty(t, hash)
}

// Caso 4: Dos hashes del mismo password deben ser DIFERENTES (bcrypt agrega salt)
func TestHashDifferentSalts(t *testing.T) {
	// ARRANGE
	password := "miContraseña123"

	// ACT
	hash1, _ := Hash(password)
	hash2, _ := Hash(password)

	// ASSERT
	assert.NotEqual(t, hash1, hash2) // ✅ Mismo password, diferente hash (por el salt)
}

// ============================================
// TESTS PARA LA FUNCIÓN ComparePassword()
// ============================================

// Caso 1: Comparar contraseña CORRECTA
func TestComparePasswordCorrect(t *testing.T) {
	// ARRANGE
	password := "miContraseña123"
	hash, _ := Hash(password)

	// ACT
	result := ComparePassword(password, hash)

	// ASSERT
	assert.True(t, result) // ✅ Debe devolver true
}

// Caso 2: Comparar contraseña INCORRECTA
func TestComparePasswordIncorrect(t *testing.T) {
	// ARRANGE
	password := "miContraseña123"
	wrongPassword := "otraContraseña456"
	hash, _ := Hash(password)

	// ACT
	result := ComparePassword(wrongPassword, hash)

	// ASSERT
	assert.False(t, result) // ✅ Debe devolver false
}

// Caso 3: Comparar contraseña vacía con hash válido
func TestComparePasswordEmptyPassword(t *testing.T) {
	// ARRANGE
	password := "miContraseña123"
	emptyPassword := ""
	hash, _ := Hash(password)

	// ACT
	result := ComparePassword(emptyPassword, hash)

	// ASSERT
	assert.False(t, result) // ✅ Contraseña vacía no coincide
}

// Caso 4: Comparar con hash inválido
func TestComparePasswordInvalidHash(t *testing.T) {
	// ARRANGE
	password := "miContraseña123"
	invalidHash := "esto_no_es_un_hash_valido"

	// ACT
	result := ComparePassword(password, invalidHash)

	// ASSERT
	assert.False(t, result) // ✅ Hash inválido devuelve false
}

// Caso 5: Comparar ambos vacíos
func TestComparePasswordBothEmpty(t *testing.T) {
	// ARRANGE
	password := ""
	emptyPassword := ""
	hash, _ := Hash(password)

	// ACT
	result := ComparePassword(emptyPassword, hash)

	// ASSERT
	assert.True(t, result) // ✅ Ambos vacíos coinciden
}

// Caso 6: Caso sensible (mayúsculas/minúsculas)
func TestComparePasswordCaseSensitive(t *testing.T) {
	// ARRANGE
	password := "MiContraseña123"
	wrongCase := "micontraseña123"
	hash, _ := Hash(password)

	// ACT
	result := ComparePassword(wrongCase, hash)

	// ASSERT
	assert.False(t, result) // ✅ Las contraseñas son sensibles a mayúsculas
}

// ============================================
// TESTS DE INTEGRACIÓN (Flujo completo)
// ============================================

// Caso: Flujo completo: generar hash y luego comparar
func TestHashAndCompareFlow(t *testing.T) {
	// ARRANGE
	originalPassword := "miContraseña123"

	// ACT - Step 1: Generar hash
	hash, err := Hash(originalPassword)
	require.NoError(t, err)

	// ACT - Step 2: Comparar contraseña correcta
	resultCorrect := ComparePassword(originalPassword, hash)

	// ACT - Step 3: Comparar contraseña incorrecta
	resultIncorrect := ComparePassword("wrongPassword", hash)

	// ASSERT
	assert.True(t, resultCorrect)    // ✅ Contraseña original coincide
	assert.False(t, resultIncorrect) // ✅ Contraseña incorrecta no coincide
}

// ============================================
// TEST TABLE - Forma profesional de probar múltiples casos
// ============================================

func TestComparePasswordTable(t *testing.T) {
	// Preparar la contraseña y su hash
	password := "correctPassword"
	hash, _ := Hash(password)

	// Tabla de casos de prueba
	testCases := []struct {
		name     string
		password string
		expected bool
	}{
		{
			name:     "Contraseña correcta",
			password: "correctPassword",
			expected: true,
		},
		{
			name:     "Contraseña incorrecta",
			password: "wrongPassword",
			expected: false,
		},
		{
			name:     "Mayúscula diferente",
			password: "correctpassword",
			expected: false,
		},
		{
			name:     "Con espacios",
			password: "correctPassword ",
			expected: false,
		},
	}

	// Ejecutar cada caso
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := ComparePassword(tc.password, hash)
			assert.Equal(t, tc.expected, result, "para caso: %s", tc.name)
		})
	}
}
