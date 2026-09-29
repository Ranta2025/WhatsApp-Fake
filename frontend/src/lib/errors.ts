// Structural readers for `unknown` thrown values.
//
// Typing used to narrow these with `instanceof DOMException` /
// `axios.isAxiosError`, which silently changed runtime behavior: a rejection
// that is not a real instance of those classes (test doubles, polyfills,
// wrapped/rethrown errors) lost its `.name` / `.response.data.error` and fell
// through to the generic fallback. The pre-TypeScript code read `err.name` and
// `err?.response?.data?.(error|message)` structurally, so these helpers do the
// same on any object, without `any` and without narrowing to a class.

/** Reads a string-valued own property from any object, or `undefined`. */
function readStringField(value: unknown, key: string): string | undefined {
    if (typeof value !== 'object' || value === null) return undefined;
    const field = (value as Record<string, unknown>)[key];
    return typeof field === 'string' ? field : undefined;
}

/**
 * Structural `error.name` (e.g. DOMException names from getUserMedia:
 * `NotAllowedError`, `NotFoundError`, `NotReadableError`, ...).
 */
export function getErrorName(error: unknown): string | undefined {
    return readStringField(error, 'name');
}

/**
 * Best-effort human-readable message from an `unknown` thrown value, mirroring
 * the project's pre-TypeScript `err?.response?.data?.error || err?.message ||
 * fallback` chains (plus the `response.data` string/`message` variants already
 * used by the dashboard modals). Never throws, never returns an empty value.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
        const response = (error as { response?: unknown }).response;
        const data = response && typeof response === 'object'
            ? (response as { data?: unknown }).data
            : undefined;

        if (typeof data === 'string' && data) return data;
        const dataError = readStringField(data, 'error');
        if (dataError) return dataError;
        const dataMessage = readStringField(data, 'message');
        if (dataMessage) return dataMessage;

        const message = readStringField(error, 'message');
        if (message) return message;
    }
    return fallback;
}
