import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getStatus } from '../api/status';

interface FeaturesState {
  features: string[];
  loading: boolean;
  hasFeature: (feature: string) => boolean;
}

const FeaturesContext = createContext<FeaturesState | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStatus()
      .then(status => setFeatures(status.enabledFeatures ?? []))
      .catch(() => setFeatures([]))
      .finally(() => setLoading(false));
  }, []);

  const hasFeature = (feature: string) => features.includes(feature);

  return (
    <FeaturesContext.Provider value={{ features, loading, hasFeature }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): FeaturesState {
  const ctx = useContext(FeaturesContext);
  if (!ctx) throw new Error('useFeatures must be used within FeaturesProvider');
  return ctx;
}
