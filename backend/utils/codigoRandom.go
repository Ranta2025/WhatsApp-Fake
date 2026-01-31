package utils

import (
	"crypto/rand"
	"errors"
	"math/big"
	"os"
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

func SendEmail(to string, subject string, body string) error {
	from := os.Getenv("GMAIL_FROM")
	if from == "" {
		from = "proyectowhatsappfake@gmail.com"
	}
	pass := os.Getenv("GMAIL_PASSWORD")
	if pass == "" {
		return errors.New("GMAIL_PASSWORD no configurada en variables de entorno")
	}

	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/plain", body)

	d := gomail.NewDialer("smtp.gmail.com", 587, from, pass)
	if err := d.DialAndSend(m); err != nil {
		return err
	}
	return nil
}
