import { useRef, useState } from 'react';
import { VolumeX } from 'lucide-react';

export function PublicHeroStoryVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

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
      <div className="public-story-video__frame">
        <video
          ref={videoRef}
          className="public-story-video__media"
          autoPlay
          muted
          playsInline
          controls
          preload="metadata"
          poster="/marketing/home-orbit-story-poster.jpg?v=20261110k"
          onVolumeChange={(event) => {
            setMuted(event.currentTarget.muted || event.currentTarget.volume === 0);
          }}
          onEnded={(event) => {
            event.currentTarget.pause();
          }}
        >
          <source src="/marketing/home-orbit-story.mp4?v=20261110k" type="video/mp4" />
        </video>
        {muted ? (
          <button type="button" className="public-story-video__unmute" onClick={unmute}>
            <VolumeX size={16} aria-hidden="true" />
            Please unmute
          </button>
        ) : null}
      </div>
      <p className="public-story-video__caption">
        Orbit Appoint · Orbit Mart POS · Online Delivery with live tracking
      </p>
    </section>
  );
}
