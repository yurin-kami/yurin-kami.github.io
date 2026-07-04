import { Button } from '@components/ui/button';
import { useTTS } from '@hooks/useTTS';
import { clearTTSMarkers, extractSpeechSegmentsFromSelector } from '@lib/tts/extract-readable-text';
import { cn } from '@lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiPauseFill, RiPlayFill, RiSpeedUpFill, RiStopFill, RiVoiceprintFill } from 'react-icons/ri';
import type { Locale } from '@/i18n';

interface TTSPlayerProps {
  contentSelector: string;
  locale: Locale;
}

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

const COPY = {
  en: {
    empty: 'No readable article text was found.',
    error: 'Playback failed. Please try again.',
    pause: 'Pause',
    play: 'Play',
    progress: (current: number, total: number) => `Paragraph ${current} / ${total}`,
    rate: 'Speed',
    ready: (count: number) => `${count} paragraphs ready`,
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
    progress: (current: number, total: number) => `?? ${current} / ${total}`,
    rate: '??',
    ready: (count: number) => `${count} ?????????`,
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
    progress: (current: number, total: number) => `?? ${current} / ${total}`,
    rate: '??',
    ready: (count: number) => `? ${count} ???????`,
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
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);

  const clearActiveSegment = useCallback(() => {
    if (activeElementRef.current) {
      delete activeElementRef.current.dataset.ttsActive;
      activeElementRef.current = null;
    }

    setActiveSegmentId(null);
    setActiveSegmentIndex(null);
  }, []);

  useEffect(() => {
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

  const syncActiveSegment = useCallback((index: number, segmentId: string | null, element: HTMLElement | null) => {
    if (activeElementRef.current && activeElementRef.current !== element) {
      delete activeElementRef.current.dataset.ttsActive;
    }

    if (element) {
      element.dataset.ttsActive = 'true';
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    activeElementRef.current = element;
    setActiveSegmentId(segmentId);
    setActiveSegmentIndex(index + 1);
  }, []);

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
          syncActiveSegment(index, current?.id ?? null, current?.element ?? null);
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
      className={cn('mb-6 overflow-hidden rounded-2xl border border-border/60 bg-gradient-start shadow-box')}
      aria-label={copy.sectionLabel}
      data-tts-player
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-border/50 border-b bg-foreground/[0.04] px-4 py-3">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary text-xs">
            <RiVoiceprintFill className="size-4" />
            <span>{copy.title}</span>
          </div>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">{statusText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {segmentCount > 0 && (
            <span className="rounded-full border border-border/50 bg-background/80 px-3 py-1 text-muted-foreground">
              {copy.ready(segmentCount)}
            </span>
          )}
          {activeSegmentIndex && activeSegmentId && (
            <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
              {copy.progress(activeSegmentIndex, segmentCount)}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="rounded-2xl border border-border/50 bg-background/70 p-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" className="rounded-full" onClick={handlePlayToggle} disabled={!isSupported}>
              {status === 'playing' ? <RiPauseFill className="mr-1 size-4" /> : <RiPlayFill className="mr-1 size-4" />}
              {status === 'playing' ? copy.pause : status === 'paused' ? copy.resume : copy.play}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full bg-background/80"
              onClick={handleStop}
              disabled={!isSupported || status === 'idle'}
            >
              <RiStopFill className="mr-1 size-4" />
              {copy.stop}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 rounded-2xl border border-border/50 bg-background/70 p-2 backdrop-blur-sm md:justify-end">
          <span className="inline-flex items-center gap-1 px-2 text-muted-foreground text-xs">
            <RiSpeedUpFill className="size-3.5" />
            {copy.rate}
          </span>
          {RATE_OPTIONS.map((option) => {
            const isActive = rate === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setRate(option)}
                className={cn(
                  'rounded-full px-3 py-1.5 font-medium text-xs transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                )}
                aria-pressed={isActive}
              >
                {option}x
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
