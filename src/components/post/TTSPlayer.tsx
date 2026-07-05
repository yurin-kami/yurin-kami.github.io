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
    empty:
      '\u8aad\u307f\u4e0a\u3052\u3067\u304d\u308b\u672c\u6587\u30c6\u30ad\u30b9\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002',
    error:
      '\u518d\u751f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002',
    pause: '\u4e00\u6642\u505c\u6b62',
    play: '\u518d\u751f',
    progress: (current: number, total: number) => `\u6bb5\u843d ${current} / ${total}`,
    rate: '\u901f\u5ea6',
    ready: (count: number) => `${count} \u6bb5\u843d\u3092\u518d\u751f\u3067\u304d\u307e\u3059`,
    resume: '\u518d\u958b',
    sectionLabel: '\u8a18\u4e8b\u306e\u97f3\u58f0\u8aad\u307f\u4e0a\u3052',
    statusIdle: '\u8a18\u4e8b\u3092\u8aad\u307f\u4e0a\u3052\u308b\u6e96\u5099\u304c\u3067\u304d\u3066\u3044\u307e\u3059\u3002',
    statusPaused: '\u8aad\u307f\u4e0a\u3052\u3092\u4e00\u6642\u505c\u6b62\u3057\u3066\u3044\u307e\u3059\u3002',
    statusPlaying: '\u8a18\u4e8b\u3092\u8aad\u307f\u4e0a\u3052\u3066\u3044\u307e\u3059\u3002',
    stop: '\u505c\u6b62',
    title: '\u3053\u306e\u8a18\u4e8b\u3092\u8aad\u3080',
    unsupported:
      '\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u306f\u97f3\u58f0\u5408\u6210\u3092\u30b5\u30dd\u30fc\u30c8\u3057\u3066\u3044\u307e\u305b\u3093\u3002',
  },
  zh: {
    empty: '\u672a\u627e\u5230\u53ef\u7528\u4e8e\u6717\u8bfb\u7684\u6b63\u6587\u5185\u5bb9\u3002',
    error: '\u6717\u8bfb\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
    pause: '\u6682\u505c\u6717\u8bfb',
    play: '\u5f00\u59cb\u6717\u8bfb',
    progress: (current: number, total: number) => `\u6bb5\u843d ${current} / ${total}`,
    rate: '\u8bed\u901f',
    ready: (count: number) => `\u5171 ${count} \u6bb5\uff0c\u5df2\u51c6\u5907\u5c31\u7eea`,
    resume: '\u7ee7\u7eed\u6717\u8bfb',
    sectionLabel: '\u6587\u7ae0\u8bed\u97f3\u6717\u8bfb',
    statusIdle: '\u51c6\u5907\u597d\u540e\u53ef\u4ee5\u5f00\u59cb\u6717\u8bfb\u3002',
    statusPaused: '\u6717\u8bfb\u5df2\u6682\u505c\u3002',
    statusPlaying: '\u6b63\u5728\u6717\u8bfb\u6587\u7ae0\u5185\u5bb9\u3002',
    stop: '\u505c\u6b62\u6717\u8bfb',
    title: '\u6717\u8bfb\u672c\u6587',
    unsupported: '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u8bed\u97f3\u6717\u8bfb\u3002',
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
