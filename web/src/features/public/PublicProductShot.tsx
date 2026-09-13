import { INDUSTRY_SHOTS, slidesForSlot, type ProductShotSlot } from './industryShots';
import { useIndustryShot } from './IndustryShotRotation';

type PublicProductShotProps = {
  slot: ProductShotSlot;
  className?: string;
  loading?: 'lazy' | 'eager';
};

export function PublicProductShot({ slot, className, loading = 'lazy' }: PublicProductShotProps) {
  const { index, industry, reducedMotion, pause, resume, setIndex } = useIndustryShot();
  const slides = slidesForSlot(slot);
  const current = slides[index];
  const variant = current.variant;

  return (
    <div
      className={`public-shot public-shot--${variant}${className ? ` ${className}` : ''}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <figure className={`public-device public-device--${variant}`}>
        {variant === 'desktop' ? (
          <div className="public-device__chrome" aria-hidden="true">
            <span />
            <span />
            <span />
            <small>{current.title ?? industry.name}</small>
          </div>
        ) : (
          <div className="public-device__notch" aria-hidden="true" />
        )}
        <span className="public-device__pill">{industry.name}</span>
        <div className="public-device__stage">
          {slides.map((slide, slideIndex) => (
            <img
              key={`${slide.src}-${slideIndex}`}
              src={slide.src}
              alt={slideIndex === index ? slide.alt : ''}
              width={slide.variant === 'phone' ? 390 : 1440}
              height={slide.variant === 'phone' ? 844 : 900}
              loading={loading}
              className={slideIndex === index ? 'is-active' : undefined}
              aria-hidden={slideIndex !== index}
            />
          ))}
        </div>
      </figure>
      {reducedMotion ? null : (
        <div className="public-device__dots" role="tablist" aria-label="Industry screenshots">
          {INDUSTRY_SHOTS.map((entry, slideIndex) => (
            <button
              key={entry.slug}
              type="button"
              role="tab"
              className={slideIndex === index ? 'is-active' : undefined}
              aria-selected={slideIndex === index}
              aria-label={entry.name}
              onClick={() => setIndex(slideIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
