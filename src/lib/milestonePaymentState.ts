async function pollUntilPaid(
  bidId: number,
  milestoneIndex: number,
  tries = 200, // Increased to allow more time for reconciliation
  intervalMs = 3000
) {
  const key = mkKey(bidId, milestoneIndex);
  if (pollers.current.has(key)) return;
  pollers.current.add(key);

  console.log(`🚀 Starting polling for ${key}, max tries: ${tries}`);

  try {
    for (let i = 0; i < tries; i++) {
      console.log(`📡 Poll attempt ${i + 1}/${tries} for ${key}`);
      
      // 1) CRITICAL: Trigger reconciliation FIRST - this updates 'pending' → 'released'
      console.log('🔄 Triggering Safe reconciliation...');
      await callReconcileSafe();

      // 2) Wait a moment for reconciliation to process
      await new Promise(r => setTimeout(r, 1000));

      // 3) Pull latest bid data AFTER reconciliation
      let bid: any | null = null;
      try {
        bid = await getBid(bidId);
        console.log('📋 Bid data received after reconciliation:', bid);
      } catch (err: any) {
        console.error('❌ Error fetching bid:', err);
        if (err?.status === 401 || err?.status === 403) {
          setError('Your session expired. Please sign in again.');
          break;
        }
      }
      
      const m = bid?.milestones?.[milestoneIndex];
      console.log('🎯 Milestone data after reconciliation:', m);

      // 4) Check if reconciliation marked the payment as 'released'
      const isCurrentlyPaid = m ? msIsPaid(m) : false;
      console.log('💰 Payment status after reconciliation:', { isCurrentlyPaid });

      if (isCurrentlyPaid) {
        console.log('✅ Payment marked as RELEASED by reconciliation!');
        removePending(key);
        
        // Update local state with the reconciled data
        setBids((prev) =>
          prev.map((b) => {
            const match = ((b as any).bidId ?? (b as any).id) === bidId;
            if (!match) return b;
            const ms = Array.isArray((b as any).milestones) ? [...(b as any).milestones] : [];
            ms[milestoneIndex] = { ...ms[milestoneIndex], ...(m as any) };
            return { ...b, milestones: ms };
          })
        );
        
        // Clear cache and refresh
        try {
          (await import('@/lib/api')).invalidateBidsCache?.();
        } catch {}
        if (typeof router?.refresh === 'function') router.refresh();
        emitPayDone(bidId, milestoneIndex);
        console.log('✅ Payment flow completed successfully');
        return;
      }

      // 5) Also check Safe transaction status directly as backup
      const safeHash = m ? readSafeTxHash(m) : null;
      console.log('🔍 Safe hash detected:', safeHash);
      
      if (safeHash) {
        const safe = await fetchSafeTx(safeHash);
        console.log('🔍 Safe transaction status:', safe);
        
        if (safe?.isExecuted && safe?.txHash) {
          console.log('✅ Safe transaction executed, but reconciliation not yet processed');
          // Transaction is executed but reconciliation hasn't run yet
          // We'll continue polling to let reconciliation catch up
        }
      }

      console.log('⏳ Waiting for reconciliation to process...');
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    console.log('🛑 Polling ended - max attempts reached');
    // Even if polling ends, remove pending to allow retry
    removePending(key);
  } finally {
    pollers.current.delete(key);
    console.log('🧹 Cleaned up poller for', key);
  }
}