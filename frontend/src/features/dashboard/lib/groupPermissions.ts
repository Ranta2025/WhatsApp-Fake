import type { GroupRole } from '../../../types/api';

/**
 * Client mirror of the backend permission matrix
 * (`backend/services/groupPermissions.go`, GA1). It is a convenience for the UI
 * (hide/disable controls, banner), NOT security: the server enforces every path.
 *
 * `left` (client-only sentinel for a group the user left or was removed from)
 * and non-member/null roles deny everything, same as the server's non-member.
 */

/** Client roles: backend `GroupRole` plus the local `'left'` sentinel. */
export type GroupPermissionRole = GroupRole | 'left' | null | undefined;

/**
 * Group settings, tolerant of absent fields (older cached state / partial
 * snapshots). Absent means `false` = open, matching the backend default so
 * existing groups keep their current open behavior.
 */
export interface GroupPermissionSettings {
    OnlyAdminsCanSend?: boolean | null;
    OnlyAdminsCanEditInfo?: boolean | null;
    OnlyAdminsCanAddMembers?: boolean | null;
}

const isAdmin = (role: GroupPermissionRole): boolean => role === 'admin';

/** Active membership (admin or member); `left`/null are not members. */
const isMember = (role: GroupPermissionRole): boolean => role === 'admin' || role === 'member';

/** Send a message / edit an own message / typing: admin always, member when open. */
export const canSend = (role: GroupPermissionRole, settings: GroupPermissionSettings): boolean =>
    isAdmin(role) || (isMember(role) && !settings.OnlyAdminsCanSend);

/** Edit group info (name, description, avatar): admin always, member when open. */
export const canEditInfo = (role: GroupPermissionRole, settings: GroupPermissionSettings): boolean =>
    isAdmin(role) || (isMember(role) && !settings.OnlyAdminsCanEditInfo);

/** Add members: admin always, member when open (invitee rules unchanged). */
export const canAddMembers = (role: GroupPermissionRole, settings: GroupPermissionSettings): boolean =>
    isAdmin(role) || (isMember(role) && !settings.OnlyAdminsCanAddMembers);

/** Promote / dismiss / remove: admin only, never configurable. */
export const canManageMembers = (role: GroupPermissionRole): boolean => isAdmin(role);

/** Change group settings: admin only, never configurable. */
export const canChangeSettings = (role: GroupPermissionRole): boolean => isAdmin(role);
