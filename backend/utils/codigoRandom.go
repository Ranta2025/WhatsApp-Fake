package utils

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

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

// SendEmail envía un correo electrónico. Si BREVO_API_KEY está definida usa la
// API HTTP de Brevo (útil en plataformas que bloquean los puertos SMTP, como
// los planes gratuitos de algunos PaaS); si no, usa SMTP.
func SendEmail(to string, subject string, body string) error {
	if apiKey := os.Getenv("BREVO_API_KEY"); apiKey != "" {
		return sendEmailBrevo(apiKey, to, subject, body)
	}
	return sendEmailSMTP(to, subject, body)
}

// sendEmailBrevo envía el correo con la API transaccional de Brevo.
// El remitente (EMAIL_FROM o GMAIL_FROM) debe estar verificado en Brevo.
func sendEmailBrevo(apiKey, to, subject, body string) error {
	from := os.Getenv("EMAIL_FROM")
	if from == "" {
		from = os.Getenv("GMAIL_FROM")
	}
	if from == "" {
		return errors.New("EMAIL_FROM no configurado")
	}
	payload, err := json.Marshal(map[string]interface{}{
		"sender":      map[string]string{"email": from, "name": "todos"},
		"to":          []map[string]string{{"email": to}},
		"subject":     subject,
		"textContent": body,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("error enviando email (Brevo): %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.Printf("[EMAIL] Brevo respondió %d: %s", resp.StatusCode, detail)
		return fmt.Errorf("error enviando email (Brevo): estado %d", resp.StatusCode)
	}
	return nil
}

// sendEmailSMTP envía un correo electrónico via SMTP.
// Intenta primero con STARTTLS en el puerto 587 y hace fallback a SSL en el 465.
func sendEmailSMTP(to string, subject string, body string) error {
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
