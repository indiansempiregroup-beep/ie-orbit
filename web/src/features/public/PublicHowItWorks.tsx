import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VolumeX } from 'lucide-react';

const VIDEO_SRC = '/marketing/how-orbit-works.mp4?v=20261110v';
const POSTER_SRC = '/marketing/how-orbit-works-poster.jpg?v=20261110v';

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

export function PublicHowItWorks() {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '-12% 0px', threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return undefined;

    if (!inView) {
      video.pause();
      return undefined;
    }

    // Autoplay/resume only until the first full playthrough finishes.
    if (!ended) {
      void video.play().catch(() => {
        // Autoplay can still be blocked; controls remain available.
      });
    }
    return undefined;
  }, [ended, inView, reducedMotion]);

  function unmute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    if (ended) {
      // If they unmute after it finished muted, replay once with audio.
      video.currentTime = 0;
      setEnded(false);
    }
    void video.play().catch(() => {
      // Browser may still require native controls unmute.
    });
  }

  return (
    <section
      ref={sectionRef}
      className="public-how-band"
      aria-label={t('public.home.howAria')}
    >
      <div className="public-path-inner">
        <div className="public-section-intro public-how-band__intro">
          <div>
            <p className="public-kicker">{t('public.home.howKicker')}</p>
            <h2>{t('public.home.howTitle')}</h2>
          </div>
          <p>{t('public.home.howLead')}</p>
        </div>

        <div className="public-how-band__stage">
          <video
            ref={videoRef}
            className="public-how-band__video"
            muted
            playsInline
            controls
            preload="metadata"
            poster={POSTER_SRC}
            onPlay={() => setEnded(false)}
            onEnded={(event) => {
              event.currentTarget.pause();
              setEnded(true);
            }}
            onVolumeChange={(event) => {
              setMuted(event.currentTarget.muted || event.currentTarget.volume === 0);
            }}
          >
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
          {muted ? (
            <button type="button" className="public-how-band__unmute" onClick={unmute}>
              <VolumeX size={16} aria-hidden="true" />
              Please unmute
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
