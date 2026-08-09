import { useEffect, useRef, useState, useCallback } from 'react';

export function useScrollToBottom(deps = []) {
    const containerRef = useRef(null);
    const bottomRef = useRef(null);
    const shouldStickRef = useRef(true);
    const [showJump, setShowJump] = useState(false);
    const prevLenRef = useRef(0);

    const scrollToBottom = useCallback((behavior = 'smooth') => {
        if (!bottomRef.current) return;
        bottomRef.current.scrollIntoView({ behavior, block: 'end' });
    }, []);

    const onScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const near = distance <= 120;
        shouldStickRef.current = near;
        setShowJump(!near);
    }, []);

    const jump = useCallback(() => {
        shouldStickRef.current = true;
        setShowJump(false);
        scrollToBottom('smooth');
    }, [scrollToBottom]);

    useEffect(() => {
        prevLenRef.current = 0;
        shouldStickRef.current = true;
        setShowJump(false);
        requestAnimationFrame(() => scrollToBottom('auto'));
    }, deps);

    const handleNewItems = useCallback((currentLength) => {
        const prev = prevLenRef.current;
        prevLenRef.current = currentLength;

        if (currentLength === 0) return;
        if (prev === 0) {
            requestAnimationFrame(() => scrollToBottom('auto'));
            return;
        }
        if (shouldStickRef.current) {
            requestAnimationFrame(() => scrollToBottom('smooth'));
        } else {
            setShowJump(true);
        }
    }, [scrollToBottom]);

    return {
        containerRef,
        bottomRef,
        showJump,
        onScroll,
        jump,
        scrollToBottom,
        shouldStickRef,
        prevLenRef,
        handleNewItems,
    };
}
