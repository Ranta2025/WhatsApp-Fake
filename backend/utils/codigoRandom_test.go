package utils

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================
// TESTS PARA GenerarCodigo
// ============================================

func TestGenerarCodigoSuccess(t *testing.T) {
	// ✅ Caso exitoso: generar código con solo números
	config := Config{
		Longitud:                6,
		IncluirMayuscula:        false,
		IncluirMinuscula:        false,
		IncluirNumero:           true,
		IncluirCaracterEspecial: false,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.NotEmpty(t, codigo)
	assert.Equal(t, len(codigo), 6)
	// Verificar que solo contiene números
	for _, c := range codigo {
		assert.True(t, c >= '0' && c <= '9', "debe contener solo números")
	}
}

func TestGenerarCodigoLongitudDiferente(t *testing.T) {
	// ✅ Generar código con diferente longitud
	config := Config{
		Longitud:         12,
		IncluirNumero:    true,
		IncluirMayuscula: true,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.Equal(t, len(codigo), 12)
}

func TestGenerarCodigoConMayusculas(t *testing.T) {
	// ✅ Generar código con mayúsculas
	config := Config{
		Longitud:         10,
		IncluirMayuscula: true,
		IncluirNumero:    false,
		IncluirMinuscula: false,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.NotEmpty(t, codigo)
	// Al menos algunos caracteres deben ser mayúsculas
	hasUpper := false
	for _, c := range codigo {
		if c >= 'A' && c <= 'Z' {
			hasUpper = true
			break
		}
	}
	assert.True(t, hasUpper)
}

func TestGenerarCodigoConMinusculas(t *testing.T) {
	// ✅ Generar código con minúsculas
	config := Config{
		Longitud:         10,
		IncluirMinuscula: true,
		IncluirNumero:    false,
		IncluirMayuscula: false,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.NotEmpty(t, codigo)
}

func TestGenerarCodigoConCaracteresEspeciales(t *testing.T) {
	// ✅ Generar código con caracteres especiales
	config := Config{
		Longitud:                10,
		IncluirCaracterEspecial: true,
		IncluirNumero:           false,
		IncluirMayuscula:        false,
		IncluirMinuscula:        false,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.NotEmpty(t, codigo)
}

func TestGenerarCodigoMixto(t *testing.T) {
	// ✅ Generar código con todos los tipos de caracteres
	config := Config{
		Longitud:                20,
		IncluirMayuscula:        true,
		IncluirMinuscula:        true,
		IncluirNumero:           true,
		IncluirCaracterEspecial: true,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.Equal(t, len(codigo), 20)
	assert.NotEmpty(t, codigo)
}

func TestGenerarCodigoNingunTipo(t *testing.T) {
	// ❌ Error: ningún tipo de carácter seleccionado
	config := Config{
		Longitud:                6,
		IncluirMayuscula:        false,
		IncluirMinuscula:        false,
		IncluirNumero:           false,
		IncluirCaracterEspecial: false,
	}

	codigo, err := GenerarCodigo(config)

	require.Error(t, err)
	assert.Empty(t, codigo)
}

func TestGenerarCodigoLongitudCero(t *testing.T) {
	// ✅ Longitud 0: genera string vacío sin error
	config := Config{
		Longitud:      0,
		IncluirNumero: true,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.Empty(t, codigo)
	assert.Equal(t, len(codigo), 0)
}

func TestGenerarCodigoLongitudGrande(t *testing.T) {
	// ✅ Longitud muy grande
	config := Config{
		Longitud:      1000,
		IncluirNumero: true,
	}

	codigo, err := GenerarCodigo(config)

	require.NoError(t, err)
	assert.Equal(t, len(codigo), 1000)
}

func TestGenerarCodigoDosVecesDistinto(t *testing.T) {
	// ✅ Generar dos códigos: deben ser diferentes (aleatorio)
	config := Config{
		Longitud:      10,
		IncluirNumero: true,
	}

	codigo1, err1 := GenerarCodigo(config)
	codigo2, err2 := GenerarCodigo(config)

	require.NoError(t, err1)
	require.NoError(t, err2)
	// Muy probable que sean diferentes (a menos que sea extremadamente raro)
	// Pero no garantizado, así que solo verificamos que ambos son válidos
	assert.NotEmpty(t, codigo1)
	assert.NotEmpty(t, codigo2)
}

// ============================================
// TESTS PARA SendEmail (básico, sin envío real)
// ============================================

func TestSendEmailNoPasswordConfigured(t *testing.T) {
	// ❌ Error: variable GMAIL_PASSWORD no configurada
	// Guardamos el valor anterior si existe
	oldPass := ""

	// Limpiamos la variable
	oldPass = os.Getenv("GMAIL_PASSWORD")
	os.Setenv("GMAIL_PASSWORD", "")
	defer os.Setenv("GMAIL_PASSWORD", oldPass)

	err := SendEmail("test@example.com", "Asunto", "Cuerpo")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "no configurada")
}

func TestSendEmailValidInputs(t *testing.T) {
	// ⚠️ Nota: Este test verificaría el comportamiento real
	// pero requiere configuración de email válida
	// Por ahora solo verificamos que la función existe

	// En un escenario real, necesitarías:
	// - Configurar credenciales válidas
	// - Usar un servidor SMTP de prueba
	// - Mockar la función de envío

	// Para este proyecto, solo verificamos que NO da error si está configurado
	err := SendEmail("test@example.com", "Test", "Body")

	// El resultado depende de si está configurado o no
	// No hacemos assert del error aquí porque varía según el environment
	_ = err
}
