import { useEffect } from 'react';

type PageMeta = {
  title: string;
  description?: string;
};

export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    let meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? '';
    if (description) {
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', description);
    }
    return () => {
      document.title = previousTitle;
      if (meta && description) {
        meta.setAttribute('content', previousDescription);
      }
    };
  }, [title, description]);
}
