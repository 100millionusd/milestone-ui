import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = (
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ""
).replace(/\/$/, "");

async function fetchWithAuth(path: string, headers: HeadersInit) {
  if (!API) throw new Error("API_BASE is not set");
  const r = await fetch(`${API}${path}`, {
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json().catch(() => ({}));
}

function extractProofsFromBids(bids: any[]): any[] {
  const proofs: any[] = [];
  
  for (const bid of bids) {
    const bidId = bid?.id ?? bid?.bid_id ?? bid?.bidId;
    
    if (!bidId) continue;

    const proofFields = [
      bid.proofs,
      bid.milestones,
      bid.submissions,
      bid.documents,
      bid.deliverables
    ];

    for (const proofField of proofFields) {
      if (Array.isArray(proofField)) {
        proofs.push(...proofField.map((p: any) => ({
          ...p,
          bid_id: bidId,
          id: p?.id ?? p?.proof_id ?? p?.milestone_id ?? `proof-${bidId}-${proofs.length}`,
          milestone_index: p?.milestone_index ?? p?.milestoneIndex ?? p?.index ?? p?.milestone ?? 1,
          title: p?.title ?? p?.name ?? `Proof for bid ${bidId}`,
          status: p?.status ?? p?.state ?? 'submitted'
        })));
        break;
      }
    }

    if (proofs.length === 0) {
      const singleProof = bid.proof ?? bid.milestone ?? bid.submission;
      if (singleProof && typeof singleProof === 'object') {
        proofs.push({
          ...singleProof,
          bid_id: bidId,
          id: singleProof?.id ?? `proof-${bidId}`,
          milestone_index: singleProof?.milestone_index ?? 1,
          title: singleProof?.title ?? `Proof for bid ${bidId}`,
          status: singleProof?.status ?? 'submitted'
        });
      }
    }
  }
  
  return proofs;
}

function extractPaymentsFromProofs(proofs: any[], bids: any[]): any[] {
  const payments: any[] = [];
  
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
      const bid = bids.find(b => (b.id ?? b.bidId) === bidId);
      
      // REAL transaction hash extraction - check ALL possible fields
      const tx_hash = 
        proof?.tx_hash ?? 
        proof?.transaction_hash ?? 
        proof?.payment_tx ?? 
        proof?.onchain_tx ??
        proof?.hash ??
        proof?.txHash ??
        proof?.transactionHash ??
        proof?.payment_hash ??
        proof?.blockchain_tx ??
        proof?.eth_tx ??
        proof?.polygon_tx ??
        proof?.onchain_transaction_id ??
        null;
      
      payments.push({
        id: `payment-${bidId}-${milestoneIndex}`,
        bid_id: bidId,
        milestone_index: milestoneIndex,
        amount_usd: proof.amount ?? bid?.priceUsd ?? bid?.amount_usd,
        status: 'completed',
        released_at: proof.paymentDate ?? proof.updated_at ?? proof.created_at,
        created_at: proof.created_at,
        tx_hash: tx_hash, // This will be a real hash if it exists in your data
        description: proof.name ?? proof.title
      });
    }
  }
  
  return payments;
}

function extractPaymentsFromBids(bids: any[]): any[] {
  const payments: any[] = [];
  
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
        payments.push(...paymentField.map((p: any) => {
          // REAL transaction hash extraction
          const tx_hash = 
            p?.tx_hash ?? 
            p?.transaction_hash ?? 
            p?.hash ??
            p?.txHash ??
            p?.transactionHash ??
            p?.payment_hash ??
            p?.blockchain_hash ??
            p?.eth_transaction ??
            p?.polygon_transaction ??
            p?.onchain_id ??
            null;
            
          return {
            ...p,
            bid_id: bidId,
            id: p?.id ?? p?.payment_id ?? p?.payout_id ?? `payment-${bidId}-${payments.length}`,
            milestone_index: p?.milestone_index ?? p?.milestoneIndex ?? p?.index ?? p?.milestone ?? 1,
            amount_usd: p?.amount_usd ?? p?.amountUsd ?? p?.amount ?? p?.usd ?? null,
            status: p?.status ?? p?.state ?? 'completed',
            tx_hash: tx_hash
          };
        }));
        break;
      }
    }

    if (payments.length === 0) {
      const singlePayment = bid.payment ?? bid.payout ?? bid.transaction;
      if (singlePayment && typeof singlePayment === 'object') {
        const tx_hash = 
          singlePayment?.tx_hash ?? 
          singlePayment?.transaction_hash ?? 
          singlePayment?.hash ??
          singlePayment?.txHash ??
          singlePayment?.transactionHash ??
          null;
        
        payments.push({
          ...singlePayment,
          bid_id: bidId,
          id: singlePayment?.id ?? `payment-${bidId}`,
          milestone_index: singlePayment?.milestone_index ?? 1,
          amount_usd: singlePayment?.amount_usd ?? singlePayment?.amount,
          status: singlePayment?.status ?? 'completed',
          tx_hash: tx_hash
        });
      }
    }

    if (payments.length === 0 && bid.amount_usd) {
      payments.push({
        id: `payment-${bidId}`,
        bid_id: bidId,
        milestone_index: 1,
        amount_usd: bid.amount_usd,
        status: 'completed',
        released_at: bid.updated_at ?? bid.created_at,
        created_at: bid.created_at,
        tx_hash: null
      });
    }
  }
  
  return payments;
}

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
          break;
        }
      } catch (error) {
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
          break;
        }
      } catch {
        continue;
      }
    }

    if (proofs.length === 0) {
      proofs = extractProofsFromBids(bids);
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
          break;
        }
      } catch {
        continue;
      }
    }

    if (payments.length === 0) {
      payments = extractPaymentsFromBids(bids);
      
      if (payments.length === 0) {
        payments = extractPaymentsFromProofs(proofs, bids);
      }
    }

    let role = null;
    try {
      role = await fetchWithAuth("/auth/role", headers);
    } catch {}

    const body = {
      bids,
      proofs,
      payments,
      role
    };

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