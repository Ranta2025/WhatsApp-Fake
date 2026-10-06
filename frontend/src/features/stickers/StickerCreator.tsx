import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { uploadSticker } from '../../api/stickerApi';
import type { Sticker } from '../../types/api';
import {
    ANIMATED_MAX_BYTES,
    STICKER_SIZE,
    computeContainRect,
    computeCropRect,
    detectStickerFormat,
    encodeUnderSizeCap,
    isAnimatedWebp,
    normalizeTags,
    validateAnimatedSticker,
} from './stickerImage';
import type { AnimatedRejectReason } from './stickerImage';

/**
 * Sticker creator (SF5): pick an image, drag/zoom a square crop, draw it to a
 * 512x512 canvas, encode it as WebP with a quality loop and a PNG fallback,
 * then upload through `stickerApi`. Animated WebP files are uploaded as-is
 * after a client-side 512x512 / size check. The optional `onCreated` callback
 * is the seam the panel uses to refresh ("invalidate") `useStickerLibrary`;
 * `onSend` sends the new sticker right away without touching the composer.
 */

const PREVIEW_SIZE = 240;
const MAX_ZOOM = 3;
const ROUNDED_RADIUS_RATIO = 0.18;

const GIF_MESSAGE = 'Los GIF no son compatibles. Convertí el GIF a un WebP animado de 512×512.';
const PROCESS_MESSAGE = 'No se pudo procesar la imagen. Probá con otro archivo.';
const SIZE_MESSAGE = 'La imagen sigue superando los 300 KB. Probá con una más simple.';
const UPLOAD_MESSAGE = 'No se pudo subir el sticker. Intentá de nuevo.';

const rejectMessage = (reason: AnimatedRejectReason): string => {
    switch (reason) {
        case 'gif-not-supported':
            return GIF_MESSAGE;
        case 'not-image':
            return 'El archivo elegido no es una imagen.';
        case 'wrong-dimensions':
            return 'El WebP animado debe medir exactamente 512×512 píxeles.';
        case 'too-large':
            return `El WebP animado supera ${Math.round(ANIMATED_MAX_BYTES / (1024 * 1024))} MB. Probá con uno más liviano.`;
    }
};

interface PickedImage {
    kind: 'static' | 'animated';
    file: File;
}

export interface StickerCreatorProps {
    /** Receives the created sticker; the panel refreshes "Mis stickers" here. */
    onCreated?: (sticker: Sticker) => void;
    /** When provided, offers sending the sticker right after creating it. */
    onSend?: (url: string) => void;
    onClose?: () => void;
    /** Injectable for tests; defaults to the real `uploadSticker`. */
    upload?: (file: File, tags?: string) => Promise<Sticker | null>;
}

