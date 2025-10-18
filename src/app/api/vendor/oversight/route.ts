// REMOVE the mock transaction hash generation function
// DELETE THIS:
function generateMockTxHash(bidId: number, milestoneIndex: number): string {
  const baseHash = '0x' + 
    bidId.toString(16).padStart(8, '0') + 
    milestoneIndex.toString(16).padStart(4, '0') + 
    Date.now().toString(16).slice(-8) + 
    Math.random().toString(16).slice(2, 10);
  
  return baseHash.length === 66 ? baseHash : baseHash.padEnd(66, '0').slice(0, 66);
}

// Update extractPaymentsFromProofs to ONLY use real transaction hashes
function extractPaymentsFromProofs(proofs: any[], bids: any[]): any[] {
  const payments: any[] = [];
  
  console.log('Extracting payments from proofs:', proofs.length);
  
  for (const proof of proofs) {
    const bidId = proof?.bid_id ?? proof?.bidId;
    
    let milestoneIndex = null;
    if (proof?.name) {
      const match = proof.name.match(/Milestone\s+(\d+)/);
      if (match) {
        milestoneIndex = parseInt(match[1]);
      }
    }
    
    if (!milestoneIndex) {
      milestoneIndex = proof?.milestone_index ?? proof?.milestoneIndex ?? proof?.milestone;
    }
    
    if (!milestoneIndex) {
      milestoneIndex = 1;
    }
    
    if (proof.status === 'paid' || proof.completed === true) {
      console.log(`Creating payment from proof:`, proof);
      
      const bid = bids.find(b => (b.id ?? b.bidId) === bidId);
      
      // ONLY use real transaction hashes - remove mock generation
      const tx_hash = proof?.tx_hash ?? proof?.transaction_hash ?? proof?.payment_tx ?? 
                     proof?.onchain_tx ?? null;
      
      payments.push({
        id: `payment-${bidId}-${milestoneIndex}`,
        bid_id: bidId,
        milestone_index: milestoneIndex,
        amount_usd: proof.amount ?? bid?.priceUsd ?? bid?.amount_usd,
        status: 'completed',
        released_at: proof.paymentDate ?? proof.updated_at ?? proof.created_at,
        created_at: proof.created_at,
        // This will be null until you have real transaction data
        tx_hash: tx_hash,
        description: proof.name ?? proof.title
      });
    }
  }
  
  return payments;
}

// Update extractPaymentsFromBids to ONLY use real transaction hashes
function extractPaymentsFromBids(bids: any[]): any[] {
  const payments: any[] = [];
  
  console.log('Extracting payments from bids:', bids.length);
  
  for (const bid of bids) {
    const bidId = bid?.id ?? bid?.bid_id ?? bid?.bidId;
    
    if (!bidId) continue;

    const paymentFields = [
      bid.payments,
      bid.payouts,
      bid.transactions,
      bid.releases,
      bid.transfers
    ];

    for (const paymentField of paymentFields) {
      if (Array.isArray(paymentField)) {
        console.log(`Found ${paymentField.length} payments in bid ${bidId}`);
        payments.push(...paymentField.map((p: any) => ({
          ...p,
          bid_id: bidId,
          id: p?.id ?? p?.payment_id ?? p?.payout_id ?? `payment-${bidId}-${payments.length}`,
          milestone_index: p?.milestone_index ?? p?.milestoneIndex ?? p?.index ?? p?.milestone ?? 1,
          amount_usd: p?.amount_usd ?? p?.amountUsd ?? p?.amount ?? p?.usd ?? null,
          status: p?.status ?? p?.state ?? 'completed',
          // ONLY use real transaction hashes
          tx_hash: p?.tx_hash ?? p?.transaction_hash ?? p?.hash ?? 
                  p?.txHash ?? p?.transactionHash ?? null
        })));
        break;
      }
    }

    if (payments.length === 0) {
      const singlePayment = bid.payment ?? bid.payout ?? bid.transaction;
      if (singlePayment && typeof singlePayment === 'object') {
        console.log(`Found single payment in bid ${bidId}`);
        payments.push({
          ...singlePayment,
          bid_id: bidId,
          id: singlePayment?.id ?? `payment-${bidId}`,
          milestone_index: singlePayment?.milestone_index ?? 1,
          amount_usd: singlePayment?.amount_usd ?? singlePayment?.amount,
          status: singlePayment?.status ?? 'completed',
          // ONLY use real transaction hashes
          tx_hash: singlePayment?.tx_hash ?? singlePayment?.transaction_hash ?? 
                  singlePayment?.hash ?? null
        });
      }
    }

    if (payments.length === 0 && bid.amount_usd) {
      console.log(`Creating payment for bid ${bidId}`);
      payments.push({
        id: `payment-${bidId}`,
        bid_id: bidId,
        milestone_index: 1,
        amount_usd: bid.amount_usd,
        status: 'completed',
        released_at: bid.updated_at ?? bid.created_at,
        created_at: bid.created_at,
        // No mock transaction hash - will be null until you have real data
        tx_hash: null
      });
    }
  }
  
  return payments;
}

