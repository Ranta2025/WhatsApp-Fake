import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPut = vi.fn();
const mockDelete = vi.fn();
vi.mock('./axios', () => ({
    default: {
        put: (...a: unknown[]) => mockPut(...a),
        delete: (...a: unknown[]) => mockDelete(...a),
    },
}));

import { parseMuteResponse, setChatMute, clearChatMute, setGroupMute, clearGroupMute } from './muteApi';

const UNTIL = '2026-10-04T20:00:00Z';

describe('muteApi', () => {
    beforeEach(() => { mockPut.mockReset(); mockDelete.mockReset(); });

    it('parseMuteResponse accepts the documented shapes and rejects anything else', () => {
        expect(parseMuteResponse({ muted: true, mutedUntil: UNTIL })).toEqual({ muted: true, mutedUntil: UNTIL });
        expect(parseMuteResponse({ muted: true, mutedUntil: null })).toEqual({ muted: true, mutedUntil: null });
        expect(parseMuteResponse(null)).toBeNull();
        expect(parseMuteResponse('x')).toBeNull();
        expect(parseMuteResponse({ muted: false, mutedUntil: null })).toBeNull();
        expect(parseMuteResponse({ muted: 'true', mutedUntil: null })).toBeNull();
        expect(parseMuteResponse({ muted: true })).toBeNull();
        expect(parseMuteResponse({ muted: true, mutedUntil: 5 })).toBeNull();
        expect(parseMuteResponse({ muted: true, mutedUntil: 'not a date' })).toBeNull();
    });

    it('PUT chat/:contact/mute sends the duration and returns the guarded body', async () => {
        mockPut.mockResolvedValue({ data: { muted: true, mutedUntil: UNTIL } });
        expect(await setChatMute('+34 600', '8h')).toEqual({ muted: true, mutedUntil: UNTIL });
        expect(mockPut).toHaveBeenCalledWith('/api/v1/chat/%2B34%20600/mute', { duration: '8h' });
        mockPut.mockResolvedValue({ data: { nope: 1 } });
        expect(await setChatMute('B', 'always')).toBeNull();
    });

    it('PUT group/:id/mute sends the duration', async () => {
        mockPut.mockResolvedValue({ data: { muted: true, mutedUntil: null } });
        expect(await setGroupMute(9, 'always')).toEqual({ muted: true, mutedUntil: null });
        expect(mockPut).toHaveBeenCalledWith('/api/v1/group/9/mute', { duration: 'always' });
    });

    it('DELETE clears direct and group mutes; errors propagate', async () => {
        mockDelete.mockResolvedValue({ status: 204 });
        await clearChatMute('B');
        await clearGroupMute(9);
        expect(mockDelete).toHaveBeenNthCalledWith(1, '/api/v1/chat/B/mute');
        expect(mockDelete).toHaveBeenNthCalledWith(2, '/api/v1/group/9/mute');
        mockDelete.mockRejectedValue(new Error('500'));
        await expect(clearChatMute('B')).rejects.toThrow('500');
    });
});
