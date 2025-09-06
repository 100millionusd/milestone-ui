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
    // Use environment variables
    const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    this.networkId = parseInt(process.env.NEXT_PUBLIC_NETWORK_ID || '11155111');
    
    // Check if we have the required configuration
    if (!RPC_URL || !PRIVATE_KEY) {
      console.warn('Missing RPC_URL or PRIVATE_KEY environment variables. Blockchain functions will be disabled.');
      this.isConfigured = false;
      return;
    }
    
    try {
      this.provider = new ethers.JsonRpcProvider(RPC_URL);
      
      // Ensure private key starts with 0x
      const formattedPrivateKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
      this.signer = new ethers.Wallet(formattedPrivateKey, this.provider);
      
      this.isConfigured = true;
      console.log('Blockchain service configured successfully');
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error);
      this.isConfigured = false;
    }
  }

  async sendUSDT(toAddress: string, amount: number): Promise<TransactionResult> {
    return this.sendToken('USDT', toAddress, amount);
  }

  async sendUSDC(toAddress: string, amount: number): Promise<TransactionResult> {
    return this.sendToken('USDC', toAddress, amount);
  }

  private async sendToken(token: 'USDT' | 'USDC', toAddress: string, amount: number): Promise<TransactionResult> {
    // Check if service is properly configured
    if (!this.isConfigured || !this.signer) {
      return {
        success: false,
        error: 'Blockchain service not configured. Please check your environment variables.'
      };
    }

    try {
      // Validate address
      if (!ethers.isAddress(toAddress)) {
        return {
          success: false,
          error: 'Invalid wallet address'
        };
      }

      const contractAddress = CONTRACT_ADDRESSES[token][this.networkId];
      if (!contractAddress) {
        return {
          success: false,
          error: `Unsupported network for ${token}`
        };
      }

      const contract = new ethers.Contract(contractAddress, ERC20_ABI, this.signer);
      
      // Get token decimals
      const decimals = await contract.decimals();
      const amountInWei = ethers.parseUnits(amount.toString(), decimals);

      // Check balance first
      const balance = await contract.balanceOf(await this.signer.getAddress());
      if (balance < amountInWei) {
        return {
          success: false,
          error: 'Insufficient balance for payment'
        };
      }

      // Send transaction
      const tx = await contract.transfer(toAddress, amountInWei);
      const receipt = await tx.wait();

      if (!receipt.status) {
        return {
          success: false,
          error: 'Transaction failed'
        };
      }

      return {
        success: true,
        transactionHash: receipt.hash,
        amount: amount,
        toAddress: toAddress,
        currency: token
      };

    } catch (error: any) {
      console.error('Blockchain error:', error);
      return {
        success: false,
        error: error.reason || error.message || 'Unknown blockchain error'
      };
    }
  }

  async getBalance(token: 'USDT' | 'USDC'): Promise<number> {
    if (!this.isConfigured || !this.signer) {
      return 0;
    }
    
    try {
      const contractAddress = CONTRACT_ADDRESSES[token][this.networkId];
      const contract = new ethers.Contract(contractAddress, ERC20_ABI, this.signer);
      
      const balance = await contract.balanceOf(await this.signer.getAddress());
      const decimals = await contract.decimals();
      
      return parseFloat(ethers.formatUnits(balance, decimals));
    } catch (error) {
      console.error('Balance check error:', error);
      return 0;
    }
  }

  // Helper method to check if service is configured
  isServiceConfigured(): boolean {
    return this.isConfigured;
  }
}

// Singleton instance
export const blockchainService = new BlockchainService();
