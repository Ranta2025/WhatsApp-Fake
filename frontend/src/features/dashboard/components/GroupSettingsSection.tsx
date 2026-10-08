import { useDashboard } from '../context/DashboardContext';
import { updateGroupSettings } from '../../../api/groupApi';
import { getResponseError } from '../../../lib/errors';
import { canChangeSettings } from '../lib/groupPermissions';
import type { GroupSettingsRequest } from '../../../types/api';

/**
 * Presentational "todos / solo admins" control. Without `onChange` it renders
 * the current value read-only (the only form a non-admin ever sees).
 */
export interface GroupPermissionToggleProps {
    label: string;
    value: boolean;
    onChange?: (next: boolean) => void;
    testId?: string;
}

export const GroupPermissionToggle = ({ label, value, onChange, testId }: GroupPermissionToggleProps) => {
    const readOnly = !onChange;
    return (
        <div className="flex items-center justify-between gap-3 py-2.5" data-testid={testId}>
            <span className="text-sm text-slate-300">{label}</span>
            {readOnly ? (
                <span className="text-xs font-medium text-slate-400" data-testid={testId ? `${testId}-value` : undefined}>
                    {value ? 'Solo admins' : 'Todos'}
                </span>
            ) : (
                <div className="flex rounded-lg overflow-hidden border border-fg/10 flex-shrink-0" role="group" aria-label={label}>
                    <button
                        type="button"
                        aria-pressed={!value}
                        onClick={() => onChange(false)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${!value ? 'bg-indigo-600 text-on-accent' : 'text-slate-400 hover:bg-fg/10'}`}
                    >
                        Todos
                    </button>
                    <button
                        type="button"
                        aria-pressed={value}
                        onClick={() => onChange(true)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${value ? 'bg-indigo-600 text-on-accent' : 'text-slate-400 hover:bg-fg/10'}`}
                    >
                        Solo admins
                    </button>
                </div>
            )}
        </div>
    );
};

type SettingKey = 'onlyAdminsCanSend' | 'onlyAdminsCanEditInfo' | 'onlyAdminsCanAddMembers';

interface SettingRow {
    key: SettingKey;
    label: string;
    testId: string;
    patch: (next: boolean) => GroupSettingsRequest;
}

const ROWS: readonly SettingRow[] = [
    { key: 'onlyAdminsCanSend', label: 'Enviar mensajes', testId: 'group-setting-send', patch: next => ({ onlyAdminsCanSend: next }) },
    { key: 'onlyAdminsCanEditInfo', label: 'Editar info del grupo', testId: 'group-setting-edit', patch: next => ({ onlyAdminsCanEditInfo: next }) },
    { key: 'onlyAdminsCanAddMembers', label: 'Agregar otros participantes', testId: 'group-setting-add', patch: next => ({ onlyAdminsCanAddMembers: next }) },
];

/**
 * "Configuración del grupo" section of the info panel (GA7). Admins toggle the
 * three permission settings; non-admins see the current values read-only. The
 * backend enforces every path — this is convenience only (lib/groupPermissions).
 */
const GroupSettingsSection = () => {
    const { selectedGroup, setSelectedGroup, setGroups, addToast } = useDashboard();
    if (!selectedGroup) return null;

    const canEdit = canChangeSettings(selectedGroup.userRole);

    const update = async (row: SettingRow, next: boolean) => {
        const groupID = selectedGroup.id;
        try {
            await updateGroupSettings(groupID, row.patch(next));
            setSelectedGroup(prev => (prev?.id === groupID ? { ...prev, [row.key]: next } : prev));
            setGroups(prev => prev.map(g => (g.id === groupID ? { ...g, [row.key]: next } : g)));
            addToast({ type: 'success', message: 'Configuración actualizada' });
        } catch (err) {
            addToast({ type: 'error', message: getResponseError(err) || 'No se pudo actualizar la configuración' });
        }
    };

    return (
        <div className="px-5 py-4" aria-label="Configuración del grupo">
            <div className="text-xs text-indigo-300/70 mb-1 uppercase tracking-wider font-semibold">Configuración del grupo</div>
            <div className="divide-y divide-fg/5">
                {ROWS.map(row => (
                    <GroupPermissionToggle
                        key={row.key}
                        label={row.label}
                        testId={row.testId}
                        value={selectedGroup[row.key]}
                        onChange={canEdit ? next => { void update(row, next); } : undefined}
                    />
                ))}
            </div>
        </div>
    );
};

export default GroupSettingsSection;
