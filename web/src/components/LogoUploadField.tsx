import { useEffect, useId, useState } from 'react';

type LogoUploadFieldProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  currentLogoUrl?: string | null;
  label?: string;
  hint?: string;
  accentColor?: string;
  dropzoneTitle?: string;
  dropzoneSubtitle?: string;
  previewAlt?: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LogoUploadField({
  value,
  onChange,
  currentLogoUrl = null,
  label = 'Logo (optional)',
  hint = 'PNG, JPG, WebP, or SVG. Square logos work best (at least 256×256).',
  accentColor = '#1A56DB',
  dropzoneTitle = 'Upload your business logo',
  dropzoneSubtitle = 'Click to choose an image file',
  previewAlt = 'Image preview',
}: LogoUploadFieldProps) {
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const displayUrl = previewUrl ?? currentLogoUrl;
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
  const allowedExtensions = /\.(png|jpe?g|webp|svg)$/i;

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      setDimensions(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(value);
    setPreviewUrl(objectUrl);

    if (value.type === 'image/svg+xml') {
      setDimensions('SVG');
      return () => URL.revokeObjectURL(objectUrl);
    }

    const image = new Image();
    image.onload = () => {
      setDimensions(`${image.naturalWidth}×${image.naturalHeight}`);
    };
    image.onerror = () => setDimensions(null);
    image.src = objectUrl;

    return () => URL.revokeObjectURL(objectUrl);
  }, [value]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      onChange(null);
      setFileError(null);
      return;
    }
    const typeOk = !file.type || allowedTypes.has(file.type);
    const nameOk = allowedExtensions.test(file.name);
    if (!typeOk || !nameOk) {
      setFileError('Upload a PNG, JPG, WebP, or SVG image.');
      onChange(null);
      return;
    }
    setFileError(null);
    onChange(file);
  }

  function handleClear() {
    setFileError(null);
    onChange(null);
  }

  return (
    <div className="logo-upload-field">
      <label className="wizard-section-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="logo-upload-panel" style={{ borderColor: accentColor }}>
        {displayUrl ? (
          <div className="logo-upload-preview">
            <div
              className="logo-upload-preview-frame"
              style={{ background: `linear-gradient(135deg, ${accentColor}22, #ffffff)` }}
            >
              <img src={displayUrl} alt={previewAlt} className="logo-upload-preview-image" />
            </div>
            <div className="logo-upload-meta">
              <strong>{value?.name ?? (currentLogoUrl ? 'Current logo' : 'Logo')}</strong>
              <span>
                {value ? formatFileSize(value.size) : 'Uploaded logo'}
                {dimensions ? ` · ${dimensions}` : ''}
              </span>
              <div className="logo-upload-actions">
                <label htmlFor={inputId} className="logo-upload-replace">
                  Replace
                </label>
                <button type="button" className="logo-upload-clear" onClick={handleClear}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label htmlFor={inputId} className="logo-upload-dropzone">
            <span className="logo-upload-dropzone-title">{dropzoneTitle}</span>
            <span className="logo-upload-dropzone-subtitle">{dropzoneSubtitle}</span>
          </label>
        )}
        <input
          id={inputId}
          className="logo-upload-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleFileChange}
        />
      </div>
      {fileError ? (
        <p className="field-error" role="alert" style={{ marginTop: 8 }}>
          {fileError}
        </p>
      ) : (
        <p className="wizard-hint">{hint}</p>
      )}
    </div>
  );
}

export default LogoUploadField;
