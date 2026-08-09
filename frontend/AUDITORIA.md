# Auditoria Frontend — todos

## Resumen Ejecutivo
El frontend es funcional pero presenta problemas de arquitectura, mantenibilidad y diseño que afectan la escalabilidad y la experiencia de desarrollo.

---

## 1. Errores Criticos (Bugs)

| # | Archivo | Problema | Impacto |
|---|---------|----------|---------|
| 1 | `Welcome.jsx` | `BugReportModal` esta mal anidado dentro del `<footer>` pero fuera de su cierre logico. | Posible problema de DOM/semantica. |
| 2 | `GroupChatWindow.jsx:279` | `stopRecording` hace `mediaRecorderRef.current.onstop = mediaRecorderRef.current.onstop;` (no-op). No garantiza que se ejecute el handler de upload. | Puede causar que la nota de voz no se envie. |
| 3 | `DashboardContext.jsx` | Si alguno de los 5 fetch iniciales falla, `dataReady` nunca es `true` y el loading screen se queda para siempre. | Bloqueo total de la app en caso de error de red parcial. |
| 4 | `MessageList.jsx:312` | El menu contextual usa `group-hover/bubble:opacity-100` pero en dispositivos touch no hay hover. | Usuarios moviles no pueden acceder al menu de mensajes. |
| 5 | `Register.jsx:73` | Prop `footer` recibe una funcion, `Login.jsx` recibe un nodo. `AuthLayout` maneja ambos pero es inconsistente. | Confusion y posible error de tipado si se migra a TS. |

---

## 2. Problemas de Arquitectura

### 2.1 Componentes God-Class
- `GroupChatWindow.jsx`: **1,592 lineas**. Contiene: lista de mensajes, burbujas, input, modales (add members, confirmaciones, lightbox), panel lateral de info, logica de admin, wallpaper, descripcion, etc.
- `DashboardContext.jsx`: **934 lineas**. Maneja perfil, contactos, mensajes 1:1, grupos, estados, llamadas, WS handlers, notificaciones, loading, toasts. Es un "store" monolitico.
- `Sidebar.jsx`: **531 lineas**. Renderiza 5 vistas distintas (chats, calls, statuses, contacts, groups) con logica de filtrado inline.

### 2.2 Duplicacion de Codigo
- Logica de grabacion de audio: `MessageInput.jsx` y `GroupChatWindow.jsx` (copia casi identica).
- Renderizado de media (imagen/video/audio/documento): `MessageList.jsx` y `GroupMessageBubble`.
- Scroll-to-bottom con `useRef` + `shouldStickToBottomRef`: duplicado en `MessageList` y `GroupMessageList`.
- Manejo de wallpapers: logica separada para chats 1:1 y grupos.

### 2.3 Manejo de Modales
- Los modales estan inline dentro de los componentes. No hay un sistema centralizado.
- Cada modal redefine su propio overlay, animaciones, y estilos.
- `DashboardFeature.jsx` monta ~8 modales/overlayes condicionalmente.

### 2.4 Contextos y Estado
- `DashboardContext` provee ~60 valores. Cualquier cambio en cualquier estado causa re-render de todo el dashboard.
- `useMessaging` crea su propio `MessagingContext` pero solo se usa dentro de `ChatWindow`. Es una abstraccion innecesaria.
- `useWebSocket` usa un contador global `wsRefCount` con riesgo de race conditions en StrictMode.

### 2.5 Tailwind CSS v4
- Existe `tailwind.config.js` pero Tailwind v4 usa configuracion CSS-first (`@import "tailwindcss"`). El archivo JS esta vacio y no se usa.
- Muchos estilos inline complejos se repiten (gradientes, sombras, glassmorphism).

---

## 3. Problemas de Diseno / UX

| Problema | Ubicacion | Detalle |
|----------|-----------|---------|
| Inconsistencia de bordes | Global | `rounded-2xl`, `rounded-[1.8rem]`, `rounded-[2rem]`, `rounded-[2.5rem]`, `rounded-[26px]` mezclados. |
| Inconsistencia de sombras | Global | Algunas sombras usan `shadow-lg`, otras custom `shadow-[0_32px_120px...]`. |
| Paleta de grises | Global | Mezcla de `slate-`, `gray-`, y `white/` opacidades. |
| Estados vacios pobres | Sidebar, ChatWindow | "No se encontraron chats" es solo texto gris sin icono ni accion. |
| Tipografia | Global | Muchos tamanos hardcodeados (`text-[14px]`, `text-[10px]`) en lugar de usar la escala de Tailwind. |
| Accesibilidad | Global | Faltan `aria-live` para notificaciones, algunos iconos sin `aria-label`, contrastes insuficientes en textos `slate-400` sobre `slate-800`. |

---

## 4. Recomendaciones Aplicadas

1. **Extraer componentes reutilizables**: `Modal`, `Avatar`, `MediaRenderer`, `AudioRecorder`, `ConfirmDialog`, `EmptyState`.
2. **Refactorizar GroupChatWindow**: separar en `GroupHeader`, `GroupInfoPanel`, `GroupMessageList`, `GroupMessageInput`, `GroupModals`.
3. **Refactorizar Sidebar**: extraer cada vista a su propio componente (`ChatList`, `ContactList`, `GroupList`, `StatusList`, `CallList`).
4. **Unificar modales**: crear un `Modal` base con portal y animaciones consistentes.
5. **Crear hooks compartidos**: `useAudioRecorder`, `useScrollToBottom`, `useWallpaper`.
6. **Modernizar CSS**: usar `@theme` de Tailwind v4 para definir colores, radios y sombras custom.
7. **Agregar Error Boundary**: para evitar crashes totales.
8. **Mejorar empty states**: con iconos, ilustraciones y CTAs.
