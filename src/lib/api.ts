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

// Base API URL - FIXED: Use your Railway URL as default
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE || 
                     process.env.NEXT_PUBLIC_API_URL || 
                     'https://zestful-tenderness.up.railway.app'; // ← YOUR RAILWAY URL

// Helper function to get appropriate API URL based on context
function getApiBaseUrl(): string {
  // During build (static generation), return your Railway URL
  if (typeof window === 'undefined') {
    return 'https://zestful-tenderness.up.railway.app';
  }
  
  // During runtime, use the configured URL or fallback to Railway
  return API_BASE_URL;
}

// Helper function for API calls with retry logic for rate limiting
async function apiFetch(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const maxRetries = 3;
  
  // During build, return mock data to avoid failed API calls
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    console.log(`Build-time: Skipping API call to ${endpoint}`);
    return getMockDataForEndpoint(endpoint);
  }
  
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

// Helper function for build-time mock data
function getMockDataForEndpoint(endpoint: string): any {
  console.log(`Generating mock data for: ${endpoint}`);
  
  switch (true) {
    case endpoint === '/proposals':
      return [];
    case endpoint === '/bids':
      return [];
    case endpoint.startsWith('/proposals/'):
      return { 
        proposalId: 1, 
        orgName: 'Example Organization', 
        title: 'Sample Project', 
        summary: 'This is a sample project description',
        contact: 'contact@example.com',
        amountUSD: 10000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        cid: 'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'
      };
    case endpoint.startsWith('/bids/'):
      return { 
        bidId: 1, 
        proposalId: 1, 
        vendorName: 'Example Vendor', 
        priceUSD: 5000,
        days: 30,
        notes: 'Sample bid proposal',
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        preferredStablecoin: 'USDT',
        status: 'pending',
        createdAt: new Date().toISOString(),
        milestones: [
          {
            name: 'Initial Delivery',
            amount: 2500,
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            completed: false,
            completionDate: null,
            proof: '',
            paymentTxHash: null,
            paymentDate: null
          }
        ]
      };
    case endpoint === '/health':
      return {
        ok: true,
        network: 'sepolia',
        blockchain: 'connected',
        signer: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        balances: { USDC: 1000, USDT: 1500 },
        counts: { proposals: 5, bids: 3 }
      };
    default:
      return {};
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
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${baseUrl}/ipfs/upload-file`, {
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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/balances/${address}`);
    
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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/transaction/${txHash}`);
    
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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/bids/pay-milestone`, {
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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/health`);
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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/test`);
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
  
  // System
  healthCheck,
  testConnection,
  
  // Helper functions
  postJSON
};