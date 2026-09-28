// Lógica pura del visor de Estados: cálculo de progreso de video y la
// decisión de reanudar (o no) el reloj tras un intento de borrado. Extraído
// de StatusViewer.jsx para poder testearlo sin DOM (ver R3-video-wallclock /
// R3-delete-timer-race).

/**
 * Progreso (0-100) de un video a partir de su tiempo actual y duración real
 * (currentTime/duration del elemento <video>), en vez de un reloj de pared
 * (performance.now()) que se desincroniza si el video hace buffering/stalls
 * o si el usuario lo pausa sin que el componente se entere.
 */
export const computeVideoProgressPercent = (currentTime, duration) => {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    if (!Number.isFinite(currentTime) || currentTime < 0) return 0;
    return Math.min(100, (currentTime / duration) * 100);
};

/**
 * Decide si hay que reanudar el reloj de avance automático después de un
 * intento de borrar el estado actual (ver R3-delete-timer-race):
 *   - Si el usuario canceló el diálogo de confirmación: reanudar (seguimos
 *     viendo el mismo estado, no debe quedar pausado para siempre).
 *   - Si el borrado falló (error de red/servidor): también reanudar, por la
 *     misma razón (el estado sigue existiendo, se sigue viendo).
 *   - Si se confirmó y el borrado tuvo éxito: NO reanudar. El estado ya no
 *     existe; el efecto que reajusta el índice / cierra el visor se encarga
 *     del resto, y un reloj que arranca de nuevo en ese instante es
 *     exactamente el "stale tick" que causa el salto/cierre indebido.
 */
export const shouldResumeClockAfterDeleteAttempt = ({ confirmed, deleteSucceeded }) => {
    if (!confirmed) return true;
    if (!deleteSucceeded) return true;
    return false;
};
