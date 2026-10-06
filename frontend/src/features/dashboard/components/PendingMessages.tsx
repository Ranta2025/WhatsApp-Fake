import type { JSX } from 'react';
import MessageTicks from './MessageTicks';
import { formatTime } from '../../../utils/format';
import type { OutboxItem } from '../../outbox/outboxTypes';

/**
 * Own text messages still in the offline outbox (PW9), rendered after the loaded
 * list: a clock while pending, a minimal "No enviado" mark once failed (no retry
 * UI in v1). They have no server MessageID, so no menu/reactions/reply.
 *
 * Test hooks (Playwright PW10): each row has `data-outbox-client-id` and
 * `data-outbox-state` ("pending" | "failed"); the clock is
 * `[data-testid="message-pending"]` and the failed mark `[data-testid="message-failed"]`.
 */

const FailedMark = (): JSX.Element => (
    <span data-testid="message-failed" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-failed-on-accent">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v6M12 16.5v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        No enviado
    </span>
);

export default function PendingMessages({ items }: { items: readonly OutboxItem[] }): JSX.Element | null {
    if (items.length === 0) return null;
    return (
        <div className="space-y-1.5 relative z-[1]">
            {items.map(({ state, entry }) => (
                <div
                    key={entry.clientID}
                    data-outbox-client-id={entry.clientID}
                    data-outbox-state={state}
                    className="flex justify-end px-2 py-0.5"
                >
                    <div className={`max-w-[75%] min-w-[80px] px-3.5 py-2 rounded-2xl rounded-br-md shadow-md text-on-accent
                        ${state === 'failed' ? 'bg-indigo-900/80 ring-1 ring-rose-400/40' : 'bg-indigo-700'}`}
                    >
                        {entry.replyTo && (
                            <div className="mb-1.5 px-2.5 py-1.5 rounded-lg border-l-[3px] bg-black/15 border-on-accent/40 text-[12px] text-on-accent/80 line-clamp-2">
                                <div className="font-semibold text-[11px] mb-0.5 text-on-accent/90">Respuesta</div>
                                {entry.replyTo.Message}
                            </div>
                        )}
                        <div className="text-[14.5px] leading-snug break-words whitespace-pre-wrap">{entry.text}</div>
                        <div className="mt-0.5 -mb-0.5 flex items-center justify-end gap-1">
                            <span className="text-[11px] text-on-accent/60">{formatTime(entry.createdAt)}</span>
                            {state === 'pending' ? <MessageTicks status="pending" /> : <FailedMark />}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
