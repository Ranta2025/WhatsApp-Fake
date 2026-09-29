// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import ActivateAccount from './ActivateAccount';
import ActivateExisting from './ActivateExisting';
import RecoverPassword from './RecoverPassword';
import UnblockAccount from './UnblockAccount';

// R3-page-error-extraction-unproved: pins how each page turns a rejected
// request into user-visible text. The original JS read
// `err?.response?.data` structurally:
//   Login/Register: string body | data.error | data.message | err.message | generic
//   the other pages: string body | data.message | data.error | generic
//   (never err.message).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockPost = vi.fn();
const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockRefreshUser = vi.fn();

vi.mock('../api/axios', () => ({
    default: { post: (...args: unknown[]) => mockPost(...args) },
}));
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ login: mockLogin, refreshUser: mockRefreshUser }),
}));
vi.mock('react-router-dom', async (importActual) => ({
    ...(await importActual<typeof import('react-router-dom')>()),
    useNavigate: () => mockNavigate,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

async function render(ui: ReactElement, state?: Record<string, unknown>) {
    await act(async () => {
        root.render(<MemoryRouter initialEntries={[{ pathname: '/', state }]}>{ui}</MemoryRouter>);
    });
}

async function type(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`no input for ${selector}`);
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

async function clickButton(label: string) {
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
    if (!button) throw new Error(`no button "${label}"`);
    await act(async () => { button.click(); });
}

const text = () => container.textContent ?? '';
const reject = (response?: unknown, message = 'Request failed') =>
    mockPost.mockRejectedValue(Object.assign(new Error(message), response === undefined ? {} : { response }));

describe('Login error extraction (error-first, err.message fallback)', () => {
    async function submit() {
        await render(<Login />);
        await type('#username', 'ana');
        await type('#password', 'secret');
        await clickButton('Entrar');
    }

    it('prefers data.error over data.message', async () => {
        mockLogin.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { error: 'Clave incorrecta', message: 'otro' } } }));
        await submit();
        expect(text()).toContain('Clave incorrecta');
        expect(text()).not.toContain('otro');
    });

    it('falls back to err.message when the body has no text (network error)', async () => {
        mockLogin.mockRejectedValue(new Error('Network Error'));
        await submit();
        expect(text()).toContain('Network Error');
    });

    it('shows the generic copy when nothing usable exists', async () => {
        mockLogin.mockRejectedValue({});
        await submit();
        expect(text()).toContain('Credenciales inválidas o error de conexión');
    });

    it('redirects a blocked account to /unblock-account without showing the message', async () => {
        mockLogin.mockRejectedValue({ response: { data: { error: 'Usuario bloqueado por intentos' } } });
        await submit();
        expect(mockNavigate).toHaveBeenCalledWith('/unblock-account', { state: { username: 'ana' } });
        expect(text()).not.toContain('Usuario bloqueado por intentos');
    });

    it('redirects an inactive account to /activate-existing', async () => {
        mockLogin.mockRejectedValue({ response: { data: 'Usuario inactivo' } });
        await submit();
        expect(mockNavigate).toHaveBeenCalledWith('/activate-existing', { state: { username: 'ana' } });
    });
});

describe('Register error extraction (error-first, err.message fallback)', () => {
    async function submit() {
        await render(<Register />);
        await type('input[name="username"]', 'anita');
        await type('input[name="email"]', 'a@b.co');
        await type('input[placeholder="Número de teléfono"]', '51234567');
        await type('input[name="password"]', 'Secret123');
        await type('input[name="confirm"]', 'Secret123');
        await clickButton('Registrarse');
    }

    it('prefers data.error over data.message', async () => {
        reject({ data: { error: 'Usuario ya existe', message: 'otro' } });
        await submit();
        expect(mockPost).toHaveBeenCalled();
        expect(text()).toContain('Usuario ya existe');
        expect(text()).not.toContain('otro');
    });

    it('falls back to err.message, then to the generic copy', async () => {
        mockPost.mockRejectedValue(new Error('Network Error'));
        await submit();
        expect(text()).toContain('Network Error');

        mockPost.mockRejectedValue({});
        await clickButton('Registrarse');
        expect(text()).toContain('Error al registrar usuario. Verifica los requisitos.');
    });
});

