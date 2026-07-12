/**
 * ThemeToggle Component
 *
 * Three-state theme control: browser-local time auto mode, fixed light, and fixed dark.
 */

import { useCallback, useEffect, useState } from 'react';
import './theme-toggle.css';

type ThemePreference = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeSnapshot {
  preference: ThemePreference;
  theme: ResolvedTheme;
}

declare global {
  interface Document {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  }

  interface Window {
    __koharuTheme?: {
      applyPreference: (preference: ThemePreference) => ThemeSnapshot;
      getPreference: () => ThemePreference;
      getResolvedTheme: () => ResolvedTheme;
      sync: () => ThemeSnapshot;
    };
  }
}

function readThemeSnapshot(): ThemeSnapshot {
  if (typeof document === 'undefined') {
    return { preference: 'auto', theme: 'light' };
  }

  const root = document.documentElement;
  const preference = root.dataset.themeMode === 'light' || root.dataset.themeMode === 'dark' ? root.dataset.themeMode : 'auto';
  const theme = root.classList.contains('dark') ? 'dark' : 'light';

  return { preference, theme };
}

function nextPreference({ preference, theme }: ThemeSnapshot): ThemePreference {
  if (preference === 'auto') return theme === 'dark' ? 'light' : 'dark';
  if (preference === 'light') return 'dark';
  return 'auto';
}

function applyPreference(preference: ThemePreference): ThemeSnapshot {
  if (typeof window !== 'undefined' && window.__koharuTheme) {
    return window.__koharuTheme.applyPreference(preference);
  }

  const root = document.documentElement;
  const theme = preference === 'dark' ? 'dark' : 'light';
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.dataset.themeMode = preference;
  root.style.colorScheme = theme;

  try {
    localStorage.setItem('theme', preference);
  } catch (_error) {}

  return { preference, theme };
}

function useTheme() {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>(readThemeSnapshot);

  useEffect(() => {
    const rootElement = document.documentElement;

    setSnapshot(window.__koharuTheme?.sync() ?? readThemeSnapshot());

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === 'class' || mutation.attributeName === 'data-theme-mode')) {
        setSnapshot(readThemeSnapshot());
      }
    });

    observer.observe(rootElement, { attributes: true, attributeFilter: ['class', 'data-theme-mode'] });

    return () => observer.disconnect();
  }, []);

  const cycleTheme = useCallback(() => {
    const newPreference = nextPreference(readThemeSnapshot());
    const rootElement = document.documentElement;

    rootElement.classList.add('theme-transition');

    if (!document.startViewTransition) {
      setSnapshot(applyPreference(newPreference));
      setTimeout(() => {
        rootElement.classList.remove('theme-transition');
      }, 100);
      return;
    }

    const transition = document.startViewTransition(() => {
      setSnapshot(applyPreference(newPreference));
    });

    transition.finished.finally(() => {
      rootElement.classList.remove('theme-transition');
    });
  }, []);

  return { ...snapshot, cycleTheme };
}

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const { cycleTheme, preference, theme } = useTheme();
  const label =
    preference === 'auto'
      ? `Theme auto (${theme}); switch to fixed ${theme === 'dark' ? 'light' : 'dark'}`
      : `Theme fixed ${theme}; ${theme === 'light' ? 'switch to fixed dark' : 'switch to auto'}`;

  return (
    <button
      className={`theme-toggle scale-80 cursor-pointer transition duration-300 hover:scale-90 ${className || ''}`}
      aria-label={label}
      title={label}
      data-theme={theme}
      data-theme-mode={preference}
      onClick={cycleTheme}
      type="button"
    >
      <span className="toggle block cursor-pointer" aria-hidden="true">
        <span className="toggle-indicator" />
      </span>
    </button>
  );
}
