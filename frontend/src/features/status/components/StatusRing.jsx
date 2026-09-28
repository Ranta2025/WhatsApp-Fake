// Anillo segmentado alrededor de un avatar: un arco por estado, verde
// esmeralda para los no vistos y gris pizarra para los vistos. Se usa en la
// lista de "Estados" para mostrar cuántas actualizaciones tiene cada contacto
// y cuáles ya se vieron.

const GAP_DEG = 8;

export default function StatusRing({ segments = [], size = 48, solid = null, children }) {
    const hasSegments = segments.length > 0;
    const radius = (size - 4) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const segAngle = 360 / (segments.length || 1);
    const gap = Math.min(GAP_DEG, segAngle / 4);

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg
                width={size}
                height={size}
                className="absolute inset-0 -rotate-90"
                viewBox={`0 0 ${size} ${size}`}
                aria-hidden="true"
            >
                {solid ? (
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke={solid}
                        strokeWidth={2.5}
                    />
                ) : hasSegments ? (
                    segments.map((viewed, i) => {
                        const startAngle = i * segAngle + gap / 2;
                        const sweep = segAngle - gap;
                        const dash = (sweep / 360) * circumference;
                        const gapLen = circumference - dash;
                        return (
                            <circle
                                key={i}
                                cx={center}
                                cy={center}
                                r={radius}
                                fill="none"
                                stroke={viewed ? '#475569' /* slate-600 */ : '#10b981' /* emerald-500 */}
                                strokeWidth={2.5}
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${gapLen}`}
                                transform={`rotate(${startAngle} ${center} ${center})`}
                            />
                        );
                    })
                ) : null}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center p-[3px]">
                {children}
            </div>
        </div>
    );
}
