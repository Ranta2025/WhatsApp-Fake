import React, { useEffect, useState } from 'react';
import api from '../api/axios';

// Iconos SVG inline
const PhoneIcon = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
);

const VideoIcon = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const IncomingIcon = ({ className = "w-3.5 h-3.5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
);

const OutgoingIcon = ({ className = "w-3.5 h-3.5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

// Formatear duración en formato m:ss
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Formatear fecha relativa
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Ayer';
    } else if (days < 7) {
        return date.toLocaleDateString([], { weekday: 'long' });
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
}

// Color y texto según estado
function getStatusInfo(status, isOutgoing) {
    switch (status) {
        case 'answered':
            return { color: 'text-green-400', label: '' };
        case 'missed':
            return {
                color: isOutgoing ? 'text-gray-400' : 'text-red-400',
                label: isOutgoing ? 'Sin respuesta' : 'Perdida'
            };
        case 'rejected':
            return {
                color: 'text-red-400',
                label: isOutgoing ? 'Rechazada' : 'Rechazada'
            };
        case 'unavailable':
            return { color: 'text-gray-400', label: 'No disponible' };
        default:
            return { color: 'text-gray-400', label: status };
    }
}

export default function CallHistory({ contacts, onSelectContact, onStartCall, searchQuery }) {
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchCalls = async () => {
        try {
            const res = await api.get('/api/v1/call/history');
            setCalls(res.data.calls || []);
        } catch (err) {
            console.error('Error cargando historial de llamadas:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalls();
    }, []);

    const handleDelete = async (callID, e) => {
        e.stopPropagation();
        if (!callID) return;
        try {
            await api.delete(`/api/v1/call/${callID}`);
            setCalls(prev => prev.filter(c => (c.id ?? c.ID) !== callID));
        } catch (err) {
            console.error('Error eliminando registro:', err);
        }
    };

    // Buscar nombre del contacto por teléfono
    const getDisplayName = (telephon, username) => {
        const contact = contacts?.find(c => c.Number === telephon);
        return contact?.ContactName || username || telephon;
    };

    // Filter calls based on searchQuery
    const filteredCalls = calls.filter(call => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const caller = call.callerTelephon || call.CallerTelephon || call.callerUsername || call.CallerUsername || '';
        const receiver = call.receiverTelephon || call.ReceiverTelephon || call.receiverUsername || call.ReceiverUsername || '';
        const contactCaller = contacts?.find(c => c.Number === (call.callerTelephon || call.CallerTelephon))?.ContactName || '';
        const contactReceiver = contacts?.find(c => c.Number === (call.receiverTelephon || call.ReceiverTelephon))?.ContactName || '';
        
        return caller.toLowerCase().includes(query) || 
               receiver.toLowerCase().includes(query) || 
               contactCaller.toLowerCase().includes(query) || 
               contactReceiver.toLowerCase().includes(query);
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!calls || calls.length === 0) {
        return (
            <div className="text-center text-indigo-200 py-8">
                <PhoneIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No hay llamadas recientes</p>
            </div>
        );
    }

    if (filteredCalls.length === 0) {
        return (
            <div className="text-center text-indigo-200 py-8">
                <PhoneIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No se encontraron resultados</p>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="text-indigo-200 text-sm mb-2 uppercase">Llamadas Recientes</div>
            {filteredCalls.map((call) => {
                const callID = call.id ?? call.ID;
                const isOutgoing = call.isOutgoing ?? call.IsOutgoing;
                const callerTelephon = call.callerTelephon ?? call.CallerTelephon;
                const receiverTelephon = call.receiverTelephon ?? call.ReceiverTelephon;
                const callerUsername = call.callerUsername ?? call.CallerUsername;
                const receiverUsername = call.receiverUsername ?? call.ReceiverUsername;
                const status = call.status ?? call.Status;
                const durationSec = call.duration ?? call.Duration;
                const startedAt = call.startedAt ?? call.StartedAt;
                const callType = call.callType ?? call.CallType;

                const remoteTelephon = isOutgoing ? receiverTelephon : callerTelephon;
                const remoteUsername = isOutgoing ? receiverUsername : callerUsername;
                const displayName = getDisplayName(remoteTelephon, remoteUsername) || 'Contacto';
                const statusInfo = getStatusInfo(status, isOutgoing);
                const duration = formatDuration(durationSec);
                const dateStr = formatDate(startedAt);
                const isVideo = callType === 'video';

                return (
                    <div
                        key={callID}
                        className="group relative w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded flex items-center gap-3 cursor-pointer transition"
                        onClick={() => {
                            // Al hacer click, abrir chat con ese contacto
                            const contact = contacts?.find(c => c.Number === remoteTelephon);
                            if (contact && onSelectContact) {
                                onSelectContact(contact);
                            } else if (onSelectContact) {
                                onSelectContact({
                                    Number: remoteTelephon,
                                    Username: remoteUsername || remoteTelephon,
                                    ContactName: null,
                                    Status: 'unknown'
                                });
                            }
                        }}
                    >
                        {/* Avatar */}
                        <div className="relative w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-sm shrink-0">
                            {displayName?.charAt(0)?.toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{displayName}</div>
                            <div className="flex items-center gap-1 text-xs">
                                {/* Icono dirección */}
                                <span className={statusInfo.color}>
                                    {isOutgoing ? <OutgoingIcon /> : <IncomingIcon />}
                                </span>
                                {/* Icono tipo */}
                                <span className="text-indigo-300 opacity-60">
                                    {isVideo ? <VideoIcon className="w-3 h-3" /> : <PhoneIcon className="w-3 h-3" />}
                                </span>
                                {/* Estado / duración */}
                                {status === 'answered' && duration ? (
                                    <span className="text-indigo-200">{duration}</span>
                                ) : (
                                    <span className={statusInfo.color}>{statusInfo.label}</span>
                                )}
                            </div>
                        </div>

                        {/* Fecha + acciones */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] text-indigo-300">{dateStr}</span>
                            <div className="flex gap-1">
                                {/* Botón rellamar */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onStartCall) {
                                            onStartCall(remoteTelephon, displayName, callType);
                                        }
                                    }}
                                    className="p-1 rounded hover:bg-white/20 text-indigo-300 hover:text-white transition opacity-0 group-hover:opacity-100"
                                    title={isVideo ? 'Videollamada' : 'Llamar'}
                                >
                                    {isVideo ? <VideoIcon className="w-3.5 h-3.5" /> : <PhoneIcon className="w-3.5 h-3.5" />}
                                </button>
                                {/* Botón eliminar */}
                                <button
                                    onClick={(e) => handleDelete(callID, e)}
                                    className="p-1 rounded hover:bg-red-500/20 text-indigo-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                                    title="Eliminar"
                                >
                                    <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
