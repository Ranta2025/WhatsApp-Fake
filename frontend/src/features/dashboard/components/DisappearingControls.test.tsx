// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    ChatDisappearingSection, GroupDisappearingSection, DisappearingChip, ExpiryClock,
} from './DisappearingControls';
import { useDashboard, type DashboardContextValue, type SelectedGroup } from '../context/DashboardContext';

// disappearing-messages (DE6): selector (1:1 + group, permission gated), header chip, bubble clock.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
const mockUseDashboard = vi.mocked(useDashboard);

const group = (over: Partial<SelectedGroup> = {}): SelectedGroup => ({
    id: 5, name: 'Equipo', creatorTelephon: '111', memberCount: 3, userRole: 'admin', createdAt: '2026-01-01T00:00:00Z',
    onlyAdminsCanSend: false, onlyAdminsCanEditInfo: false, onlyAdminsCanAddMembers: false,
    ...over,
});

describe('DisappearingControls', () => {
    let container: HTMLDivElement;
    let root: Root;
    const setChatDisappearing = vi.fn();
    const setGroupDisappearing = vi.fn();

    const dash = (over: Record<string, unknown>) => {
        mockUseDashboard.mockReturnValue({
            selected: { telephon: '222', contactName: 'Luis', username: 'luis' },
            selectedGroup: null,
            selectedDisappearSeconds: 0,
            setChatDisappearing, setGroupDisappearing,
            ...over,
        } as unknown as DashboardContextValue);
    };
    const mount = (node: React.ReactElement) => { act(() => { root.render(node); }); };
    const select = () => container.querySelector<HTMLSelectElement>('select[aria-label="Mensajes temporales"]');
    const choose = async (value: string) => {
        await act(async () => {
            const el = select()!;
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, value);
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setChatDisappearing.mockResolvedValue(true);
        setGroupDisappearing.mockResolvedValue(true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('clears the pending state when the setter rejects', async () => {
        setChatDisappearing.mockRejectedValue(new Error('network'));
        dash({});
        mount(<ChatDisappearingSection />);
        await choose('86400');
        expect(select()!.disabled).toBe(false);
        expect(container.querySelector('[data-testid="disappearing-pending"]')).toBeNull();
    });

    it('does not carry a pending save over to another chat', async () => {
        setChatDisappearing.mockReturnValue(new Promise<boolean>(() => {}));
        dash({});
        mount(<ChatDisappearingSection />);
        await choose('86400');
        expect(select()!.disabled).toBe(true);
        dash({ selected: { telephon: '333', contactName: 'Ana', username: 'ana' } });
        mount(<ChatDisappearingSection />);
        expect(select()!.disabled).toBe(false);
    });

    describe('ChatDisappearingSection (1:1)', () => {
        it('lists the 4 options, reflects the current value and shows the note', () => {
            dash({ selectedDisappearSeconds: 604800 });
            mount(<ChatDisappearingSection />);
            expect(Array.from(select()!.options).map(o => o.textContent)).toEqual(['Desactivados', '24 horas', '7 días', '90 días']);
            expect(select()!.value).toBe('604800');
            expect(container.textContent).toContain('Los mensajes nuevos desaparecerán del chat después del tiempo elegido.');
            expect(container.textContent).toContain('Las copias fuera del chat (capturas, reenvíos, notificaciones) no se eliminan.');
        });

        it('calls the setter with the contact and the chosen seconds', async () => {
            dash({});
            mount(<ChatDisappearingSection />);
            await choose('86400');
            expect(setChatDisappearing).toHaveBeenCalledWith('222', 86400);
            await choose('7776000');
            expect(setChatDisappearing).toHaveBeenLastCalledWith('222', 7776000);
        });

        it('is disabled while saving and keeps the previous value when the save fails', async () => {
            let resolve!: (ok: boolean) => void;
            setChatDisappearing.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
            dash({ selectedDisappearSeconds: 0 });
            mount(<ChatDisappearingSection />);
            await choose('86400');
            expect(select()!.disabled).toBe(true);
            expect(container.querySelector('[data-testid="disappearing-pending"]')).not.toBeNull();
            await act(async () => { resolve(false); });
            expect(select()!.disabled).toBe(false);
            expect(select()!.value).toBe('0');
            expect(container.querySelector('[data-testid="disappearing-pending"]')).toBeNull();
        });

        it('renders nothing without a selected chat', () => {
            dash({ selected: null });
            mount(<ChatDisappearingSection />);
            expect(container.innerHTML).toBe('');
        });
    });

    describe('GroupDisappearingSection', () => {
        it('admin can change it when only admins may edit info', async () => {
            dash({ selectedGroup: group({ userRole: 'admin', onlyAdminsCanEditInfo: true }), selectedDisappearSeconds: 86400 });
            mount(<GroupDisappearingSection />);
            expect(select()!.value).toBe('86400');
            await choose('604800');
            expect(setGroupDisappearing).toHaveBeenCalledWith(5, 604800);
        });

        it('member can change it while "Editar info" is open', async () => {
            dash({ selectedGroup: group({ userRole: 'member', onlyAdminsCanEditInfo: false }) });
            mount(<GroupDisappearingSection />);
            expect(select()!.disabled).toBe(false);
            await choose('86400');
            expect(setGroupDisappearing).toHaveBeenCalledWith(5, 86400);
        });

        it('member is read-only when only admins can edit info', () => {
            dash({ selectedGroup: group({ userRole: 'member', onlyAdminsCanEditInfo: true }), selectedDisappearSeconds: 604800 });
            mount(<GroupDisappearingSection />);
            expect(select()).toBeNull();
            expect(container.querySelector('[data-testid="disappearing-readonly"]')?.textContent).toBe('7 días');
            expect(container.textContent).toContain('Solo los administradores pueden cambiar esta opción');
        });

        it('a user who left the group is read-only even when open', () => {
            dash({ selectedGroup: group({ userRole: 'left', onlyAdminsCanEditInfo: false }) });
            mount(<GroupDisappearingSection />);
            expect(select()).toBeNull();
            expect(container.querySelector('[data-testid="disappearing-readonly"]')?.textContent).toBe('Desactivados');
        });
    });

    describe('DisappearingChip', () => {
        it('renders nothing when the timer is off', () => {
            mount(<DisappearingChip seconds={0} />);
            expect(container.innerHTML).toBe('');
        });

        it.each([
            [86400, '24 h', '24 horas'],
            [604800, '7 d', '7 días'],
            [7776000, '90 d', '90 días'],
        ])('%i s shows the short label and the long accessible label', (seconds, short, long) => {
            mount(<DisappearingChip seconds={seconds} />);
            const chip = container.querySelector('[data-testid="disappearing-chip"]')!;
            expect(chip.textContent).toBe(`Mensajes temporales: ${short}`);
            expect(chip.getAttribute('aria-label')).toBe(`Mensajes temporales activados: ${long}`);
        });
    });

    describe('ExpiryClock', () => {
        it('shows a labelled clock for a valid expiresAt', () => {
            mount(<ExpiryClock expiresAt="2026-01-02T10:00:00Z" />);
            const clock = container.querySelector('[data-testid="expiry-clock"]')!;
            expect(clock.getAttribute('aria-label')).toBe('Mensaje temporal');
            expect(clock.querySelector('title')?.textContent).toBe('Mensaje temporal');
        });

        it.each([undefined, '', 'garbage'])('renders nothing for %j', (value) => {
            mount(<ExpiryClock expiresAt={value} />);
            expect(container.innerHTML).toBe('');
        });
    });
});
