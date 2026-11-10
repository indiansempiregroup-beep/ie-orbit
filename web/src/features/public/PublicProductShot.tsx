import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { slideForSlot, slidesForSlot, type ProductShotSlot } from './industryShots';
import { useIndustryShot } from './IndustryShotRotation';

type PublicProductShotProps = {
  slot: ProductShotSlot;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** When false, show one fixed screenshot (no industry carousel). */
  rotate?: boolean;
};

export function PublicProductShot({
  slot,
  className,
  loading = 'lazy',
  rotate = true,
}: PublicProductShotProps) {
  const { t } = useTranslation();
  const { index, industry, shots, reducedMotion, pause, resume, setIndex } = useIndustryShot();
  const slides = useMemo(() => slidesForSlot(slot, shots, t), [slot, shots, t]);
  const staticIndustry = useMemo(
    () => shots.find((entry) => entry.slug === 'salon-spa') ?? shots[0]!,
    [shots],
  );
  const staticSlide = useMemo(() => slideForSlot(staticIndustry, slot, t), [staticIndustry, slot, t]);
  const current = rotate ? slides[index]! : staticSlide;
  const activeIndustry = rotate ? industry : staticIndustry;
  const variant = current.variant;

  return (
    <div
      className={`public-shot public-shot--${variant}${className ? ` ${className}` : ''}`}
      onMouseEnter={rotate ? pause : undefined}
      onMouseLeave={rotate ? resume : undefined}
    >
      <figure className={`public-device public-device--${variant}`}>
        {variant === 'desktop' ? (
          <div className="public-device__chrome" aria-hidden="true">
            <span />
            <span />
            <span />
            <small>{current.title ?? activeIndustry.name}</small>
          </div>
        ) : (
          <div className="public-device__notch" aria-hidden="true" />
        )}
        {rotate ? <span className="public-device__pill">{activeIndustry.name}</span> : null}
        <div className="public-device__stage">
          {rotate ? (
            slides.map((slide, slideIndex) => (
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
            ))
          ) : (
            <img
              src={staticSlide.src}
              alt={staticSlide.alt}
              width={staticSlide.variant === 'phone' ? 390 : 1440}
              height={staticSlide.variant === 'phone' ? 844 : 900}
              loading={loading}
              className="is-active"
            />
          )}
        </div>
      </figure>
      {rotate && !reducedMotion ? (
        <div className="public-device__dots" role="tablist" aria-label={t('public.industries.shots.dotsLabel')}>
          {shots.map((entry, slideIndex) => (
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
      ) : null}
    </div>
  );
}
