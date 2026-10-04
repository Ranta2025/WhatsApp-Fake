/** Max wait for the push cleanup on logout: it must never block the logout itself. */
export const PUSH_CLEANUP_TIMEOUT_MS = 3000;

/** Resolves when `task` settles or after `ms`, whichever comes first. Never rejects. */
export async function settleWithin(task: Promise<unknown>, ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
    try {
        await Promise.race([task.then(() => undefined, () => undefined), timeout]);
    } finally {
        clearTimeout(timer);
    }
}
