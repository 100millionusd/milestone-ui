// hooks/usePaymentState.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

const PENDING_PAYMENT_KEY = 'mx_pay_pending';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';

export function usePaymentState() {
  const [pendingPayments, setPendingPayments] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    
    try {
      const stored = localStorage.getItem(PENDING_PAYMENT_KEY);
      if (stored) {
        const pendingArray = JSON.parse(stored) as string[];
        return new Set(pendingArray);
      }
    } catch (error) {
      console.warn('Failed to load pending payments from localStorage:', error);
    }
    
    return new Set();
  });

  // Save to localStorage whenever pendingPayments changes
  useEffect(() => {
    try {
      localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify([...pendingPayments]));
    } catch (error) {
      console.warn('Failed to save pending payments to localStorage:', error);
    }
  }, [pendingPayments]);

  const addPendingPayment = useCallback((key: string) => {
    const timestamp = Date.now();
    
    setPendingPayments(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    
    // Store timestamp for TTL cleanup
    try {
      localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, timestamp.toString());
    } catch (error) {
      console.warn('Failed to save payment timestamp:', error);
    }
  }, []);

  const removePendingPayment = useCallback((key: string) => {
    setPendingPayments(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    
    try {
      localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`);
    } catch (error) {
      console.warn('Failed to remove payment timestamp:', error);
    }
  }, []);

  const cleanupStalePayments = useCallback(() => {
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes
    
    setPendingPayments(prev => {
      const next = new Set(prev);
      let changed = false;
      
      for (const key of next) {
        try {
          const timestampStr = localStorage.getItem(`${PENDING_TS_PREFIX}${key}`);
          if (timestampStr) {
            const timestamp = parseInt(timestampStr, 10);
            if (now - timestamp > MAX_AGE) {
              next.delete(key);
              localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`);
              changed = true;
            }
          }
        } catch (error) {
          // If we can't read the timestamp, remove the payment
          next.delete(key);
          changed = true;
        }
      }
      
      return changed ? next : prev;
    });
  }, []);

  const isPaymentPending = useCallback((key: string) => {
    return pendingPayments.has(key);
  }, [pendingPayments]);

  return {
    pendingPayments,
    addPendingPayment,
    removePendingPayment,
    cleanupStalePayments,
    isPaymentPending
  };
}