import { useEffect, useRef, useState } from 'preact/hooks';

interface MapEmbedProps {
  src: string;
  title: string;
  width?: string;
  height?: string;
}

export default function MapEmbed({ src, title, width = '100%', height = '200' }: MapEmbedProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} class="mt-6">
      {isLoaded ? (
        <iframe
          src={src}
          width={width}
          height={height}
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={title}
          class="rounded"
        />
      ) : (
        <div
          class="rounded bg-gray-800 animate-pulse"
          style={{ width, height: `${height}px` }}
        >
          <div class="flex items-center justify-center h-full text-gray-400">
            <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
