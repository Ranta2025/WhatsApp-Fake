import { useState, useCallback, useContext, createContext, createElement } from 'react';
import { useDashboard } from '../context/DashboardContext';

const GroupMessagingContext = createContext(null);

/** Wrap GroupChatWindow (or any subtree) to provide group messaging actions. */
export const GroupMessagingProvider = ({ children }) => {
    const value = useGroupMessagingInternal();
    return createElement(GroupMessagingContext.Provider, { value }, children);
};

export const useGroupMessaging = () => {
    const ctx = useContext(GroupMessagingContext);
    if (!ctx) throw new Error('useGroupMessaging must be used within GroupMessagingProvider');
    return ctx;
};

// ─────────────────────────────────────────────────────────────────────────────

const useGroupMessagingInternal = () => {
    const {
        isConnected,
        selectedGroup,
        groupMessages, setGroupMessages,
        addToast,
        sendGroupMessage,
        sendGroupTyping,
        sendGroupEditMessage,
        sendGroupDeleteMessage,
    } = useDashboard();

    // UI state
    const [editingMessageId, setEditingMessageId]     = useState(null);
    const [editingMessageText, setEditingMessageText] = useState('');
    const [replyingTo, setReplyingTo]                 = useState(null);
    const [messageMenuOpen, setMessageMenuOpen]        = useState(null);

    // ── Send ──────────────────────────────────────────────────────────────────

    const handleSend = useCallback((text, mediaType = null) => {
        if (!selectedGroup || (!text?.trim() && !mediaType)) return;

        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión disponible en este momento' });
            return;
        }

        try {
            sendGroupMessage(selectedGroup.ID, text, replyingTo, mediaType);
            setReplyingTo(null);
        } catch (err) {
            console.error('[GroupMessaging] Error sending message:', err);
            addToast({ type: 'error', message: 'No pudimos enviar tu mensaje al grupo. Inténtalo nuevamente.' });
        }
    }, [selectedGroup, isConnected, sendGroupMessage, replyingTo, addToast]);

    // ── Edit ──────────────────────────────────────────────────────────────────

    const handleEditMessage = useCallback((message) => {
        setEditingMessageId(message.MessageID);
        setEditingMessageText(message.Message);
        setMessageMenuOpen(null);
    }, []);

    const handleEditMessageChange = useCallback((e) => {
        setEditingMessageText(e.target.value);
    }, []);

    const handleEditMessageSave = useCallback(() => {
        if (!editingMessageId || !selectedGroup) return;

        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión disponible en este momento' });
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

    const handleDeleteMessage = useCallback((message) => {
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

    const handleDeleteMessageForMe = useCallback((message) => {
        if (!selectedGroup) return;
        setGroupMessages(prev => {
            const msgs = prev[selectedGroup.ID];
            if (!msgs) return prev;
            return { ...prev, [selectedGroup.ID]: msgs.filter(m => m.MessageID !== message.MessageID) };
        });
        setMessageMenuOpen(null);
    }, [selectedGroup, setGroupMessages]);

    // ── Reply ─────────────────────────────────────────────────────────────────

    const handleReplyToMessage = useCallback((message) => {
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

    const handleMediaUploadSuccess = useCallback((url, type) => {
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
