// Pila (a nivel de módulo) de capas "cerrables con Escape" actualmente
// activas, ordenadas por momento de apertura. Solo la capa más reciente (el
// tope) reacciona a Escape: así, si un Popover se abre encima de un modal,
// Escape cierra primero el Popover y NO también el modal en la misma
// pulsación (ver T4: "Escape con un menú anidado abierto cierra solo el
// menú").
//
// Extraído como módulo puro (sin DOM) desde useEscapeToClose.js (ver
// R3-escape-stack-untested) para poder testear la semántica de la pila
// (topmost-only, reactivar la de abajo, capas deshabilitadas/desmontadas)
// sin necesidad de renderizar componentes ni de jsdom.

export type EscapeLayerClose = () => void;

interface EscapeLayer {
    id: number;
    onClose: EscapeLayerClose;
}

let stack: EscapeLayer[] = [];
let nextId = 0;

/** Agrega una nueva capa al tope de la pila y devuelve su id. */
export function pushEscapeLayer(onClose: EscapeLayerClose): number {
    const id = ++nextId;
    stack = [...stack, { id, onClose }];
    return id;
}

/** Quita una capa de la pila (al desmontarse o deshabilitarse). */
export function popEscapeLayer(id: number): void {
    stack = stack.filter((layer) => layer.id !== id);
}

/** true si hay al menos una capa activa. */
export function hasEscapeLayers(): boolean {
    return stack.length > 0;
}

/**
 * Invoca el `onClose` de la capa superior (si existe) y devuelve si había
 * alguna capa que manejara el Escape. No hace nada con el evento del DOM: la
 * decisión de si conviene detener su propagación (o marcarlo como
 * "manejado") es responsabilidad de quien la invoque (ver useEscapeToClose).
 */
export function triggerTopEscapeLayer(): boolean {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top.onClose?.();
    return true;
}

/** Solo para tests: vuelve la pila a su estado inicial entre casos. */
export function __resetEscapeStackForTests(): void {
    stack = [];
    nextId = 0;
}
