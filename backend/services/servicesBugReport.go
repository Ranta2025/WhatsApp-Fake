package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"gorm/backend/models"
	"net/http"
	"os"
	"time"
)

type ServiceBugReport struct {
	githubToken string
	owner       string
	repo        string
}

func InitServiceBugReport() *ServiceBugReport {
	return &ServiceBugReport{
		githubToken: os.Getenv("GITHUB_TOKEN"),
		owner:       os.Getenv("GITHUB_OWNER"),
		repo:        os.Getenv("GITHUB_REPO"),
	}
}

func (s *ServiceBugReport) CreateGitHubIssue(report models.BugReport) error {
	// Validar que tengamos las credenciales necesarias
	if s.githubToken == "" || s.owner == "" || s.repo == "" {
		return fmt.Errorf("GitHub configuration is missing. Please set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables")
	}

	// Construir el cuerpo del issue con formato Markdown
	body := s.formatIssueBody(report)

	// Crear el objeto del issue
	issue := models.GitHubIssue{
		Title:  report.Title,
		Body:   body,
		Labels: []string{"bug", "user-reported"},
	}

	// Convertir a JSON
	jsonData, err := json.Marshal(issue)
	if err != nil {
		return fmt.Errorf("error marshaling issue: %v", err)
	}

	// Crear la petición
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues", s.owner, s.repo)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	// Configurar headers
	req.Header.Set("Authorization", fmt.Sprintf("token %s", s.githubToken))
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	// Enviar la petición
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	// Verificar la respuesta
	if resp.StatusCode != http.StatusCreated {
		var errorResp map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errorResp)
		return fmt.Errorf("GitHub API error (status %d): %v", resp.StatusCode, errorResp)
	}

	return nil
}

func (s *ServiceBugReport) formatIssueBody(report models.BugReport) string {
	body := fmt.Sprintf("## 🐛 Descripción del Bug\n\n%s\n\n", report.Description)

	if report.Steps != "" {
		body += fmt.Sprintf("## 📋 Pasos para Reproducir\n\n%s\n\n", report.Steps)
	}

	if report.Expected != "" {
		body += fmt.Sprintf("## ✅ Comportamiento Esperado\n\n%s\n\n", report.Expected)
	}

	if report.Actual != "" {
		body += fmt.Sprintf("## ❌ Comportamiento Actual\n\n%s\n\n", report.Actual)
	}

	// Información del sistema
	body += "## 💻 Información del Sistema\n\n"

	if report.Browser != "" {
		body += fmt.Sprintf("- **Navegador:** %s\n", report.Browser)
	}

	if report.OS != "" {
		body += fmt.Sprintf("- **Sistema Operativo:** %s\n", report.OS)
	}

	if report.ScreenSize != "" {
		body += fmt.Sprintf("- **Resolución de Pantalla:** %s\n", report.ScreenSize)
	}

	if report.UserEmail != "" {
		body += fmt.Sprintf("\n---\n\n📧 **Reportado por:** %s\n", report.UserEmail)
	}

	body += fmt.Sprintf("\n🕐 **Fecha del reporte:** %s\n", time.Now().Format("2006-01-02 15:04:05"))

	return body
}
