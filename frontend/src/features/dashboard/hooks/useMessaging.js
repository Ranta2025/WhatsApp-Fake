import { useState, useCallback, useContext, createContext, createElement } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { useDashboard } from '../context/DashboardContext';
import api from '../../../api/axios';

const MessagingContext = createContext(null);

export const MessagingProvider = ({ children }) => {
    const value = useMessagingInternal();
    return createElement(MessagingContext.Provider, { value }, children);
};

export const useMessaging = () => {
    const ctx = useContext(MessagingContext);
    if (!ctx) throw new Error('useMessaging must be used within MessagingProvider');
    return ctx;
};

const useMessagingInternal = () => {
    const { 
        isConnected, sendMessage, sendEditMessage, sendDeleteMessage, 
        sendReadConfirmation, sendTypingIndicator 
    } = useWebSocket();
    
    const { 
        selected, setMessagesByChat, setDrafts, addToast 
    } = useDashboard();

    // UI States for messaging
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingMessageText, setEditingMessageText] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);
    const [messageMenuOpen, setMessageMenuOpen] = useState(null);

    // Forward state
    const [forwardingMessage, setForwardingMessage] = useState(null);

    // --- Message Actions ---

    const handleSend = useCallback((text, mediaType = null) => {
        if (!selected || (!text?.trim() && !mediaType)) return;
        
        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión disponible en este momento' });
            return;
        }

        try {
            sendMessage(selected.Number, text, replyingTo, mediaType);
            
            // Limpiar estados
            setDrafts(prev => ({ ...prev, [selected.Number]: '' }));
            setReplyingTo(null);
        } catch (err) {
            console.error('Error sending message:', err);
            addToast({ type: 'error', message: 'No pudimos enviar tu mensaje. Inténtalo nuevamente.' });
        }
    }, [selected, isConnected, sendMessage, replyingTo, setDrafts, addToast]);

    const handleEditMessage = useCallback((message) => {
        setEditingMessageId(message.MessageID);
        setEditingMessageText(message.Message);
        setMessageMenuOpen(null);
    }, []);

    const handleEditMessageChange = useCallback((e) => {
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
                addToast({ type: 'error', message: 'No hay conexión disponible en este momento' });
            }
        } catch (err) {
            console.error('Error editing message:', err);
            addToast({ type: 'error', message: 'No pudimos guardar los cambios del mensaje.' });
        }
    }, [editingMessageId, selected, isConnected, sendEditMessage, editingMessageText, addToast]);

    const handleEditMessageCancel = useCallback(() => {
        setEditingMessageId(null);
        setEditingMessageText('');
    }, []);

    const handleDeleteMessage = useCallback(async (message, forEveryone = true) => {
        if (!selected) return;
        
        try {
            if (forEveryone) {
                if (isConnected) {
                    sendDeleteMessage(message.MessageID, selected.Number);
                } else {
                    addToast({ type: 'error', message: 'No hay conexión disponible en este momento' });
                }
            } else {
                await api.delete(`/api/v1/message/${message.MessageID}/me`);
                setMessagesByChat((prev) => {
                    const updated = { ...prev };
                    if (updated[selected.Number]) {
                        updated[selected.Number] = updated[selected.Number].filter(m => m.MessageID !== message.MessageID);
                    }
                    return updated;
                });
            }
            setMessageMenuOpen(null);
        } catch (err) {
            console.error('Error deleting message:', err);
            addToast({ type: 'error', message: 'No pudimos eliminar el mensaje. Inténtalo nuevamente.' });
        }
    }, [selected, isConnected, sendDeleteMessage, setMessagesByChat, addToast]);

    const handleReplyToMessage = useCallback((message) => {
        setReplyingTo(message);
        setMessageMenuOpen(null);
        // Hacer scroll al input si es necesario o enfocarlo
    }, []);

    const cancelReply = useCallback(() => {
        setReplyingTo(null);
    }, []);

    const handleForwardMessage = useCallback((message) => {
        setForwardingMessage(message);
        setMessageMenuOpen(null);
    }, []);

    const executeForward = useCallback((targetNumbers) => {
        if (!forwardingMessage || !targetNumbers?.length) return;
        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión disponible en este momento' });
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

    const handleMediaUploadSuccess = useCallback((url, type) => {
        handleSend(url, type);
    }, [handleSend]);

    const markAsRead = useCallback((contactNumber) => {
        if (isConnected) {
            sendReadConfirmation(contactNumber);
        }
    }, [isConnected, sendReadConfirmation]);

    const handleTyping = useCallback(() => {
        if (selected && isConnected) {
            sendTypingIndicator(selected.Number);
        }
    }, [selected, isConnected, sendTypingIndicator]);

    const handleFileUpload = useCallback(async (file, type) => {
        if (!selected) return;
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            if (response.data && response.data.url) {
                handleSend(response.data.url, type || response.data.mediaType);
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            addToast({ type: 'error', message: 'No pudimos subir tu archivo. Inténtalo nuevamente.' });
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
        handleDeleteMessageForMe: (msg) => handleDeleteMessage(msg, false),
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
