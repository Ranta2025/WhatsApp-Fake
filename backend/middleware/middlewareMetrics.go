package middleware

import (
	"strconv"
	"time"

	"gorm/backend/metrics"

	"github.com/gin-gonic/gin"
)

// metricsUnmatchedRoute agrupa en una sola serie toda petición que no casa con
// ninguna ruta registrada, para que rutas arbitrarias no exploten la cardinalidad.
const metricsUnmatchedRoute = "unmatched"

// metricsDurationExcludedRoutes son las rutas que no se observan en el
// histograma de duración: el WebSocket es de larga vida (su duración no es
// latencia) y /healthz se sondea muy seguido.
var metricsDurationExcludedRoutes = map[string]struct{}{
	"/api/v1/ws": {},
	"/healthz":   {},
}

// Metrics instrumenta cada request: cuenta por método, plantilla de ruta y
// estado; mide la duración por método y plantilla; y mantiene el gauge de
// requests en vuelo. Usa c.FullPath() (plantilla, nunca la ruta cruda ni ids)
// para acotar la cardinalidad, y colapsa las rutas no registradas en
// "unmatched". El histograma de duración excluye el WebSocket y /healthz.
func Metrics(m *metrics.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		m.HTTPRequestsInFlight.Inc()
		defer m.HTTPRequestsInFlight.Dec()

		c.Next()

		route := c.FullPath()
		if route == "" {
			route = metricsUnmatchedRoute
		}
		method := c.Request.Method
		m.HTTPRequestsTotal.WithLabelValues(method, route, strconv.Itoa(c.Writer.Status())).Inc()

		if _, excluded := metricsDurationExcludedRoutes[route]; !excluded {
			m.HTTPRequestDuration.WithLabelValues(method, route).Observe(time.Since(start).Seconds())
		}
	}
}
