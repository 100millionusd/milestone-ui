// src/lib/api.ts
import { blockchainService } from './blockchain';

export interface Proposal {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  contact: string;
  address?: string;
  city?: string;
  country?: string;
  amountUSD: number;
  docs: any[];
  cid: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Milestone {
  name: string;
  amount: number;
  dueDate: string;
  completed: boolean;
  completionDate: string | null;
  proof: string;
  paymentTxHash: string | null;
  paymentDate: string | null;
}

export interface Bid {
  bidId: number;
  proposalId: number;
  vendorName: string;
  priceUSD: number;
  days: number;
  notes: string;
  walletAddress: string;
  preferredStablecoin: 'USDT' | 'USDC';
  milestones: Milestone[];
  doc: any | null;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  createdAt: string;
}

export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amount?: number;
  toAddress?: string;
  currency?: string;
}

// Base API URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Helper function for API calls with retry logic for rate limiting
async function apiFetch(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  const maxRetries = 3;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      // Handle rate limiting (429) with retry logic
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * Math.pow(2, retryCount);
        
        console.warn(`Rate limited (429), retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return apiFetch(endpoint, options, retryCount + 1);
      }
      
      // Handle other errors
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = {};
      }
      
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error(`API fetch error for ${endpoint}:`, error);
    
    // Only retry on network errors, not on application errors
    if (error instanceof TypeError && error.message === 'Failed to fetch' && retryCount < maxRetries) {
      const delay = 1000 * Math.pow(2, retryCount);
      console.warn(`Network error, retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiFetch(endpoint, options, retryCount + 1);
    }
    
    throw error;
  }
}

// Helper function for POST requests with JSON data
export async function postJSON(endpoint: string, data: any): Promise<any> {
  return apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Proposals API - Original endpoints without /api/ prefix
export async function getProposals(): Promise<Proposal[]> {
  return apiFetch('/proposals');
}

export async function getProposal(id: number): Promise<Proposal> {
  return apiFetch(`/proposals/${id}`);
}

export async function createProposal(proposal: Omit<Proposal, 'proposalId' | 'status' | 'createdAt'>): Promise<{ ok: boolean; proposalId: number; cid: string | null }> {
  return postJSON('/proposals', proposal);
}

export async function approveProposal(id: number): Promise<{ ok: boolean; proposalId: number; status: string }> {
  return apiFetch(`/proposals/${id}/approve`, {
    method: 'POST',
  });
}

export async function rejectProposal(id: number): Promise<{ ok: boolean; proposalId: number; status: string }> {
  return apiFetch(`/proposals/${id}/reject`, {
    method: 'POST',
  });
}

// Bids API - Original endpoints without /api/ prefix
export async function getBids(proposalId?: number): Promise<Bid[]> {
  const endpoint = proposalId ? `/bids?proposalId=${proposalId}` : '/bids';
  return apiFetch(endpoint);
}

export async function getBid(id: number): Promise<Bid> {
  return apiFetch(`/bids/${id}`);
}

export async function createBid(bid: Omit<Bid, 'bidId' | 'status' | 'createdAt'>): Promise<{ ok: boolean; bidId: number; proposalId: number }> {
  return postJSON('/bids', bid);
}

export async function approveBid(id: number): Promise<{ ok: boolean; bidId: number; status: string }> {
  return apiFetch(`/bids/${id}/approve`, {
    method: 'POST',
  });
}

export async function rejectBid(id: number): Promise<{ ok: boolean; bidId: number; status: string }> {
  return apiFetch(`/bids/${id}/reject`, {
    method: 'POST',
  });
}

export async function completeMilestone(bidId: number, milestoneIndex: number, proof: string): Promise<{ ok: boolean; bidId: number; milestoneIndex: number }> {
  return postJSON(`/bids/${bidId}/complete-milestone`, { milestoneIndex, proof });
}

export async function payMilestone(bidId: number, milestoneIndex: number): Promise<{ ok: boolean; bidId: number; milestoneIndex: number; transactionHash: string }> {
  return postJSON(`/bids/${bidId}/pay-milestone`, { milestoneIndex });
}

// IPFS API - Original endpoints without /api/ prefix
export async function uploadFileToIPFS(file: File): Promise<{ cid: string; url: string; size: number; name: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/ipfs/upload-file`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    // Handle rate limiting for file uploads
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
      
      console.warn('Rate limited on file upload, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFileToIPFS(file);
    }
    
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload file');
  }

  return response.json();
}

export async function uploadJsonToIPFS(data: any): Promise<{ cid: string; url: string }> {
  return postJSON('/ipfs/upload-json', data);
}

// Blockchain API - Original endpoints without /api/ prefix
export async function getTokenBalances(address: string): Promise<{ USDC: string; USDT: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/balances/${address}`);
    
    // Handle rate limiting for balance checks
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
      
      console.warn('Rate limited on balance check, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, delay));
      return getTokenBalances(address);
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch balances');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return { USDC: '0', USDT: '0' };
  }
}

export async function getTransactionStatus(txHash: string): Promise<{ status: string; blockNumber?: number; confirmations?: number }> {
  try {
    const response = await fetch(`${API_BASE_URL}/transaction/${txHash}`);
    
    // Handle rate limiting for transaction status checks
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
      
      console.warn('Rate limited on transaction status check, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, delay));
      return getTransactionStatus(txHash);
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch transaction status');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching transaction status:', error);
    return { status: 'unknown' };
  }
}

