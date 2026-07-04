import { pickBestVoice, resolveSpeechLang, TTS_RATE_STORAGE_KEY } from '@lib/tts/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '@/i18n';

export type TTSStatus = 'idle' | 'playing' | 'paused' | 'unsupported' | 'error';

interface SpeakOptions {
  locale: Locale;
  onBoundary?: (index: number) => void;
  onComplete?: () => void;
}

interface SpeakSegmentOptions extends SpeakOptions {
  startIndex?: number;
}

function getStoredRate(): number {
  if (typeof window === 'undefined') return 1;

  const value = Number(window.localStorage.getItem(TTS_RATE_STORAGE_KEY));
  if (Number.isFinite(value) && value >= 0.5 && value <= 2) {
    return value;
  }

  return 1;
}

export function useTTS() {
  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';

  const [status, setStatus] = useState<TTSStatus>(isSupported ? 'idle' : 'unsupported');
  const [error, setError] = useState<string | null>(null);
  const [rate, setRateState] = useState(getStoredRate);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;

    queueRef.current = [];
    utteranceRef.current = null;
    window.speechSynthesis.cancel();
    setStatus('idle');
    setError(null);
  }, [isSupported]);

  const speakSegment = useCallback(
    (segments: string[], options: SpeakSegmentOptions) => {
      if (!isSupported) {
        setStatus('unsupported');
        return false;
      }

      const startIndex = options.startIndex ?? 0;
      const normalizedText = segments[startIndex]?.trim();

      if (!normalizedText) {
        utteranceRef.current = null;
        queueRef.current = [];
        setStatus('idle');
        options.onComplete?.();
        return false;
      }

      const utterance = new window.SpeechSynthesisUtterance(normalizedText);
      const lang = resolveSpeechLang(options.locale);
      const voice = pickBestVoice(voices, lang);

      utterance.lang = lang;
      utterance.rate = rate;
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        setError(null);
        setStatus('playing');
        options.onBoundary?.(startIndex);
      };
      utterance.onpause = () => setStatus('paused');
      utterance.onresume = () => setStatus('playing');
      utterance.onend = () => {
        const nextIndex = startIndex + 1;
        if (queueRef.current[nextIndex]) {
          speakSegment(queueRef.current, { ...options, startIndex: nextIndex });
          return;
        }

        utteranceRef.current = null;
        queueRef.current = [];
        setStatus('idle');
        options.onComplete?.();
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        queueRef.current = [];
        setError('playback');
        setStatus('error');
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [isSupported, rate, voices],
  );

  useEffect(() => {
    if (!isSupported) return;

    const handleBeforePreparation = () => stop();
    const handleBeforeUnload = () => stop();

    document.addEventListener('astro:before-preparation', handleBeforePreparation);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('astro:before-preparation', handleBeforePreparation);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stop();
    };
  }, [isSupported, stop]);

  const speak = useCallback(
    (text: string, options: SpeakOptions) => {
      if (!isSupported) {
        setStatus('unsupported');
        return false;
      }

      const normalizedText = text.trim();
      if (!normalizedText) {
        setError('empty');
        setStatus('error');
        return false;
      }

      stop();
      queueRef.current = [normalizedText];
      return speakSegment(queueRef.current, { ...options, startIndex: 0 });
    },
    [isSupported, speakSegment, stop],
  );

  const speakSegments = useCallback(
    (segments: string[], options: SpeakOptions) => {
      if (!isSupported) {
        setStatus('unsupported');
        return false;
      }

      const normalizedSegments = segments.map((segment) => segment.trim()).filter(Boolean);
      if (normalizedSegments.length === 0) {
        setError('empty');
        setStatus('error');
        return false;
      }

      stop();
      queueRef.current = normalizedSegments;
      return speakSegment(normalizedSegments, { ...options, startIndex: 0 });
    },
    [isSupported, speakSegment, stop],
  );

  const pause = useCallback(() => {
    if (!isSupported || !window.speechSynthesis.speaking) return;

    window.speechSynthesis.pause();
    setStatus('paused');
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported || !window.speechSynthesis.paused) return;

    window.speechSynthesis.resume();
    setStatus('playing');
  }, [isSupported]);

  const setRate = useCallback((value: number) => {
    const nextRate = Math.min(2, Math.max(0.5, value));
    setRateState(nextRate);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TTS_RATE_STORAGE_KEY, String(nextRate));
    }
  }, []);

  return useMemo(
    () => ({
      error,
      isSupported,
      pause,
      rate,
      resume,
      setRate,
      speak,
      speakSegments,
      status,
      stop,
    }),
    [error, isSupported, pause, rate, resume, setRate, speak, speakSegments, status, stop],
  );
}
