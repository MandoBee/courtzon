import { useState } from 'react';
import { resolveUploadUrl } from '../../utils/media';

interface Props {
  images: string[];
  name: string;
}

export default function ImageGallery({ images, name }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images.length) {
    return (
      <div className="w-full aspect-square rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 flex items-center justify-center text-5xl font-bold text-[var(--color-primary)]">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {/* Thumbnail column */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[400px] shrink-0">
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={`w-16 h-16 rounded-[var(--radius-sm)] overflow-hidden border-2 transition-colors cursor-pointer bg-[var(--color-primary)]/5 shrink-0 ${
              i === activeIndex
                ? 'border-[var(--color-primary)]'
                : 'border-transparent hover:border-[var(--color-primary)]/50'
            }`}
          >
            <img
              src={resolveUploadUrl(img)}
              alt={`${name} ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Main image */}
      <button
        type="button"
        onClick={() => setLightboxIndex(activeIndex)}
        className="flex-1 aspect-square rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-primary)]/5 border border-[var(--color-border)] cursor-pointer"
      >
        <img
          src={resolveUploadUrl(images[activeIndex])}
          alt={name}
          className="w-full h-full object-contain"
        />
      </button>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-70 z-10"
          >
            &times;
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev! - 1 + images.length) % images.length);
                }}
                className="absolute left-4 text-white text-4xl leading-none hover:opacity-70 z-10 px-2"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev! + 1) % images.length);
                }}
                className="absolute right-4 text-white text-4xl leading-none hover:opacity-70 z-10 px-2"
              >
                ›
              </button>
            </>
          )}

          <img
            src={resolveUploadUrl(images[lightboxIndex])}
            alt={`${name} ${lightboxIndex + 1}`}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {images.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full ${
                    i === lightboxIndex ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
