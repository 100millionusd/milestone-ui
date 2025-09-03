// src/lib/blockchain.ts
import { ethers } from 'ethers';

export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amount?: number;
  toAddress?: string;
  currency?: string;
}

// Sepolia Testnet contract addresses
const CONTRACT_ADDRESSES = {
  USDT: {
    11155111: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06' // Sepolia USDT
  },
  USDC: {
    11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // Sepolia USDC
  }
};

// ERC20 ABI (simplified for transfer function)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export class BlockchainService {
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private networkId: number;
  private isConfigured: boolean = false;

  constructor() {
    // Use PUBLIC environment variables only (safe for client-side)
    const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
    this.networkId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '11155111');
    
    // Check if we have the required configuration
    if (!RPC_URL) {
      console.warn('Missing RPC_URL environment variable. Some blockchain functions will be disabled.');
      this.isConfigured = false;
      return;
    }
    
    try {
      this.provider = new ethers.JsonRpcProvider(RPC_URL);
      
      // Don't initialize signer on client side - private keys should only be used server-side
      // Signer will be null on client, but provider will work for read-only operations
      
      this.isConfigured = true;
      console.log('Blockchain service configured for read-only operations');
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error);
      this.isConfigured = false;
    }
  }

  // These methods should only be called from server-side code
  async sendUSDT(toAddress: string, amount: number): Promise<TransactionResult> {
    return {
      success: false,
      error: 'Blockchain operations require server-side execution. Use API routes instead.'
    };
  }

  async sendUSDC(toAddress: string, amount: number): Promise<TransactionResult> {
    return {
      success: false,
      error: 'Blockchain operations require server-side execution. Use API routes instead.'
    };
  }

  private async sendToken(token: 'USDT' | 'USDC', toAddress: string, amount: number): Promise<TransactionResult> {
    return {
      success: false,
      error: 'Blockchain operations require server-side execution. Use API routes instead.'
    };
  }

  // Read-only operations can work on client side
  async getBalance(token: 'USDT' | 'USDC'): Promise<number> {
    if (!this.isConfigured || !this.provider) {
      return 0;
    }
    
    try {
      const contractAddress = CONTRACT_ADDRESSES[token][this.networkId];
      const contract = new ethers.Contract(contractAddress, ERC20_ABI, this.provider);
      
      // For client-side, we can't use signer, so we need an address to check balance
      // You'll need to pass an address or use a different approach
      return 0;
      
    } catch (error) {
      console.error('Balance check error:', error);
      return 0;
    }
  }

  // Helper method to check if service is configured
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }

  // Helper method to get provider (for read-only operations)
  getProvider(): ethers.JsonRpcProvider | null {
    return this.provider;
  }
}

// Singleton instance
export const blockchainService = new BlockchainService();