import {
    useState, useCallback, useContext, createContext, createElement,
    type ReactNode, type ChangeEvent, type Dispatch, type SetStateAction,
} from 'react';
import { useDashboard } from '../context/DashboardContext';
import type { GroupMessageResponse, MediaType } from '../../../types/api';

/** Return shape of `useGroupMessaging()` — members verified against real
 * consumers (`GroupChatWindow.jsx`'s `GroupMessageInput`/`GroupMessageList`, via `rg`). */
export interface UseGroupMessagingResult {
    // Actions
    handleSend: (text: string, mediaType?: MediaType | null) => void;
    handleEditMessage: (message: GroupMessageResponse) => void;
    handleEditMessageChange: (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
    handleEditMessageSave: () => void;
    handleEditMessageCancel: () => void;
    handleDeleteMessage: (message: GroupMessageResponse) => void;
    handleDeleteMessageForMe: (message: GroupMessageResponse) => void;
    handleReplyToMessage: (message: GroupMessageResponse) => void;
    cancelReply: () => void;
    handleTyping: () => void;
    /** Not wired to any UI yet (group chat has no media upload UI) — kept as-is, behavior-preserving rename. */
    handleMediaUploadSuccess: (url: string, type?: MediaType | null) => void;

    // UI state
    editingMessageId: number | null;
    editingMessageText: string;
    replyingTo: GroupMessageResponse | null;
    messageMenuOpen: number | null;
    setMessageMenuOpen: Dispatch<SetStateAction<number | null>>;
    setReplyingTo: Dispatch<SetStateAction<GroupMessageResponse | null>>;
}

const GroupMessagingContext = createContext<UseGroupMessagingResult | null>(null);

/** Wrap GroupChatWindow (or any subtree) to provide group messaging actions. */
export const GroupMessagingProvider = ({ children }: { children: ReactNode }) => {
    const value = useGroupMessagingInternal();
    return createElement(GroupMessagingContext.Provider, { value }, children);
};

export const useGroupMessaging = (): UseGroupMessagingResult => {
    const ctx = useContext(GroupMessagingContext);
    if (!ctx) throw new Error('useGroupMessaging must be used within GroupMessagingProvider');
    return ctx;
};

// ─────────────────────────────────────────────────────────────────────────────

const useGroupMessagingInternal = (): UseGroupMessagingResult => {
    const {
        isConnected,
        selectedGroup,
        setGroupMessages,
        addToast,
        sendGroupMessage,
        sendGroupTyping,
        sendGroupEditMessage,
        sendGroupDeleteMessage,
    } = useDashboard();

    // UI state
    const [editingMessageId, setEditingMessageId]     = useState<number | null>(null);
    const [editingMessageText, setEditingMessageText] = useState('');
    const [replyingTo, setReplyingTo]                 = useState<GroupMessageResponse | null>(null);
    const [messageMenuOpen, setMessageMenuOpen]        = useState<number | null>(null);

    // ── Send ──────────────────────────────────────────────────────────────────

    const handleSend = useCallback((text: string, mediaType: MediaType | null = null) => {
        if (!selectedGroup || (!text?.trim() && !mediaType)) return;

        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión con el servidor' });
            return;
        }

        try {
            sendGroupMessage(selectedGroup.ID, text, replyingTo, mediaType);
            setReplyingTo(null);
        } catch (err) {
            console.error('[GroupMessaging] Error sending message:', err);
            addToast({ type: 'error', message: 'Error al enviar el mensaje' });
        }
    }, [selectedGroup, isConnected, sendGroupMessage, replyingTo, addToast]);

    // ── Edit ──────────────────────────────────────────────────────────────────

    const handleEditMessage = useCallback((message: GroupMessageResponse) => {
        setEditingMessageId(message.MessageID);
        setEditingMessageText(message.Message);
        setMessageMenuOpen(null);
    }, []);

    const handleEditMessageChange = useCallback((e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        setEditingMessageText(e.target.value);
    }, []);

    const handleEditMessageSave = useCallback(() => {
        if (!editingMessageId || !selectedGroup) return;

        if (!isConnected) {
            addToast({ type: 'error', message: 'Sin conexión' });
            return;
        }

        sendGroupEditMessage(selectedGroup.ID, editingMessageId, editingMessageText);
        setEditingMessageId(null);
        setEditingMessageText('');
    }, [editingMessageId, selectedGroup, isConnected, sendGroupEditMessage, editingMessageText, addToast]);

    const handleEditMessageCancel = useCallback(() => {
        setEditingMessageId(null);
        setEditingMessageText('');
    }, []);

    // ── Delete for everyone ────────────────────────────────────────────────────

    const handleDeleteMessage = useCallback((message: GroupMessageResponse) => {
        if (!selectedGroup) return;

        if (!isConnected) {
            addToast({ type: 'error', message: 'Sin conexión' });
            return;
        }

        // Optimistic: remove immediately for the sender; WS broadcast handles others.
        setGroupMessages(prev => {
            const msgs = prev[selectedGroup.ID];
            if (!msgs) return prev;
            return { ...prev, [selectedGroup.ID]: msgs.filter(m => m.MessageID !== message.MessageID) };
        });

        sendGroupDeleteMessage(selectedGroup.ID, message.MessageID);
        setMessageMenuOpen(null);
    }, [selectedGroup, isConnected, sendGroupDeleteMessage, setGroupMessages, addToast]);

    // ── Delete for me (local only — no WS event) ──────────────────────────────

    const handleDeleteMessageForMe = useCallback((message: GroupMessageResponse) => {
        if (!selectedGroup) return;
        setGroupMessages(prev => {
            const msgs = prev[selectedGroup.ID];
            if (!msgs) return prev;
            return { ...prev, [selectedGroup.ID]: msgs.filter(m => m.MessageID !== message.MessageID) };
        });
        setMessageMenuOpen(null);
    }, [selectedGroup, setGroupMessages]);

    // ── Reply ─────────────────────────────────────────────────────────────────

    const handleReplyToMessage = useCallback((message: GroupMessageResponse) => {
        setReplyingTo(message);
        setMessageMenuOpen(null);
    }, []);

    const cancelReply = useCallback(() => setReplyingTo(null), []);

    // ── Typing ────────────────────────────────────────────────────────────────

    const handleTyping = useCallback(() => {
        if (selectedGroup && isConnected) {
            sendGroupTyping(selectedGroup.ID);
        }
    }, [selectedGroup, isConnected, sendGroupTyping]);

    // ── Media upload helper ───────────────────────────────────────────────────

    const handleMediaUploadSuccess = useCallback((url: string, type?: MediaType | null) => {
        handleSend(url, type);
    }, [handleSend]);

    return {
        // Actions
        handleSend,
        handleEditMessage,
        handleEditMessageChange,
        handleEditMessageSave,
        handleEditMessageCancel,
        handleDeleteMessage,
        handleDeleteMessageForMe,
        handleReplyToMessage,
        cancelReply,
        handleTyping,
        handleMediaUploadSuccess,

        // UI States
        editingMessageId,
        editingMessageText,
        replyingTo,
        messageMenuOpen,
        setMessageMenuOpen,
        setReplyingTo,
    };
};
