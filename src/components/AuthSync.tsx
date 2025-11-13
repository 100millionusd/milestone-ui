'use client';
import { useEffect } from 'react';
import { syncJwtCookieFromLocalStorage } from '@/lib/api';

export default function AuthSync() {
  useEffect(() => { syncJwtCookieFromLocalStorage(); }, []);
  return null;
}
