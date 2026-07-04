import { Button } from '@components/ui/button';
import { useTTS } from '@hooks/useTTS';
import { clearTTSMarkers, extractSpeechSegmentsFromSelector } from '@lib/tts/extract-readable-text';
import { cn } from '@lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiPauseFill, RiPlayFill, RiStopFill, RiVoiceprintFill } from 'react-icons/ri';
import type { Locale } from '@/i18n';

interface TTSPlayerProps {
  contentSelector: string;
  locale: Locale;
}

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5];

const COPY = {
  en: {
    empty: 'No readable article text was found.',
    error: 'Playback failed. Please try again.',
    pause: 'Pause',
    play: 'Play',
    rate: 'Speed',
    ready: (count: number) => `${count} segments are ready for replay.`,
    resume: 'Resume',
    sectionLabel: 'Article text-to-speech',
    statusIdle: 'Ready to read the article aloud.',
    statusPaused: 'Reading paused.',
    statusPlaying: 'Reading the article aloud.',
    stop: 'Stop',
    title: 'Read this article',
    unsupported: 'This browser does not support speech synthesis.',
  },
  ja: {
    empty: '??????????????????????',
    error: '????????????????????',
    pause: '????',
    play: '??',
    rate: '??',
    ready: (count: number) => `${count} ????????????`,
    resume: '??',
    sectionLabel: '?????????',
    statusIdle: '??????????????????',
    statusPaused: '???????????????',
    statusPlaying: '????????????',
    stop: '??',
    title: '???????',
    unsupported: '???????????????????????',
  },
  zh: {
    empty: '??????????????',
    error: '???????????',
    pause: '????',
    play: '????',
    rate: '??',
    ready: (count: number) => `???? ${count} ??????????`,
    resume: '????',
    sectionLabel: '??????',
    statusIdle: '???????????',
    statusPaused: '??????',
    statusPlaying: '?????????',
    stop: '????',
    title: '????',
    unsupported: '?????????????',
  },
} as const;

function getCopy(locale: Locale) {
  if (locale.startsWith('ja')) return COPY.ja;
  if (locale.startsWith('en')) return COPY.en;
  return COPY.zh;
}

export function TTSPlayer({ contentSelector, locale }: TTSPlayerProps) {
  const copy = getCopy(locale);
  const { error, isSupported, pause, rate, resume, setRate, speakSegments, status, stop } = useTTS();
  const [segmentCount, setSegmentCount] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);

  const clearActiveSegment = useCallback(() => {
    if (activeElementRef.current) {
      delete activeElementRef.current.dataset.ttsActive;
      activeElementRef.current = null;
    }
    setActiveSegmentId(null);
  }, []);

  useEffect(() => {
    const styleId = 'article-tts-active-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .prose [data-tts-active="true"] {
          background: linear-gradient(90deg, hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.04));
          border-left: 3px solid hsl(var(--primary));
          border-radius: 0.75rem;
          box-shadow: 0 10px 30px -24px hsl(var(--primary) / 0.6);
          margin-left: -0.875rem;
          margin-right: -0.25rem;
          padding-left: calc(0.875rem - 3px);
          padding-right: 0.25rem;
          transition: background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }
        .prose [data-tts-active="true"]:is(p, blockquote, li, h1, h2, h3, h4, h5, h6, figcaption) {
          transform: translateX(2px);
        }
        .dark .prose [data-tts-active="true"] {
          background: linear-gradient(90deg, hsl(var(--primary) / 0.22), hsl(var(--primary) / 0.08));
          box-shadow: 0 14px 32px -26px hsl(var(--primary) / 0.9);
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      clearActiveSegment();
      const root = document.querySelector<HTMLElement>(contentSelector);
      if (root) {
        clearTTSMarkers(root);
      }
    };
  }, [clearActiveSegment, contentSelector]);

  const statusText = useMemo(() => {
    if (!isSupported) return copy.unsupported;
    if (error === 'empty') return copy.empty;
    if (error === 'playback') return copy.error;

    switch (status) {
      case 'playing':
        return copy.statusPlaying;
      case 'paused':
        return copy.statusPaused;
      case 'error':
        return copy.error;
      default:
        return copy.statusIdle;
    }
  }, [copy, error, isSupported, status]);

  const syncActiveSegment = (segmentId: string | null, element: HTMLElement | null) => {
    if (activeElementRef.current && activeElementRef.current !== element) {
      delete activeElementRef.current.dataset.ttsActive;
    }

    if (element) {
      element.dataset.ttsActive = 'true';
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    activeElementRef.current = element;
    setActiveSegmentId(segmentId);
  };

  const handlePlayToggle = () => {
    if (!isSupported) return;

    if (status === 'playing') {
      pause();
      return;
    }

    if (status === 'paused') {
      resume();
      return;
    }

    const segments = extractSpeechSegmentsFromSelector(contentSelector);
    setSegmentCount(segments.length);

    if (segments.length === 0) {
      clearActiveSegment();
      speakSegments([], { locale });
      return;
    }

    speakSegments(
      segments.map((segment) => segment.text),
      {
        locale,
        onBoundary: (index) => {
          const current = segments[index];
          syncActiveSegment(current?.id ?? null, current?.element ?? null);
        },
        onComplete: () => {
          clearActiveSegment();
        },
      },
    );
  };

  const handleStop = () => {
    stop();
    clearActiveSegment();
  };

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-gradient-start shadow-box',
        'mb-6 flex flex-col gap-4 px-5 py-4',
      )}
      aria-label={copy.sectionLabel}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary text-xs">
            <RiVoiceprintFill className="size-4" />
            <span>{copy.title}</span>
          </div>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">{statusText}</p>
        </div>

        <label
          className="flex items-center gap-2 rounded-full border border-border/60 bg-background/75 px-3 py-1.5 text-muted-foreground text-sm backdrop-blur-sm"
          htmlFor="tts-rate"
        >
          <span>{copy.rate}</span>
          <select
            id="tts-rate"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="bg-transparent font-medium text-foreground outline-none"
          >
            {RATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="rounded-full" onClick={handlePlayToggle} disabled={!isSupported}>
          {status === 'playing' ? <RiPauseFill className="mr-1 size-4" /> : <RiPlayFill className="mr-1 size-4" />}
          {status === 'playing' ? copy.pause : status === 'paused' ? copy.resume : copy.play}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full bg-background/75"
          onClick={handleStop}
          disabled={!isSupported || status === 'idle'}
        >
          <RiStopFill className="mr-1 size-4" />
          {copy.stop}
        </Button>
        {segmentCount > 0 && status !== 'playing' && status !== 'paused' && !error && (
          <span className="rounded-full bg-foreground/5 px-3 py-1 text-muted-foreground text-xs">
            {copy.ready(segmentCount)}
          </span>
        )}
        {activeSegmentId && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">
            #{activeSegmentId.replace('tts-segment-', '')}
          </span>
        )}
      </div>
    </section>
  );
}
