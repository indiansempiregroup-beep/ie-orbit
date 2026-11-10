import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getIndustryShots, type IndustryShotSet } from './industryShots';

const INTERVAL_MS = 5000;

type IndustryShotContextValue = {
  index: number;
  industry: IndustryShotSet;
  shots: IndustryShotSet[];
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
  const { t } = useTranslation();
  const shots = useMemo(() => getIndustryShots(t), [t]);
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndexState] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion || paused) return undefined;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      setIndexState((current) => (current + 1) % shots.length);
    };
    const timer = window.setInterval(tick, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, shots.length]);

  const setIndex = useCallback((next: number) => {
    const length = shots.length;
    setIndexState(((next % length) + length) % length);
  }, [shots.length]);

  const value = useMemo<IndustryShotContextValue>(() => {
    const resolvedIndex = reducedMotion ? 0 : index;
    return {
      index: resolvedIndex,
      industry: shots[resolvedIndex],
      shots,
      reducedMotion,
      pause: () => setPaused(true),
      resume: () => setPaused(false),
      setIndex,
    };
  }, [index, reducedMotion, setIndex, shots]);

  return <IndustryShotContext.Provider value={value}>{children}</IndustryShotContext.Provider>;
}

export function useIndustryShot() {
  const value = useContext(IndustryShotContext);
  if (!value) {
    throw new Error('useIndustryShot must be used inside IndustryShotRotationProvider.');
  }
  return value;
}
