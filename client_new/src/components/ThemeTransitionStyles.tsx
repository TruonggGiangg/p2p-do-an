/**
 * Injects View Transition API CSS for circular reveal effect when toggling dark/light mode on web.
 * Same effect as admin_web.
 */
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

const VIEW_TRANSITION_CSS = `
/* ── View Transition API (Circular Reveal) ── */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

::view-transition-new(root) {
  z-index: 999;
}

::view-transition-old(root) {
  z-index: 1;
}

@keyframes circle-reveal {
  from {
    clip-path: circle(0% at var(--reveal-x) var(--reveal-y));
  }
  to {
    clip-path: circle(150% at var(--reveal-x) var(--reveal-y));
  }
}

::view-transition-new(root) {
  animation: 700ms cubic-bezier(0.4, 0, 0.2, 1) both circle-reveal;
}
`;

export function ThemeTransitionStyles() {
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const style = document.createElement('style');
        style.id = 'theme-transition-styles';
        style.textContent = VIEW_TRANSITION_CSS;
        document.head.appendChild(style);
        return () => {
            const el = document.getElementById('theme-transition-styles');
            if (el) el.remove();
        };
    }, []);

    return null;
}
