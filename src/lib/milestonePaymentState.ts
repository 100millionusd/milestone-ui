// ==== SAFE PAYMENT POLLING ONLY ====
async function pollUntilPaid(bidId: number, milestoneIndex: number) {
  const key = mkKey(bidId, milestoneIndex);
  if (pollers.current.has(key)) return;
  pollers.current.add(key);

  console.log(`🚀 Starting SAFE payment status check for ${key}`);

  try {
    let executedStreak = 0; // require 2 consecutive "executed" to avoid a fluke

    // Poll for up to 10 minutes
    for (let i = 0; i < 120; i++) {
      console.log(`📡 Safe payment check ${i + 1}/120 for ${key}`);

      // 1) Fetch fresh bid from the server
      let bid: any | null = null;
      try {
        bid = await getBid(bidId);
      } catch (err: any) {
        console.error('Error fetching bid:', err);
        if (err?.status === 401 || err?.status === 403) {
          setError('Your session expired. Please sign in again.');
          break;
        }
      }

      const m = bid?.milestones?.[milestoneIndex];

      // 2) If server already thinks it's paid → finish
      if (m && msIsPaid(m)) {
        console.log('🎉 PAYMENT CONFIRMED BY SERVER! Updating UI...');
        removePending(key);
        setPaidOverrideKey(key, false);

        // update local copy of this milestone
        setBids((prev) =>
          prev.map((b) => {
            const match = ((b as any).bidId ?? (b as any).id) === bidId;
            if (!match) return b;
            const ms = Array.isArray((b as any).milestones) ? [...(b as any).milestones] : [];
            ms[milestoneIndex] = { ...ms[milestoneIndex], ...m };
            return { ...b, milestones: ms };
          })
        );

        try { (await import('@/lib/api')).invalidateBidsCache?.(); } catch {}
        router.refresh();
        emitPayDone(bidId, milestoneIndex);
        return;
      }

      // 3) Check Safe execution directly; if executed twice consecutively → flip UI locally
      const safeHash = m ? readSafeTxHash(m) : null;
      if (safeHash) {
        const safeStatus = await fetchSafeTx(safeHash);
        if (safeStatus?.isExecuted) {
          executedStreak++;
          if (executedStreak >= 2) {
            console.log('✅ SAFE EXECUTED ON-CHAIN → Optimistically marking Paid (local override).');
            setPaidOverrideKey(key, true);
            removePending(key);
            emitPayDone(bidId, milestoneIndex);
            router.refresh();
            // optional: gentle refresh later to pick up server reconcile if it lags
            setTimeout(() => loadProofs(true), 15000);
            return;
          }
        } else {
          executedStreak = 0;
        }
      }

      // 4) Wait 5s and try again
      await new Promise((r) => setTimeout(r, 5000));
    }

    console.log('🛑 Stopping Safe payment status check - time limit reached');
    removePending(key);
  } finally {
    pollers.current.delete(key);
  }
}
