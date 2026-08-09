package utils

import (
	"crypto/rand"
	"errors"
	"log"
	"math/big"
	"os"
	"strconv"
	"strings"

	"gopkg.in/gomail.v2"
)

type Config struct {
	Longitud                int
	IncluirMayuscula        bool
	IncluirMinuscula        bool
	IncluirNumero           bool
	IncluirCaracterEspecial bool
}

// GenerarCodigo genera un código aleatorio criptográficamente seguro usando
// la configuración dada (longitud, tipos de caracteres incluidos).
func GenerarCodigo(config Config) (string, error) {
	var charset strings.Builder

	if config.IncluirMayuscula {
		charset.WriteString("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	}
	if config.IncluirMinuscula {
		charset.WriteString("abcdefghijklmnopqrstuvwxyz")
	}
	if config.IncluirNumero {
		charset.WriteString("0123456789")
	}

	if config.IncluirCaracterEspecial {
		charset.WriteString("!@#$%^&*(){}[]-_;:'<>+=")
	}

	if charset.Len() == 0 {
		return "", errors.New("error al generar codigo")
	}

	caracteres := charset.String()
	var codigo strings.Builder

	for i := 0; i < config.Longitud; i++ {
		max := big.NewInt(int64(len(caracteres)))
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		codigo.WriteByte(caracteres[idx.Int64()])
	}

	return codigo.String(), nil
}

// SendEmail envía un correo electrónico via SMTP.
// Intenta primero con STARTTLS en el puerto 587 y hace fallback a SSL en el 465.
func SendEmail(to string, subject string, body string) error {
	from := os.Getenv("GMAIL_FROM")
	if from == "" {
		from = "proyectowhatsappfake@gmail.com"
	}
	pass := os.Getenv("GMAIL_PASSWORD")
	if pass == "" {
		return errors.New("GMAIL_PASSWORD no configurada en variables de entorno")
	}
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		host = "smtp.gmail.com"
	}
	port := 587
	if portEnv := os.Getenv("SMTP_PORT"); portEnv != "" {
		if p, err := strconv.Atoi(portEnv); err == nil {
			port = p
		}
	}
	useSSL := os.Getenv("SMTP_SSL") == "true"

	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/plain", body)

	d := gomail.NewDialer(host, port, from, pass)
	d.SSL = useSSL
	if err := d.DialAndSend(m); err != nil {
		log.Printf("[EMAIL] Error enviando (host=%s port=%d ssl=%v): %v", host, port, useSSL, err)
		// Fallback a SSL directo en 465 (útil si 587 está bloqueado)
		if port != 465 {
			dSSL := gomail.NewDialer(host, 465, from, pass)
			dSSL.SSL = true
			if err2 := dSSL.DialAndSend(m); err2 != nil {
				log.Printf("[EMAIL] Error enviando fallback 465: %v", err2)
				return err2
			}
			return nil
		}
		return err
	}
	return nil
}
