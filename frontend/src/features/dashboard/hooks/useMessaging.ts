import {
    useState, useCallback, useContext, createContext, createElement,
    type ReactNode, type ChangeEvent, type Dispatch, type SetStateAction,
} from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useDashboard } from '../context/DashboardContext';
import api from '../../../api/axios';
import type { Message, MediaType, MediaUploadResult } from '../../../types/api';

/** Return shape of `useMessaging()` — members verified against real consumers
 * (`ChatWindow.jsx`, `MessageList.jsx`, `MessageInput.jsx`, via `rg`). */
export interface UseMessagingResult {
    // Actions
    handleSend: (text: string, mediaType?: MediaType | null) => void;
    handleEditMessage: (message: Message) => void;
    handleEditMessageChange: (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
    handleEditMessageSave: () => Promise<void>;
    handleEditMessageCancel: () => void;
    handleDeleteMessage: (message: Message, forEveryone?: boolean) => Promise<void>;
    handleDeleteMessageForMe: (message: Message) => void;
    handleReplyToMessage: (message: Message) => void;
    cancelReply: () => void;
    handleMediaUploadSuccess: (url: string, type?: MediaType | null) => void;
    markAsRead: (contactNumber: string) => void;
    handleTyping: () => void;
    /** Not wired to any UI yet (no consumer calls it) — kept as-is, behavior-preserving rename. */
    handleFileUpload: (file: File, type?: MediaType) => Promise<void>;
    handleForwardMessage: (message: Message) => void;
    executeForward: (targetNumbers: string[]) => void;

    // UI state
    editingMessageId: number | null;
    editingMessageText: string;
    replyingTo: Message | null;
    messageMenuOpen: number | null;
    setMessageMenuOpen: Dispatch<SetStateAction<number | null>>;
    setReplyingTo: Dispatch<SetStateAction<Message | null>>;
    forwardingMessage: Message | null;
    setForwardingMessage: Dispatch<SetStateAction<Message | null>>;
}

const MessagingContext = createContext<UseMessagingResult | null>(null);

export const MessagingProvider = ({ children }: { children: ReactNode }) => {
    const value = useMessagingInternal();
    return createElement(MessagingContext.Provider, { value }, children);
};

export const useMessaging = (): UseMessagingResult => {
    const ctx = useContext(MessagingContext);
    if (!ctx) throw new Error('useMessaging must be used within MessagingProvider');
    return ctx;
};

const useMessagingInternal = (): UseMessagingResult => {
    const {
        isConnected, sendMessage, sendEditMessage, sendDeleteMessage,
        sendReadConfirmation, sendTypingIndicator
    } = useWebSocket();

    const {
        selected, setMessagesByChat, setDrafts, addToast
    } = useDashboard();

    // UI States for messaging
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingMessageText, setEditingMessageText] = useState('');
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [messageMenuOpen, setMessageMenuOpen] = useState<number | null>(null);

    // Forward state
    const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

    // --- Message Actions ---