describe('message-first pages (never surface err.message)', () => {
    const both = { data: { error: 'E-text', message: 'M-text' } };

    // Each case rejects with (a) both fields, (b) a bare Error, and checks the
    // message-first choice and the generic fallback without err.message.
    async function expectMessageFirst(trigger: () => Promise<void>, generic: string) {
        reject(both, 'Network Error');
        await trigger();
        expect(text()).toContain('M-text');
        expect(text()).not.toContain('E-text');

        mockPost.mockRejectedValue(new Error('Network Error'));
        await trigger();
        expect(text()).toContain(generic);
        expect(text()).not.toContain('Network Error');
    }

    it('ActivateAccount: submit shows message-first text and alerts it', async () => {
        await render(<ActivateAccount />, { username: 'ana' });
        await type('input[placeholder="000000"]', '123456');
        await expectMessageFirst(() => clickButton('Activar cuenta'), 'Error al activar cuenta. Verifica el código.');
        expect(alert).toHaveBeenCalledWith('Error: Error al activar cuenta. Verifica el código.');
    });

    it('ActivateAccount: resend uses message-first text', async () => {
        await render(<ActivateAccount />, { username: 'ana' });
        await expectMessageFirst(() => clickButton('No recibí el código'), 'Error al reenviar el código.');
    });

    it('ActivateAccount: a "bloqueado" resend error locks the screen', async () => {
        await render(<ActivateAccount />, { username: 'ana' });
        reject({ data: { message: 'Usuario bloqueado' } });
        await clickButton('No recibí el código');
        expect(text()).toContain('Cuenta Bloqueada');
        expect(text()).toContain('Tu cuenta ha sido bloqueada. Por favor contacta con soporte');
    });

    it('ActivateExisting uses message-first text', async () => {
        await render(<ActivateExisting />, { username: 'ana' });
        await expectMessageFirst(() => clickButton('Enviar código'), 'Username no encontrado o cuenta ya activa');
    });

    it('RecoverPassword step 1 (request code) uses message-first text', async () => {
        await render(<RecoverPassword />);
        await type('input[placeholder="tu@email.com"]', 'a@b.co');
        await expectMessageFirst(() => clickButton('Enviar código'), 'Email no encontrado');
    });

    it('RecoverPassword step 3 (reset) uses message-first text', async () => {
        await render(<RecoverPassword />);
        await type('input[placeholder="tu@email.com"]', 'a@b.co');
        mockPost.mockResolvedValue({ data: {} });
        await clickButton('Enviar código');
        await type('input[placeholder="000000"]', '123456');
        await clickButton('Verificar código');
        await type('input[placeholder="Mínimo 8 caracteres"]', 'Secret123!');
        await type('input[placeholder="Confirma tu contraseña"]', 'Secret123!');
        await expectMessageFirst(() => clickButton('Cambiar contraseña'), 'Error al cambiar la contraseña');
    });

    it('UnblockAccount step 1 (request code) uses message-first text', async () => {
        await render(<UnblockAccount />, { gmail: 'a@b.co' });
        await expectMessageFirst(() => clickButton('Enviar código'), 'Email no encontrado o error al enviar código');
    });

    it('UnblockAccount step 3 (unlock + reset) uses message-first text', async () => {
        await render(<UnblockAccount />, { gmail: 'a@b.co' });
        mockPost.mockResolvedValue({ data: {} });
        await clickButton('Enviar código');
        await type('input[placeholder="000000"]', '123456');
        await clickButton('Verificar código');
        await type('input[placeholder="Mínimo 8 caracteres"]', 'Secret123!');
        await type('input[placeholder="Confirma tu contraseña"]', 'Secret123!');
        await expectMessageFirst(() => clickButton('Desbloquear cuenta'), 'Error al desbloquear cuenta');
    });
});
