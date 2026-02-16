# WebSocket Backend — Tutorial completo (arquitectura sólida, paso a paso)

> Enfoque 100% backend. Aquí aprendes cómo diseñar, estructurar y programar WebSocket en Go con una arquitectura profesional. El frontend lo dejamos para después.

---

## 1) Fundamentos mínimos que debes dominar

### 1.1 WebSocket en una frase
Conexión persistente, bidireccional, baja latencia. Ideal para chat y notificaciones.

### 1.2 Handshake en backend
El servidor recibe un request HTTP con `Upgrade: websocket` y responde `101 Switching Protocols`. Desde ese momento, el socket queda abierto.

### 1.3 Frames que debes manejar
- **Text** (JSON)
- **Ping/Pong** (keep-alive)
- **Close** (cierre correcto)

---

## 2) Arquitectura correcta (backend real)

### 2.1 ¿Por qué necesitas un mapa de conexiones?
Sin mapa no puedes:
- enviar mensajes directos
- saber quién está conectado
- limpiar conexiones muertas

**Estructura base:**
```
map[username]*Client
```

### 2.2 Concurrencia en Go (crítico)
Varias goroutines acceden al mapa. Debes usar:
- `sync.RWMutex`, o
- `sync.Map`

Sin esto, tendrás **race conditions** y panics.

---

## 3) Diseño de módulos (ubicación en tu proyecto)

Recomendación de carpetas:
```
backend/
  websocket/
    hub.go
    client.go
    handler.go
    message.go
```

---

## 4) Modelo de mensaje estándar
Mantén un contrato JSON único.

```json
{
  "type": "chat.message",
  "from": "alice",
  "to": "bob",
  "body": "hola",
  "timestamp": "2026-02-03T10:00:00Z"
}
```

---

## 5) Implementación paso a paso (backend)

### 5.1 message.go
```go
package websocket

type Message struct {
	Type      string `json:"type"`
	From      string `json:"from"`
	To        string `json:"to"`
	Body      string `json:"body"`
	Timestamp string `json:"timestamp"`
}
```

### 5.2 hub.go (mapa de conexiones)
```go
package websocket

import "sync"

type Hub struct {
	mu        sync.RWMutex
	Clients   map[string]*Client
	Register  chan *Client
	Remove    chan *Client
	Broadcast chan []byte
}

func NewHub() *Hub {
	return &Hub{
		Clients:   make(map[string]*Client),
		Register:  make(chan *Client),
		Remove:    make(chan *Client),
		Broadcast: make(chan []byte),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.Register:
			h.mu.Lock()
			h.Clients[c.Username] = c
			h.mu.Unlock()

		case c := <-h.Remove:
			h.mu.Lock()
			delete(h.Clients, c.Username)
			h.mu.Unlock()

		case msg := <-h.Broadcast:
			h.mu.RLock()
			for _, c := range h.Clients {
				c.Send <- msg
			}
			h.mu.RUnlock()
		}
	}
}

// SendTo envía un mensaje privado a un usuario específico (chat 1 a 1)
func (h *Hub) SendTo(username string, msg []byte) {
	h.mu.RLock()
	client, exists := h.Clients[username]
	h.mu.RUnlock()

	if exists {
		select {
		case client.Send <- msg:
		default:
			// Canal lleno, ignorar
		}
	}
}
```

### 5.3 client.go (lectura y escritura con servicios)
```go
package websocket

import (
	"encoding/json"

	"github.com/gorilla/websocket"
)

type Client struct {
	Username string
	Conn     *websocket.Conn
	Send     chan []byte
}

func (c *Client) readPump(hub *Hub, chatService *services.ServiceChat) {
	defer func() {
		hub.Remove <- c
		c.Conn.Close()
	}()

	for {
		_, msg, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		// 1. Parsear JSON
		var message Message
		if err := json.Unmarshal(msg, &message); err != nil {
			continue
		}

		// 2. Validar
		if message.Body == "" || message.To == "" {
			continue
		}

		// 3. Guardar en DB (tu ServiceChat)
		if err := chatService.CreateMessage(message.From, message.To, message.Body); err != nil {
			continue
		}

		// 4. Enviar al contacto específico (chat 1 a 1)
		hub.SendTo(message.To, msg)
	}
}

func (c *Client) writePump() {
	defer c.Conn.Close()
	for msg := range c.Send {
		_ = c.Conn.WriteMessage(websocket.TextMessage, msg)
	}
}
```

### 5.4 handler.go (upgrade + JWT + Servicios)
```go
package websocket

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleWebSocket(hub *Hub, chatService *services.ServiceChat) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token requerido"})
			return
		}

		// TODO: validar token y extraer username
		username := "user_from_token"

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}

		client := &Client{Username: username, Conn: conn, Send: make(chan []byte, 256)}
		hub.Register <- client

		go client.writePump()
		client.readPump(hub, chatService)  // ← Pasamos el servicio aquí
	}
}
```

---

## 6) Integración con tus servicios (ServiceChat)

