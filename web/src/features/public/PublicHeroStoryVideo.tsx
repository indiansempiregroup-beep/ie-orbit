import { useRef, useState } from 'react';
import { VolumeX } from 'lucide-react';

const STORY_VIDEO_SRC = '/marketing/home-orbit-story.mp4?v=20261110p';
const STORY_POSTER_SRC = '/marketing/home-orbit-story-poster.jpg?v=20261110p';

export function PublicHeroStoryVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const backdropRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  function syncBackdropTime(force = false) {
    const video = videoRef.current;
    const backdrop = backdropRef.current;
    if (!video || !backdrop) return;
    if (force || Math.abs(backdrop.currentTime - video.currentTime) > 0.35) {
      try {
        backdrop.currentTime = video.currentTime;
      } catch {
        // Ignore seek race while metadata is still loading.
      }
    }
  }

  function unmute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    void video.play().catch(() => {
      // Browser may still require a direct controls unmute; hint can stay until then.
    });
  }

  return (
    <section className="public-story-video" aria-label="How Orbit Appoint and Orbit Mart help your business">
      <div className="public-story-video__stage">
        <video
          ref={backdropRef}
          className="public-story-video__backdrop"
          autoPlay
          muted
          playsInline
          preload="metadata"
          poster={STORY_POSTER_SRC}
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src={STORY_VIDEO_SRC} type="video/mp4" />
        </video>
        <div className="public-story-video__frame">
          <video
            ref={videoRef}
            className="public-story-video__media"
            autoPlay
            muted
            playsInline
            controls
            preload="metadata"
            poster={STORY_POSTER_SRC}
            onPlay={() => {
              const backdrop = backdropRef.current;
              if (!backdrop) return;
              syncBackdropTime(true);
              void backdrop.play().catch(() => {});
            }}
            onPause={() => {
              backdropRef.current?.pause();
            }}
            onSeeked={() => syncBackdropTime(true)}
            onTimeUpdate={() => syncBackdropTime()}
            onVolumeChange={(event) => {
              setMuted(event.currentTarget.muted || event.currentTarget.volume === 0);
            }}
            onEnded={(event) => {
              event.currentTarget.pause();
              backdropRef.current?.pause();
            }}
          >
            <source src={STORY_VIDEO_SRC} type="video/mp4" />
          </video>
          {muted ? (
            <button type="button" className="public-story-video__unmute" onClick={unmute}>
              <VolumeX size={16} aria-hidden="true" />
              Please unmute
            </button>
          ) : null}
        </div>
      </div>
      <p className="public-story-video__caption">
        Orbit Appoint · Orbit Mart POS · Online Delivery with live tracking
      </p>
    </section>
  );
}
