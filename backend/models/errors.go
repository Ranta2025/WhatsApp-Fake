package models

import "errors"

// AppError es un error con mensaje seguro para el cliente. El error original
// (Err) se registra en logs pero jamás se envía al cliente (C3): SafeMessage
// garantiza que solo Message llega al body de la respuesta.
type AppError struct {
	Code    int    // HTTP status code asociado
	Message string // mensaje seguro para el cliente
	Err     error  // error original (interno, solo logs)
}

// Error implementa la interfaz error con el mensaje seguro.
func (e *AppError) Error() string { return e.Message }

// SafeMessage devuelve el mensaje apto para el cliente.
func (e *AppError) SafeMessage() string { return e.Message }

// Unwrap permite errors.Is/errors.As recorrer la cadena hasta el error real.
func (e *AppError) Unwrap() error { return e.Err }

// NewAppError construye un AppError. err puede ser nil si no hay error interno
// que registrar (p.ej. validaciones del handler).
func NewAppError(code int, message string, err error) *AppError {
	return &AppError{Code: code, Message: message, Err: err}
}

// IsAppError indica si err (o su cadena) es un *AppError.
func IsAppError(err error) bool {
	var appErr *AppError
	return errors.As(err, &appErr)
}

// SafeMessage mapea cualquier error a un mensaje seguro para el cliente:
//   - *AppError → su Message
//   - cualquier otro error → "internal server error"
//
// Ningún texto interno (SQL, rutas de archivo, stack traces, nombres de
// columnas) puede pasar por este punto hacia la respuesta HTTP.
func SafeMessage(err error) string {
	if err == nil {
		return ""
	}
	var appErr *AppError
	if errors.As(err, &appErr) && appErr.Message != "" {
		return appErr.Message
	}
	return "internal server error"
}
