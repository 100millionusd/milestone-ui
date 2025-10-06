'use client';
import '@/lib/auth-injector';

export default function ClientBootstrap({ children }: { children: React.ReactNode }) {
  // The import above runs once in the browser and installs the fetch injector.
  return <>{children}</>;
}
