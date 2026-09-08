export const IE_ORBIT_LOGO_SRC = '/brand/ie-orbit-logo.png';

type BrandLockupProps = {
  className?: string;
  wordmark?: boolean;
};

export function BrandLockup({ className, wordmark = true }: BrandLockupProps) {
  return (
    <span className={['brand-lockup', className].filter(Boolean).join(' ')}>
      <img src={IE_ORBIT_LOGO_SRC} alt="" className="brand-lockup-mark" />
      {wordmark ? <span className="brand-lockup-wordmark">IE Orbit</span> : null}
    </span>
  );
}
