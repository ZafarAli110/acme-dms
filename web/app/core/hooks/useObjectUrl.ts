import {useEffect, useState} from 'react';

/**
 * A URL for showing a Blob or File in an <img>, released when it is no longer shown. It is made inside the effect:
 * each setup makes its own URL and its cleanup releases only that one. Made in useMemo instead, React's development
 * double run of effects released the URL the image was still using.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
