import { useState, useEffect, useRef } from 'react';

const globalCache = new Map<string, { data: any; timestamp: number }>();

interface CacheOptions {
  ttl?: number;
}

export const useApiCache = <T>(
  url: string, 
  options?: RequestInit & CacheOptions
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cacheKey = `${url}-${JSON.stringify(options)}`;
    
    const isCacheValid = (entry: { data: any; timestamp: number }) => {
      const ttl = options?.ttl || 300000; // 5 minutes default
      return Date.now() - entry.timestamp < ttl;
    };

    if (globalCache.has(cacheKey) && isCacheValid(globalCache.get(cacheKey)!)) {
      setData(globalCache.get(cacheKey)!.data);
      setLoading(false);
      return;
    }

    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);

    fetch(url, {
      ...options,
      signal: abortControllerRef.current.signal
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(fetchedData => {
        globalCache.set(cacheKey, {
          data: fetchedData,
          timestamp: Date.now()
        });
        setData(fetchedData);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [url, JSON.stringify(options)]);

  return { data, loading, error };
};