export default function StickerCreator({
    onCreated,
    onSend,
    onClose,
    upload = uploadSticker,
}: StickerCreatorProps) {
    const [picked, setPicked] = useState<PickedImage | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [animatedPreviewUrl, setAnimatedPreviewUrl] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [rounded, setRounded] = useState(false);
    const [tags, setTags] = useState('');
    const [sendNow, setSendNow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cropCanvasRef = useRef<HTMLCanvasElement>(null);
    const dragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
    const objectUrlsRef = useRef<string[]>([]);

    const trackUrl = (url: string): string => {
        objectUrlsRef.current.push(url);
        return url;
    };

    useEffect(() => () => {
        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsRef.current = [];
    }, []);

    // Repaints the crop preview whenever the image, the zoom or the drag change.
    useEffect(() => {
        const canvas = cropCanvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const crop = computeCropRect({
            imageWidth: image.naturalWidth,
            imageHeight: image.naturalHeight,
            viewport: PREVIEW_SIZE,
            zoom,
            offsetX: offset.x,
            offsetY: offset.y,
        });
        ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    }, [image, zoom, offset]);

    const handlePick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;

        setError(null);
        setImage(null);
        setAnimatedPreviewUrl(null);

        if (file.type === 'image/gif') {
            setPicked(null);
            setError(GIF_MESSAGE);
            return;
        }

        if (file.type === 'image/webp') {
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (isAnimatedWebp(bytes)) {
                const bitmap = await createImageBitmap(file);
                const validation = validateAnimatedSticker({
                    width: bitmap.width, height: bitmap.height, size: file.size, type: file.type,
                });
                bitmap.close();
                if (!validation.ok) {
                    setPicked(null);
                    setError(rejectMessage(validation.reason));
                    return;
                }
                setPicked({ kind: 'animated', file });
                setAnimatedPreviewUrl(trackUrl(URL.createObjectURL(file)));
                setZoom(1);
                setOffset({ x: 0, y: 0 });
                return;
            }
        }

        const img = new Image();
        img.onload = () => {
            setPicked({ kind: 'static', file });
            setImage(img);
            setZoom(1);
            setOffset({ x: 0, y: 0 });
        };
        img.onerror = () => {
            setPicked(null);
            setError(PROCESS_MESSAGE);
        };
        img.src = trackUrl(URL.createObjectURL(file));
    };

    const buildStaticFile = async (): Promise<File> => {
        if (!image) throw new Error(PROCESS_MESSAGE);
        const canvas = document.createElement('canvas');
        canvas.width = STICKER_SIZE;
        canvas.height = STICKER_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(PROCESS_MESSAGE);

        ctx.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
        if (rounded) {
            ctx.beginPath();
            ctx.roundRect(0, 0, STICKER_SIZE, STICKER_SIZE, STICKER_SIZE * ROUNDED_RADIUS_RATIO);
            ctx.clip();
        }
        const crop = computeCropRect({
            imageWidth: image.naturalWidth,
            imageHeight: image.naturalHeight,
            viewport: PREVIEW_SIZE,
            zoom,
            offsetX: offset.x,
            offsetY: offset.y,
        });
        const dest = computeContainRect(crop.width, crop.height, STICKER_SIZE);
        ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, dest.x, dest.y, dest.width, dest.height);

        const encoded = await encodeUnderSizeCap((quality) =>
            new Promise<Blob | null>((resolve) => {
                canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
            }).then((blob) => blob ?? new Blob()));
        if (!encoded) throw new Error(SIZE_MESSAGE);

        const format = detectStickerFormat(encoded.blob);
        if (!format) throw new Error(PROCESS_MESSAGE);
        return new File([encoded.blob], `sticker.${format}`, { type: encoded.blob.type });
    };

    const handleCreate = async (): Promise<void> => {
        if (!picked || busy) return;
        setBusy(true);
        setError(null);
        try {
            const file = picked.kind === 'animated' ? picked.file : await buildStaticFile();
            const csv = normalizeTags(tags).join(',');
            const created = await upload(file, csv || undefined);
            if (!created) throw new Error(UPLOAD_MESSAGE);
            onCreated?.(created);
            if (sendNow) onSend?.(created.url);
        } catch (failure) {
            setError(failure instanceof Error && failure.message ? failure.message : UPLOAD_MESSAGE);
        } finally {
            setBusy(false);
        }
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
        dragRef.current = {
            active: true,
            startX: event.clientX,
            startY: event.clientY,
            originX: offset.x,
            originY: offset.y,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
        const drag = dragRef.current;
        if (!drag.active) return;
        setOffset({
            x: drag.originX + (event.clientX - drag.startX),
            y: drag.originY + (event.clientY - drag.startY),
        });
    };

    const handlePointerUp = (): void => {
        dragRef.current.active = false;
    };

    return (
        <div role="dialog" aria-label="Crear sticker" className="flex flex-col gap-3 p-4 text-sm text-white">
            <h2 className="text-base font-semibold">Crear sticker</h2>

            <input
                type="file"
                accept="image/*"
                aria-label="Elegir imagen"
                onChange={(event) => { void handlePick(event); }}
                className="text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1 file:text-white"
            />

            {error && <p role="alert" className="text-rose-400">{error}</p>}

            {picked?.kind === 'static' && (
                <>
                    <canvas
                        ref={cropCanvasRef}
                        width={PREVIEW_SIZE}
                        height={PREVIEW_SIZE}
                        aria-label="Recorte"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        className="mx-auto touch-none cursor-move rounded-xl bg-black/30"
                    />
                    <label className="flex items-center gap-2">
                        Zoom
                        <input
                            type="range"
                            min={1}
                            max={MAX_ZOOM}
                            step={0.01}
                            value={zoom}
                            aria-label="Zoom"
                            onChange={(event) => setZoom(Number(event.target.value))}
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={rounded}
                            onChange={(event) => setRounded(event.target.checked)}
                        />
                        Esquinas redondeadas
                    </label>
                </>
            )}

            {picked?.kind === 'animated' && animatedPreviewUrl && (
                <img
                    src={animatedPreviewUrl}
                    alt="Vista previa del sticker animado"
                    className="mx-auto h-60 w-60 rounded-xl object-contain"
                />
            )}

            {picked && (
                <>
                    <label className="flex flex-col gap-1">
                        Etiquetas (máximo 5, separadas por coma)
                        <input
                            type="text"
                            aria-label="Etiquetas"
                            value={tags}
                            placeholder="hola, amor"
                            onChange={(event) => setTags(event.target.value)}
                            className="rounded-lg bg-white/10 px-3 py-1"
                        />
                    </label>

                    {onSend && (
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={sendNow}
                                onChange={(event) => setSendNow(event.target.checked)}
                            />
                            Enviar al crearlo
                        </label>
                    )}

                    <button
                        type="button"
                        onClick={() => { void handleCreate(); }}
                        disabled={busy}
                        className="rounded-lg bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
                    >
                        {busy ? 'Creando…' : 'Crear sticker'}
                    </button>
                </>
            )}

            {onClose && (
                <button type="button" onClick={onClose} className="rounded-lg bg-white/10 px-3 py-2">
                    Cerrar
                </button>
            )}
        </div>
    );
}
