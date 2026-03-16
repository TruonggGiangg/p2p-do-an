/**
 * FontSizeProvider – Per-user font size presets
 * Loads from API, caches in localStorage for instant apply,
 * overrides CSS custom properties on :root.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { adminApi } from '../api/admin';

export type FontSizePreset = 'compact' | 'default' | 'large';

interface FontSizeContextType {
  fontSize: FontSizePreset;
  setFontSize: (size: FontSizePreset) => void;
}

const FontSizeContext = createContext<FontSizeContextType>({
  fontSize: 'default',
  setFontSize: () => {},
});

export const useFontSize = () => useContext(FontSizeContext);

// ── Preset scale maps ────────────────────────────────────────────────────────
const PRESETS: Record<FontSizePreset, Record<string, string>> = {
  compact: {
    '--font-size-micro': '9px',
    '--font-size-xs': '10px',
    '--font-size-sm': '11px',
    '--font-size-base': '12px',
    '--font-size-table': '11px',
    '--font-size-md': '13px',
    '--font-size-lg': '16px',
    '--font-size-xl': '20px',
    '--font-size-2xl': '26px',
  },
  default: {
    '--font-size-micro': '10px',
    '--font-size-xs': '11px',
    '--font-size-sm': '12px',
    '--font-size-base': '14px',
    '--font-size-table': '13px',
    '--font-size-md': '15px',
    '--font-size-lg': '18px',
    '--font-size-xl': '22px',
    '--font-size-2xl': '28px',
  },
  large: {
    '--font-size-micro': '11px',
    '--font-size-xs': '12px',
    '--font-size-sm': '14px',
    '--font-size-base': '15px',
    '--font-size-table': '14px',
    '--font-size-md': '17px',
    '--font-size-lg': '20px',
    '--font-size-xl': '26px',
    '--font-size-2xl': '34px',
  },
};

const LS_KEY = 'admin_font_size';

function applyPreset(preset: FontSizePreset) {
  const vars = PRESETS[preset];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSizePreset>(() => {
    const saved = localStorage.getItem(LS_KEY);
    return (saved as FontSizePreset) || 'default';
  });

  // Apply on mount immediately (from localStorage cache)
  const isFirstRender = useRef(true);
  useEffect(() => {
    applyPreset(fontSize);
  }, [fontSize]);

  // Load from API once
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) return;

    adminApi.getMyPreferences()
      .then((prefs) => {
        const serverSize = prefs?.fontSize || 'default';
        if (serverSize !== fontSize) {
          setFontSizeState(serverSize);
          localStorage.setItem(LS_KEY, serverSize);
        }
        isFirstRender.current = false;
      })
      .catch(() => {
        // silently fallback to localStorage
        isFirstRender.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFontSize = useCallback((size: FontSizePreset) => {
    setFontSizeState(size);
    localStorage.setItem(LS_KEY, size);
    applyPreset(size);

    // Fire & forget API save
    adminApi.updateMyPreferences({ fontSize: size }).catch(() => {});
  }, []);

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}