### 6.1 Flujo completo con servicios

En tu backend tienes `ServiceChat`. El flujo es:

1. **Handler** = puerta de entrada (Upgrade + validar JWT)
2. **readPump** = procesa datos (validar, guardar en DB con ServiceChat, enviar)
3. **Hub** = coordina (qué usuario recibe qué)
4. **writePump** = envía al cliente

### 6.2 Flujo de un mensaje privado (chat 1 a 1)

```
Cliente A              readPump              ServiceChat          Hub              Cliente B
   |                     |                       |                 |                 |
   |-- Envía msg ------> |                       |                 |                 |
   |                     |-- CreateMessage() --> DB               |                 |
   |                     |                       |                 |                 |
   |                     |-- hub.SendTo(B) --------------------->>|                 |
   |                     |                       |          busca conexión de B    |
   |                     |                       |                 |-- Send chan -->|
   |                     |                       |                 |       writePump|
   |<--- respuesta ------ echo (opcional) -------|                 |<---- socket ---|
```

### 6.3 Casos de uso

**Mensaje privado (1 a 1):**
```go
hub.SendTo(message.To, msg)  // Solo lo recibe el destinatario
```

**Notificación global (todos):**
```go
hub.Broadcast <- msg  // Todos los conectados lo reciben
```

**Notificar a múltiples (grupo):**
```go
for _, user := range group {
	hub.SendTo(user, msg)
}
```

### 6.4 ¿Cómo manejar múltiples servicios? (Enrutamiento por `type`)

Si tu aplicación crece y necesitas manejar Chat, Contactos y Notificaciones por el mismo WebSocket, el servidor necesita saber a qué servicio llamar.

**La solución es un `switch` basado en el campo `type` del mensaje.**

**1. Estructura Base del Mensaje**
Primero, definimos una estructura que solo lee el tipo y deja el resto como `json.RawMessage` (bytes crudos) para que lo procese el servicio específico.

```go
type BaseMessage struct {
    Type    string          `json:"type"`    // "chat", "contact", "auth"
    Payload json.RawMessage `json:"payload"` // El contenido específico
}
```

**2. Implementación en el `readPump`**
Modificamos el bucle de lectura para que actúe como un semáforo de tráfico.

```go
func (c *Client) readPump(hub *Hub, chatService *ServiceChat, contactService *ServiceContact) {
    defer func() {
        hub.Remove <- c
        c.Conn.Close()
    }()

    for {
        // 1. Leer mensaje crudo
        _, messageBytes, err := c.Conn.ReadMessage()
        if err != nil {
            break
        }

        // 2. Decodificar encabezado (Type)
        var baseMsg BaseMessage
        if err := json.Unmarshal(messageBytes, &baseMsg); err != nil {
            log.Println("Error formato JSON:", err)
            continue
        }

        // 3. Router: Decidir qué servicio ejecuta la acción
        switch baseMsg.Type {
        
        case "chat":
            // El payload se pasa al servicio de chat para que él lo entienda
            chatService.HandleMessage(c.Username, baseMsg.Payload)

        case "contact":
            // El payload se pasa al servicio de contactos
            contactService.HandleContactAction(c.Username, baseMsg.Payload)
            
        case "ping":
             c.Send <- []byte(`{"type":"pong"}`)

        default:
            log.Printf("Tipo de mensaje desconocido: %s", baseMsg.Type)
        }
    }
}
```

**3. Ejemplo de los Servicios Específicos**
Cada servicio sabe cómo leer *su* propio payload.

```go
// En ServiceChat
func (s *ServiceChat) HandleMessage(sender string, payload []byte) {
    type ChatPayload struct {
        To   string `json:"to"`
        Text string `json:"text"`
    }
    var p ChatPayload
    json.Unmarshal(payload, &p)
    
    // Lógica normal: Guardar en BD, etc.
    fmt.Printf("Guardando chat de %s para %s: %s\n", sender, p.To, p.Text)
}
```

---

## 7) Buenas prácticas backend

✅ Limitar tamaño de mensajes (`SetReadLimit`)
✅ Ping/Pong para keep-alive
✅ Cierre limpio en desconexiones
✅ Validar JWT antes de aceptar conexión

---

## 8) Checklist de backend terminado

✅ Mapa de conexiones protegido con lock
✅ Hub con Register/Remove/Broadcast
✅ Hub con método SendTo para mensajes privados
✅ Handler con Upgrade + JWT
✅ Cliente con read/write pumps
✅ readPump integrado con ServiceChat
✅ Validación y parseo de JSON en readPump
✅ Guardado en DB antes de enviar mensaje
✅ Envío privado a contactos específicos

---

## 9) Tu siguiente paso real

1. Crear carpeta `backend/websocket/`
2. Implementar Hub + Client
3. Enlazar con `ServiceChat`
4. Probar con un cliente mínimo (solo backend)

---

Cuando quieras, te genero el **código completo integrado** a tu arquitectura real (routers, services, repos) y lo dejamos listo para producción.
