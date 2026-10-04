// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import type { AxiosAdapter, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// R3-axios-interceptor-guards-untested: el interceptor de respuesta de
// api/axios.ts renueva la sesión sola en un 401 (vía /auth/refresh) y
// reintenta la petición original, encolando cualquier 401 concurrente
// detrás de un único refresh (evita bucles y refrescos duplicados). Estos
// tests conducen ese flujo real reemplazando el adapter de axios (la capa
// que de verdad hace la petición HTTP) en vez de asumir el comportamiento
// por lectura del código.

function makeResponse(config: InternalAxiosRequestConfig, status: number, data: unknown = {}): AxiosResponse {
    return {
        data,
        status,
        statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
        headers: {},
        config,
    };
}

// El adapter real de axios (xhr/http) rechaza con un AxiosError cuando el
// status no pasa `validateStatus` (ver lib/core/settle.js); nuestro adapter
// falso tiene que reproducir eso a mano para que `axios.isAxiosError` y
// `error.response.status` se comporten igual que en producción.
function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}): Promise<AxiosResponse> {
    const response = makeResponse(config, status, data);
    if (status >= 200 && status < 300) {
        return Promise.resolve(response);
    }
    return Promise.reject(new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response
    ));
}

describe('api axios interceptor: 401 auto-refresh', () => {
    let axios: typeof import('axios').default;
    let api: typeof import('./axios').default;
    let SESSION_EXPIRED_EVENT: string;
    let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>;

    beforeEach(async () => {
        vi.resetModules();
        const axiosModule = await import('axios');
        axios = axiosModule.default;
        adapter = vi.fn<AxiosAdapter>();
        axios.defaults.adapter = adapter;

        const mod = await import('./axios');
        api = mod.default;
        SESSION_EXPIRED_EVENT = mod.SESSION_EXPIRED_EVENT;
        api.defaults.adapter = adapter;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('refreshes the session on a 401 then retries the original request', async () => {
        let refreshCalls = 0;
        let protectedCalls = 0;
        adapter.mockImplementation((config) => {
            const url = config.url ?? '';
            if (url.includes('/auth/refresh')) {
                refreshCalls++;
                return respond(config, 200, {});
            }
            protectedCalls++;
            if (protectedCalls === 1) {
                return respond(config, 401, { message: 'unauthorized' });
            }
            return respond(config, 200, { ok: true });
        });

        const response = await api.get('/api/v1/protected');

        expect(response.data).toEqual({ ok: true });
        expect(refreshCalls).toBe(1);
        expect(protectedCalls).toBe(2);
    });

    it('queues concurrent 401s behind a single refresh call', async () => {
        let refreshCalls = 0;
        let resolveRefresh: () => void = () => {};
        const refreshGate = new Promise<void>((resolve) => {
            resolveRefresh = () => resolve();
        });
        const callCounts: Record<string, number> = {};

        adapter.mockImplementation((config) => {
            const url = config.url ?? '';
            if (url.includes('/auth/refresh')) {
                refreshCalls++;
                return refreshGate.then(() => respond(config, 200, {}));
            }
            callCounts[url] = (callCounts[url] ?? 0) + 1;
            if (callCounts[url] === 1) {
                return respond(config, 401, {});
            }
            return respond(config, 200, { url });
        });

        const p1 = api.get('/api/v1/a');
        const p2 = api.get('/api/v1/b');

        // Dejar que ambas peticiones lleguen a su rama 401 y se encolen
        // antes de destrabar el refresh (si no, la segunda podría disparar
        // su propio refresh en vez de encolarse detrás del primero).
        await new Promise((resolve) => setTimeout(resolve, 0));
        resolveRefresh();

        const [r1, r2] = await Promise.all([p1, p2]);

        expect(r1.data).toEqual({ url: '/api/v1/a' });
        expect(r2.data).toEqual({ url: '/api/v1/b' });
        expect(refreshCalls).toBe(1);
    });

    it('the _retry guard prevents an infinite refresh loop when the retry also gets a 401', async () => {
        let refreshCalls = 0;
        adapter.mockImplementation((config) => {
            const url = config.url ?? '';
            if (url.includes('/auth/refresh')) {
                refreshCalls++;
                return respond(config, 200, {});
            }
            // Sigue devolviendo 401 incluso en el reintento.
            return respond(config, 401, {});
        });

        await expect(api.get('/api/v1/protected')).rejects.toMatchObject({
            response: { status: 401 },
        });

        expect(refreshCalls).toBe(1);
    });

    it('rejects a non-Axios error as-is, without touching the refresh flow', async () => {
        const boom = new Error('boom - not an axios error');
        let refreshCalls = 0;
        adapter.mockImplementation((config) => {
            if ((config.url ?? '').includes('/auth/refresh')) {
                refreshCalls++;
                return respond(config, 200, {});
            }
            return Promise.reject(boom);
        });

        await expect(api.get('/api/v1/protected')).rejects.toBe(boom);
        expect(refreshCalls).toBe(0);
    });

    it('pins today\'s refresh-failure behavior: rejects with the refresh error and dispatches session-expired', async () => {
        const refreshError = new Error('refresh failed');
        let sessionExpiredEvents = 0;
        const onSessionExpired = () => { sessionExpiredEvents++; };
        window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

        adapter.mockImplementation((config) => {
            const url = config.url ?? '';
            if (url.includes('/auth/refresh')) {
                return Promise.reject(refreshError);
            }
            return respond(config, 401, {});
        });

        try {
            await expect(api.get('/api/v1/protected')).rejects.toBe(refreshError);
            expect(sessionExpiredEvents).toBe(1);
        } finally {
            window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
        }
    });
});
