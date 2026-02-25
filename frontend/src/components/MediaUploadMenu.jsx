import React, { useState, useRef } from 'react';
import api from '../api/axios';

export default function MediaUploadMenu({ onUploadSuccess, onUploadError, onClose }) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [uploadType, setUploadType] = useState(null); // 'image', 'video', 'audio', 'document'

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/api/v1/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            
            if (response.data && response.data.url) {
                onUploadSuccess(response.data.url, response.data.mediaType);
            } else {
                throw new Error('No se recibió URL del servidor');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            onUploadError(error.response?.data?.error || 'Error al subir el archivo');
        } finally {
            setIsUploading(false);
            onClose();
        }
    };

    const triggerFileInput = (type, accept, capture = false) => {
        setUploadType(type);
        if (fileInputRef.current) {
            fileInputRef.current.accept = accept;
            if (capture) {
                fileInputRef.current.capture = "environment";
            } else {
                fileInputRef.current.removeAttribute('capture');
            }
            fileInputRef.current.click();
        }
    };

    return (
        <div className="absolute bottom-full mb-2 left-0 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 z-50 min-w-[160px] animate-slide-up origin-bottom-left">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileSelect}
            />
            
            {isUploading ? (
                <div className="flex items-center justify-center p-4 text-indigo-300">
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Subiendo...
                </div>
            ) : (
                <>
                    <button 
                        onClick={() => triggerFileInput('image', 'image/*', true)}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-colors text-left text-sm text-white"
                    >
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        Cámara
                    </button>

                    <button 
                        onClick={() => triggerFileInput('image', 'image/*')}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-colors text-left text-sm text-white"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        Foto
                    </button>
                    
                    <button 
                        onClick={() => triggerFileInput('video', 'video/*')}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-colors text-left text-sm text-white"
                    >
                        <div className="w-8 h-8 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        Video
                    </button>

                    <button 
                        onClick={() => triggerFileInput('document', '*/*')}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-colors text-left text-sm text-white"
                    >
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        Documento
                    </button>
                </>
            )}
        </div>
    );
}
