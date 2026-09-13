import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { INDUSTRY_SHOTS, type IndustryShotSet } from './industryShots';

const INTERVAL_MS = 5000;

type IndustryShotContextValue = {
  index: number;
  industry: IndustryShotSet;
  reducedMotion: boolean;
  pause: () => void;
  resume: () => void;
  setIndex: (index: number) => void;
};

const IndustryShotContext = createContext<IndustryShotContextValue | null>(null);

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

export function IndustryShotRotationProvider({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndexState] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion || paused) return undefined;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      setIndexState((current) => (current + 1) % INDUSTRY_SHOTS.length);
    };
    const timer = window.setInterval(tick, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const setIndex = useCallback((next: number) => {
    const length = INDUSTRY_SHOTS.length;
    setIndexState(((next % length) + length) % length);
  }, []);

  const value = useMemo<IndustryShotContextValue>(() => {
    const resolvedIndex = reducedMotion ? 0 : index;
    return {
      index: resolvedIndex,
      industry: INDUSTRY_SHOTS[resolvedIndex],
      reducedMotion,
      pause: () => setPaused(true),
      resume: () => setPaused(false),
      setIndex,
    };
  }, [index, reducedMotion, setIndex]);

  return <IndustryShotContext.Provider value={value}>{children}</IndustryShotContext.Provider>;
}

export function useIndustryShot() {
  const value = useContext(IndustryShotContext);
  if (!value) {
    throw new Error('useIndustryShot must be used inside IndustryShotRotationProvider.');
  }
  return value;
}
