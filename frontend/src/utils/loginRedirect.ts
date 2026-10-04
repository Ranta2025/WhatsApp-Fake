// Where to go after a successful login. PrivateRoute stores the protected
// location it bounced from (`state.from`, e.g. /dashboard?chat=… from a
// notification click); only same-app paths under /dashboard are honoured so
// router state can never become an open redirect.

const DASHBOARD = '/dashboard';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isDashboardPath = (pathname: string): boolean =>
    (pathname === DASHBOARD || pathname.startsWith(`${DASHBOARD}/`))
    && !pathname.includes('//')
    && !pathname.split('/').some((segment) => segment === '..' || segment === '.');

const isSafeSearch = (search: string): boolean => search === '' || search.startsWith('?');

/** Relative path to navigate to after login: the stored dashboard location, or /dashboard. */
export function postLoginPath(state: unknown): string {
    if (!isRecord(state) || !isRecord(state.from)) return DASHBOARD;
    const { pathname, search = '' } = state.from;
    if (typeof pathname !== 'string' || typeof search !== 'string') return DASHBOARD;
    if (!isDashboardPath(pathname) || !isSafeSearch(search)) return DASHBOARD;
    return `${pathname}${search}`;
}