// Function to send tokens (using backend API) - Original endpoint without /api/ prefix
export async function sendTokens(toAddress: string, amount: number, tokenSymbol: 'USDC' | 'USDT'): Promise<TransactionResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/bids/pay-milestone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toAddress, amount, tokenSymbol }),
    });

    // Handle rate limiting for token transfers
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1500;
      
      console.warn('Rate limited on token transfer, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendTokens(toAddress, amount, tokenSymbol);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send tokens');
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending tokens:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send tokens'
    };
  }
}

// Update the completeMilestoneWithPayment function to use backend API
export async function completeMilestoneWithPayment(
  bidId: number, 
  milestoneIndex: number, 
  proof: string
): Promise<TransactionResult & { bid: Bid }> {
  try {
    // First, complete the milestone
    await completeMilestone(bidId, milestoneIndex, proof);
    
    // Then, process the payment
    const paymentResult = await payMilestone(bidId, milestoneIndex);

    if (!paymentResult.ok) {
      throw new Error('Payment failed');
    }

    // Get the updated bid
    const bid = await getBid(bidId);

    return {
      success: true,
      transactionHash: paymentResult.transactionHash,
      amount: bid.milestones[milestoneIndex].amount,
      toAddress: bid.walletAddress,
      currency: bid.preferredStablecoin,
      bid: bid
    };

  } catch (error) {
    console.error('Payment error:', error);
    throw new Error(error instanceof Error ? error.message : 'Payment processing failed');
  }
}

// Alternative: Complete milestone and payment in one step (frontend blockchain)
export async function completeMilestoneWithPaymentDirect(
  bidId: number, 
  milestoneIndex: number, 
  proof: string
): Promise<TransactionResult & { bid: Bid }> {
  try {
    // Get bid details
    const bid = await getBid(bidId);
    const milestone = bid.milestones[milestoneIndex];
    
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    // Validate wallet address
    if (!bid.walletAddress || !bid.walletAddress.startsWith('0x')) {
      throw new Error('Invalid vendor wallet address');
    }

    // Send real USDT/USDC payment using blockchain service
    let paymentResult: TransactionResult;
    
    if (bid.preferredStablecoin === 'USDT') {
      paymentResult = await blockchainService.sendUSDT(bid.walletAddress, milestone.amount);
    } else if (bid.preferredStablecoin === 'USDC') {
      paymentResult = await blockchainService.sendUSDC(bid.walletAddress, milestone.amount);
    } else {
      throw new Error('Unsupported stablecoin');
    }

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || 'Payment failed');
    }

    // Update milestone with payment info
    const updatedBid = await updateMilestoneWithPayment(
      bidId,
      milestoneIndex,
      proof,
      paymentResult.transactionHash
    );

    return {
      ...paymentResult,
      bid: updatedBid
    };

  } catch (error) {
    console.error('Payment error:', error);
    throw new Error(error instanceof Error ? error.message : 'Payment processing failed');
  }
}

// Helper function to update milestone with payment info
async function updateMilestoneWithPayment(
  bidId: number,
  milestoneIndex: number,
  proof: string,
  transactionHash: string
): Promise<Bid> {
  // In a real implementation, this would update the backend
  // For now, we'll just return the updated bid by fetching it again
  await completeMilestone(bidId, milestoneIndex, proof);
  
  // Simulate updating payment info (in a real app, this would be a backend call)
  const bid = await getBid(bidId);
  
  // Update the milestone with payment info
  const updatedMilestones = [...bid.milestones];
  if (updatedMilestones[milestoneIndex]) {
    updatedMilestones[milestoneIndex] = {
      ...updatedMilestones[milestoneIndex],
      paymentTxHash: transactionHash,
      paymentDate: new Date().toISOString()
    };
  }
  
  return {
    ...bid,
    milestones: updatedMilestones
  };
}

// Health check - Original endpoint without /api/ prefix
export async function healthCheck(): Promise<{
  ok: boolean;
  network: string;
  blockchain: string;
  signer: string | null;
  balances: { USDC: number; USDT: number };
  counts: { proposals: number; bids: number };
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return await response.json();
  } catch (error) {
    console.error('Health check error:', error);
    throw new Error('Unable to connect to server');
  }
}

// Test function - Original endpoint without /api/ prefix
export async function testConnection(): Promise<{ success: boolean; bidCount: number; blockchain: any }> {
  try {
    const response = await fetch(`${API_BASE_URL}/test`);
    if (!response.ok) {
      throw new Error('Test failed');
    }
    return await response.json();
  } catch (error) {
    console.error('Test connection error:', error);
    throw new Error('Unable to connect to server');
  }
}

// Export all functions
export default {
  // Proposals
  getProposals,
  getProposal,
  createProposal,
  approveProposal,
  rejectProposal,
  
  // Bids
  getBids,
  getBid,
  createBid,
  approveBid,
  rejectBid,
  completeMilestone,
  payMilestone,
  
  // IPFS
  uploadFileToIPFS,
  uploadJsonToIPFS,
  
  // Blockchain
  getTokenBalances,
  getTransactionStatus,
  sendTokens,
  
  // Payment
  completeMilestoneWithPayment,
  completeMilestoneWithPaymentDirect,
  
  // System
  healthCheck,
  testConnection,
  
  // Helper functions
  postJSON
};