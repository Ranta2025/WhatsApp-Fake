import { useEffect, useState } from 'react';
import { useWebSocket, useOnlineStatus } from '../hooks/useWebSocket';

/**
 * Componente de ejemplo que muestra cómo integrar WebSocket en el chat
 * 
 * Características implementadas:
 * - Mensajes en tiempo real
 * - Estados de mensaje (enviado/entregado/visto)
 * - Indicador de usuarios online
 * - Indicador de "escribiendo..."
 * - Confirmaciones de lectura automáticas
 */
export default function WebSocketChatExample({ selectedContact, currentUser }) {
    // Almacenar mensajes agrupados por contacto: { contactUsername: [messages] }
    const [messagesByContact, setMessagesByContact] = useState({});
    const [inputMessage, setInputMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [typingTimeout, setTypingTimeout] = useState(null);
    
    // Mensajes filtrados del contacto actual
    const messages = messagesByContact[selectedContact] || [];

    const { 
        isConnected, 
        connectionState, 
        sendMessage, 
        sendReadConfirmation, 
        sendTypingIndicator,
        on,
        off 
    } = useWebSocket();

    const { isOnline } = useOnlineStatus();

    // Escuchar mensajes entrantes
    useEffect(() => {
        const handleIncomingMessage = (data) => {
            // Determinar el contacto asociado (quien nos envió el mensaje)
            const contact = data.from;
            
            // Guardar mensaje en el grupo del contacto correspondiente
            setMessagesByContact(prev => ({
                ...prev,
                [contact]: [
                    ...(prev[contact] || []),
                    {
                        id: data.message_id,
                        from: data.from,
                        to: data.to,
                        message: data.message,
                        status: data.status,
                        timestamp: new Date(data.timestamp)
                    }
                ]
            }));

            // Solo enviar confirmación de lectura si es del contacto seleccionado actualmente
            if (data.from === selectedContact) {
                sendReadConfirmation(data.from);
            }
        };

        const handleDelivered = (data) => {
            // Actualizar estado del mensaje a "entregado"
            // Buscar en los mensajes del contacto correspondiente
            const contact = data.to; // El destinatario de nuestro mensaje
            setMessagesByContact(prev => ({
                ...prev,
                [contact]: (prev[contact] || []).map(msg => 
                    msg.id === data.message_id 
                        ? { ...msg, status: 'entregado' }
                        : msg
                )
            }));
        };

        const handleRead = (data) => {
            // Actualizar estado del mensaje a "visto"
            const contact = data.from; // Quien nos confirma que leyó
            setMessagesByContact(prev => ({
                ...prev,
                [contact]: (prev[contact] || []).map(msg => 
                    msg.to === data.from && msg.status !== 'visto'
                        ? { ...msg, status: 'visto' }
                        : msg
                )
            }));
        };

        const handleTyping = (data) => {
            if (data.from === selectedContact) {
                setIsTyping(true);
                // Ocultar después de 3 segundos
                setTimeout(() => setIsTyping(false), 3000);
            }
        };

        on('message', handleIncomingMessage);
        on('delivered', handleDelivered);
        on('read', handleRead);
        on('typing', handleTyping);

        return () => {
            off('message', handleIncomingMessage);
            off('delivered', handleDelivered);
            off('read', handleRead);
            off('typing', handleTyping);
        };
    }, [selectedContact, on, off, sendReadConfirmation]);

    const handleSendMessage = () => {
        if (!inputMessage.trim() || !isConnected) return;

        const success = sendMessage(selectedContact, inputMessage);
        
        if (success) {
            // Agregar mensaje optimísticamente al grupo del contacto seleccionado
            setMessagesByContact(prev => ({
                ...prev,
                [selectedContact]: [
                    ...(prev[selectedContact] || []),
                    {
                        id: Date.now(), // Temporal, se reemplazará con el ID del servidor
                        from: currentUser,
                        to: selectedContact,
                        message: inputMessage,
                        status: 'enviado',
                        timestamp: new Date()
                    }
                ]
            }));
            
            setInputMessage('');
        }
    };

    const handleInputChange = (e) => {
        setInputMessage(e.target.value);

        // Enviar indicador de "escribiendo..."
        if (typingTimeout) clearTimeout(typingTimeout);
        
        sendTypingIndicator(selectedContact);
        
        const timeout = setTimeout(() => {
            // Dejar de indicar escritura después de 2 segundos
        }, 2000);
        
        setTypingTimeout(timeout);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'visto':
                return <span className="text-amber-500">✓✓</span>;
            case 'entregado':
                return <span className="text-gray-400">✓✓</span>;
            case 'enviado':
                return <span className="text-gray-400">✓</span>;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-indigo-700 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
                            {selectedContact[0]?.toUpperCase()}
                        </div>
                        {isOnline(selectedContact) && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-indigo-700"></div>
                        )}
                    </div>
                    <div>
                        <div className="text-white font-semibold">{selectedContact}</div>
                        <div className="text-indigo-200 text-xs">
                            {isOnline(selectedContact) ? 'En línea' : 'Desconectado'}
                        </div>
                    </div>
                </div>
                
                {/* Indicador de conexión */}
                <div className={`text-xs ${
                    connectionState === 'connected' ? 'text-green-300' : 
                    connectionState === 'disconnected' ? 'text-red-300' : 
                    'text-yellow-300'
                }`}>
                    {connectionState === 'connected' ? '● Conectado' : 
                     connectionState === 'disconnected' ? '● Desconectado' : 
                     '● Reconectando...'}
                </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((msg, idx) => (
                    <div 
                        key={msg.id || idx}
                        className={`flex ${msg.from === currentUser ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`max-w-xs rounded-lg p-3 ${
                            msg.from === currentUser 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-gray-200 text-gray-800'
                        }`}>
                            <div>{msg.message}</div>
                            <div className="flex items-center justify-end gap-1 mt-1 text-xs opacity-70">
                                <span>{msg.timestamp.toLocaleTimeString('es-ES', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                })}</span>
                                {msg.from === currentUser && getStatusIcon(msg.status)}
                            </div>
                        </div>
                    </div>
                ))}
                
                {/* Indicador de "escribiendo..." */}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-gray-200 rounded-lg px-4 py-2 text-gray-600 text-sm italic">
                            escribiendo...
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="bg-white border-t p-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputMessage}
                        onChange={handleInputChange}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Escribe un mensaje..."
                        className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
                        disabled={!isConnected}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!isConnected || !inputMessage.trim()}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Enviar
                    </button>
                </div>
            </div>
        </div>
    );
}
