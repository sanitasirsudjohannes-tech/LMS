'use client';

import React, { useEffect, useRef, useState } from 'react';

interface LoadingBubbleProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  className?: string;
}

const sizeMap = {
  sm: { px: 48, font: 'text-xs' },
  md: { px: 72, font: 'text-xs font-semibold' },
  lg: { px: 100, font: 'text-sm font-semibold' },
  xl: { px: 132, font: 'text-base font-bold' }
};

export default function LontarLoadingSpinner({
  size = 'lg',
  text,
  className = ''
}: LoadingBubbleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const [isMounted, setIsMounted] = useState(false);

  const cfg = sizeMap[size];

  useEffect(() => {
    setIsMounted(true);
    mountedRef.current = true;

    const init = async () => {
      const ldBarModule = await import('@loadingio/loading-bar');
      const LdBar = ldBarModule.default || ldBarModule;

      if (!mountedRef.current || !containerRef.current) return;

      const el = containerRef.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (el as any).ldBar;
      el.innerHTML = '';

      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const primary = prefersDark ? '#38bdf8' : '#0077ff';
      const secondary = prefersDark ? '#22d3ee' : '#36c7e8';
      const trail = prefersDark ? '#334155' : '#cbd5e1';
      const background = prefersDark ? '#1e293b' : '#e2e8f0';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance = new (LdBar as any)(el, {
        preset: 'bubble',
        'fill': `data:ldbar/res,bubble(${primary},${secondary})`,
        'fill-background': background,
        'fill-background-extrude': 2,
        'stroke': primary,
        'stroke-width': 3,
        'stroke-trail': trail,
        'stroke-trail-width': 0.5,
        'pattern-size': 150,
        'set-dim': false,
        'value': 0,
        'duration': 0.6
      });

      const label = el.querySelector('.ldBar-label') as HTMLElement | null;
      if (label) label.style.display = 'none';

      let val = 0;
      let step = 1.2;
      const loop = () => {
        if (!mountedRef.current) return;
        val += step;
        if (val >= 100) { val = 100; step = -1.2; }
        else if (val <= 0) { val = 0; step = 1.2; }
        instance.set(val);
        animRef.current = requestAnimationFrame(loop);
      };
      loop();
    };

    void init();

    return () => {
      mountedRef.current = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (containerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (containerRef.current as any).ldBar;
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-3 py-4 ${className}`} suppressHydrationWarning>
      {!isMounted ? (
        <div
          style={{ width: cfg.px, height: cfg.px }}
          className="rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse"
        />
      ) : (
        <div
          ref={containerRef}
          className="ldBar label-center"
          style={{ width: cfg.px, height: cfg.px }}
          data-preset="bubble"
        />
      )}
      {text && (
        <span className={`${cfg.font} text-slate-600 dark:text-slate-300 tracking-wide animate-pulse`}>
          {text}
        </span>
      )}
    </div>
  );
}