// In the main GET function, remove the mock hash addition
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const cookie = req.headers.get("cookie") || "";
  const headers = { authorization: auth, cookie };

  try {
    let bids: any[] = [];
    
    const bidEndpoints = [
      "/bids?mine=1",
      "/vendor/bids", 
      "/bids"
    ];

    for (const endpoint of bidEndpoints) {
      try {
        const data = await fetchWithAuth(endpoint, headers);
        const bidData = Array.isArray(data) ? data : (data?.bids ?? data ?? []);
        if (bidData.length > 0) {
          bids = bidData;
          console.log(`Found ${bids.length} bids from ${endpoint}`);
          break;
        }
      } catch (error) {
        console.log(`Endpoint ${bidEndpoint} failed:`, error);
        continue;
      }
    }

    let proofs: any[] = [];
    const proofEndpoints = [
      "/vendor/proofs",
      "/proofs?mine=1",
      "/proofs"
    ];

    for (const endpoint of proofEndpoints) {
      try {
        const data = await fetchWithAuth(endpoint, headers);
        const proofData = Array.isArray(data) ? data : (data?.proofs ?? []);
        if (proofData.length > 0) {
          proofs = proofData;
          console.log(`Found ${proofs.length} proofs from ${endpoint}`);
          break;
        }
      } catch {
        continue;
      }
    }

    if (proofs.length === 0) {
      proofs = extractProofsFromBids(bids);
      console.log(`Extracted ${proofs.length} proofs from bids`);
    }

    let payments: any[] = [];
    const paymentEndpoints = [
      "/vendor/payments",
      "/payments?mine=1", 
      "/payments",
      "/vendor/payouts",
      "/payouts?mine=1",
      "/payouts"
    ];

    for (const endpoint of paymentEndpoints) {
      try {
        const data = await fetchWithAuth(endpoint, headers);
        const paymentData = Array.isArray(data) ? data : (data?.payments ?? data?.payouts ?? []);
        if (paymentData.length > 0) {
          payments = paymentData;
          console.log(`Found ${payments.length} payments from ${endpoint}`);
          
          // REMOVED: No more adding mock transaction hashes
          break;
        }
      } catch {
        continue;
      }
    }

    if (payments.length === 0) {
      payments = extractPaymentsFromBids(bids);
      console.log(`Extracted ${payments.length} payments from bids`);
      
      if (payments.length === 0) {
        payments = extractPaymentsFromProofs(proofs, bids);
        console.log(`Extracted ${payments.length} payments from proofs`);
      }
    }

    let role = null;
    try {
      role = await fetchWithAuth("/auth/role", headers);
    } catch {
      // Role endpoint might not be critical
    }

    const body = {
      bids,
      proofs,
      payments,
      role,
      _debug: {
        bidCount: bids.length,
        proofCount: proofs.length,
        paymentCount: payments.length,
        bidIds: bids.map(b => b?.id ?? b?.bid_id),
        paymentTxHashes: payments.map(p => p.tx_hash)
      }
    };

    console.log('Final vendor oversight data:', body._debug);
    
    return NextResponse.json(body);
    
  } catch (e: any) {
    console.error("Vendor oversight error:", e);
    return NextResponse.json(
      { 
        error: e?.message || "Vendor oversight failed",
        bids: [],
        proofs: [],
        payments: [],
        role: null
      }, 
      { status: 500 }
    );
  }
}