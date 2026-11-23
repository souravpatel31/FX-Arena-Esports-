import React, { useState, useEffect, useRef } from 'react';
import { APP_LOGO_URL } from '../utils/assetUrl';

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackSrc?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  showLoader?: boolean;
}

const APP_LOGO = APP_LOGO_URL;

function isInstantSource(value?: string): boolean {
  if (!value) return true;
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('/') ||
    value.startsWith('./')
  );
}

export default function SafeImage({
  src,
  alt = 'Image',
  className = '',
  imgClassName = '',
  fallbackSrc = APP_LOGO,
  objectFit = 'cover',
}: SafeImageProps) {
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string>(src || fallbackSrc);
  const [loaded, setLoaded] = useState<boolean>(() => isInstantSource(src));
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setError(false);
    const nextSrc = src || fallbackSrc;
    setCurrentSrc(nextSrc);
    if (isInstantSource(nextSrc)) {
      setLoaded(true);
    } else if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    } else {
      setLoaded(false);
    }
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (!error && currentSrc !== fallbackSrc) {
      setError(true);
      setCurrentSrc(fallbackSrc);
      setLoaded(true);
    } else {
      setLoaded(true);
    }
  };

  const handleLoad = () => {
    setLoaded(true);
  };

  return (
    <div className={`relative overflow-hidden bg-neutral-900 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-[#0d1630] to-neutral-900 animate-pulse" />
      )}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading="eager"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        style={{ objectFit }}
        className={`w-full h-full relative z-10 transition-opacity duration-150 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName}`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
