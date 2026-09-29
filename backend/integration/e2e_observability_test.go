//go:build e2e

// Comprobaciones e2e de observabilidad contra el stack en ejecución:
//
//	E2E_BASE_URL=http://localhost go test -tags e2e ./backend/integration/
//
// E2E_API_URL (opcional) es el puerto directo de la API; por defecto, el host
// de E2E_BASE_URL en el puerto 8080.
package integration

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func apiURL(t *testing.T, base string) string {
	t.Helper()
	if v := os.Getenv("E2E_API_URL"); v != "" {
		return v
	}
	u, err := url.Parse(base)
	require.NoError(t, err)
	return "http://" + u.Hostname() + ":8080"
}

func getRaw(t *testing.T, target string, header map[string]string) (int, http.Header, string) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, target, nil)
	require.NoError(t, err)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, string(body)
}

// Toda respuesta lleva X-Request-ID (generado o el entrante válido) y un id
// entrante inválido se reemplaza.
func TestE2E_RequestIDOnHealthz(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")

	for name, root := range map[string]string{"nginx": base, "api": apiURL(t, base)} {
		t.Run(name, func(t *testing.T) {
			status, h, _ := getRaw(t, root+"/healthz", nil)
			assert.Equal(t, http.StatusOK, status)
			assert.NotEmpty(t, h.Get("X-Request-ID"), "id generado")

			status, h, _ = getRaw(t, root+"/healthz", map[string]string{"X-Request-ID": "e2e-valid.id_1"})
			assert.Equal(t, http.StatusOK, status)
			if name == "api" {
				assert.Equal(t, "e2e-valid.id_1", h.Get("X-Request-ID"), "id válido se conserva")
			} else {
				// nginx pisa el id entrante con su propio $request_id (docker/nginx.conf):
				// el id del borde es la fuente de verdad, no el del cliente.
				assert.NotEmpty(t, h.Get("X-Request-ID"))
				assert.NotEqual(t, "e2e-valid.id_1", h.Get("X-Request-ID"), "nginx reemplaza el id entrante")
			}

			status, h, _ = getRaw(t, root+"/healthz", map[string]string{"X-Request-ID": "inválido con espacios!"})
			assert.Equal(t, http.StatusOK, status)
			assert.NotEqual(t, "inválido con espacios!", h.Get("X-Request-ID"))
			assert.NotEmpty(t, h.Get("X-Request-ID"))
		})
	}
}

// /metrics solo existe en el listener interno: ni el puerto 80 (nginx) ni el
// 8080 (API directa) lo sirven.
func TestE2E_MetricsNotExposedOnPublicPorts(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")

	for name, root := range map[string]string{"nginx": base, "api": apiURL(t, base)} {
		t.Run(name, func(t *testing.T) {
			status, _, body := getRaw(t, root+"/metrics", nil)
			assert.Equal(t, http.StatusNotFound, status)
			assert.NotContains(t, body, "go_goroutines")
			assert.NotContains(t, body, "http_requests_total")
			assert.NotContains(t, body, `id="root"`, "no debe caer en el fallback de la SPA")
			assert.NotContains(t, body, "<script", "no debe caer en el fallback de la SPA")
		})
	}
}
