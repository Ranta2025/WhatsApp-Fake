import { describe, it, expect } from 'vitest';
import { parseNotificationClickPayload, toNotificationTarget } from './notificationTarget';

describe('parseNotificationClickPayload', () => {
    it('accepts { telephon } and { groupID }', () => {
        expect(parseNotificationClickPayload({ telephon: '+34' })).toEqual({ telephon: '+34' });
        expect(parseNotificationClickPayload({ groupID: 9 })).toEqual({ groupID: 9 });
    });

    it('keeps only the target field (e.g. strips a message type)', () => {
        expect(parseNotificationClickPayload({ type: 'NOTIFICATION_CLICK', telephon: '1' })).toEqual({ telephon: '1' });
    });

    it('rejects anything else', () => {
        for (const bad of [undefined, null, 'x', 3, [], {}, { telephon: '' }, { telephon: 5 }, { groupID: 0 }, { groupID: -2 }, { groupID: 1.5 }, { groupID: '3' }]) {
            expect(parseNotificationClickPayload(bad)).toBeNull();
        }
    });
});

describe('toNotificationTarget', () => {
    it('maps the wire payload to the tagged union', () => {
        expect(toNotificationTarget({ telephon: '1' })).toEqual({ kind: 'direct', telephon: '1' });
        expect(toNotificationTarget({ groupID: 2 })).toEqual({ kind: 'group', groupID: 2 });
    });
});
