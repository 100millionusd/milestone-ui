// src/lib/apiBase.ts
export const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '') ||
  'https://milestone-api-production.up.railway.app';