    const handleSend = useCallback((text: string, mediaType: MediaType | null = null) => {
        if (!selected || (!text?.trim() && !mediaType)) return;

        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión con el servidor' });
            return;
        }

        try {
            sendMessage(selected.Number, text, replyingTo, mediaType);

            // Limpiar estados
            setDrafts(prev => ({ ...prev, [selected.Number]: '' }));
            setReplyingTo(null);
        } catch (err) {
            console.error('Error sending message:', err);
            addToast({ type: 'error', message: 'Error al enviar el mensaje' });
        }
    }, [selected, isConnected, sendMessage, replyingTo, setDrafts, addToast]);

    const handleEditMessage = useCallback((message: Message) => {
        setEditingMessageId(message.MessageID);
        setEditingMessageText(message.Message);
        setMessageMenuOpen(null);
    }, []);

    const handleEditMessageChange = useCallback((e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        setEditingMessageText(e.target.value);
    }, []);

    const handleEditMessageSave = useCallback(async () => {
        if (!editingMessageId || !selected) return;

        try {
            if (isConnected) {
                sendEditMessage(editingMessageId, selected.Number, editingMessageText);
                setEditingMessageId(null);
                setEditingMessageText('');
            } else {
                addToast({ type: 'error', message: 'Sin conexión' });
            }
        } catch (err) {
            console.error('Error editing message:', err);
            addToast({ type: 'error', message: 'Error al editar mensaje' });
        }
    }, [editingMessageId, selected, isConnected, sendEditMessage, editingMessageText, addToast]);

    const handleEditMessageCancel = useCallback(() => {
        setEditingMessageId(null);
        setEditingMessageText('');
    }, []);

    const handleDeleteMessage = useCallback(async (message: Message, forEveryone = true) => {
        if (!selected) return;

        try {
            if (forEveryone) {
                if (isConnected) {
                    sendDeleteMessage(message.MessageID, selected.Number);
                } else {
                    addToast({ type: 'error', message: 'Sin conexión' });
                }
            } else {
                await api.delete(`/api/v1/message/${message.MessageID}/me`);
                setMessagesByChat((prev) => {
                    const updated = { ...prev };
                    const chatMessages = updated[selected.Number];
                    if (chatMessages) {
                        updated[selected.Number] = chatMessages.filter(m => m.MessageID !== message.MessageID);
                    }
                    return updated;
                });
            }
            setMessageMenuOpen(null);
        } catch (err) {
            console.error('Error deleting message:', err);
            addToast({ type: 'error', message: 'Error al eliminar mensaje' });
        }
    }, [selected, isConnected, sendDeleteMessage, setMessagesByChat, addToast]);

    const handleReplyToMessage = useCallback((message: Message) => {
        setReplyingTo(message);
        setMessageMenuOpen(null);
        // Hacer scroll al input si es necesario o enfocarlo
    }, []);

    const cancelReply = useCallback(() => {
        setReplyingTo(null);
    }, []);

    const handleForwardMessage = useCallback((message: Message) => {
        setForwardingMessage(message);
        setMessageMenuOpen(null);
    }, []);

    const executeForward = useCallback((targetNumbers: string[]) => {
        if (!forwardingMessage || !targetNumbers?.length) return;
        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión con el servidor' });
            return;
        }
        const mediaType = forwardingMessage.MediaType || null;
        const content = mediaType
            ? (forwardingMessage.MediaUrl || forwardingMessage.Message)
            : forwardingMessage.Message;
        targetNumbers.forEach(number => {
            sendMessage(number, content, null, mediaType);
        });
        const label = targetNumbers.length === 1
            ? 'Mensaje reenviado'
            : `Mensaje reenviado a ${targetNumbers.length} contactos`;
        addToast({ type: 'success', message: label });
        setForwardingMessage(null);
    }, [forwardingMessage, isConnected, sendMessage, addToast]);

    const handleMediaUploadSuccess = useCallback((url: string, type?: MediaType | null) => {
        handleSend(url, type);
    }, [handleSend]);

    const markAsRead = useCallback((contactNumber: string) => {
        if (isConnected) {
            sendReadConfirmation(contactNumber);
        }
    }, [isConnected, sendReadConfirmation]);

    const handleTyping = useCallback(() => {
        if (selected && isConnected) {
            sendTypingIndicator(selected.Number);
        }
    }, [selected, isConnected, sendTypingIndicator]);

    const handleFileUpload = useCallback(async (file: File, type?: MediaType) => {
        if (!selected) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            // El cuerpo puede llegar vacío/null; `response.data?.` restaura la
            // tolerancia de la versión JS en vez de asumir MediaUploadResult no-nulo.
            const response = await api.post<MediaUploadResult | null>('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data?.url) {
                handleSend(response.data.url, type || response.data.mediaType);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            addToast({ type: 'error', message: 'Error al subir el archivo' });
        }
    }, [selected, handleSend, addToast]);

    return {
        // Actions
        handleSend,
        handleEditMessage,
        handleEditMessageChange,
        handleEditMessageSave,
        handleEditMessageCancel,
        handleDeleteMessage,
        handleDeleteMessageForMe: (msg: Message) => handleDeleteMessage(msg, false),
        handleReplyToMessage,
        cancelReply,
        handleMediaUploadSuccess,
        markAsRead,
        handleTyping,
        handleFileUpload,
        handleForwardMessage,
        executeForward,

        // UI States
        editingMessageId,
        editingMessageText,
        replyingTo,
        messageMenuOpen,
        setMessageMenuOpen,
        setReplyingTo,
        forwardingMessage,
        setForwardingMessage
    };
};
