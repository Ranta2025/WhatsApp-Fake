import { Fragment } from 'react';
import { findMatchRanges, splitByRanges } from '../lib/searchHighlight';

interface HighlightedTextProps {
    text: string;
    /** Término buscado; sin él (o sin coincidencias) se renderiza el texto tal cual. */
    query?: string;
}

/** Texto con las coincidencias de `query` resaltadas (sin importar mayúsculas ni acentos). */
const HighlightedText = ({ text, query }: HighlightedTextProps) => {
    const ranges = query ? findMatchRanges(text, query) : [];
    if (ranges.length === 0) return <>{text}</>;
    return (
        <>
            {splitByRanges(text, ranges).map((segment, i) => (
                segment.match
                    ? <mark key={i} className="search-mark">{segment.text}</mark>
                    : <Fragment key={i}>{segment.text}</Fragment>
            ))}
        </>
    );
};

export default HighlightedText;
