// pages/api/bids/pay-milestone.js - COMPLETELY REVISED
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// ERC20 ABI
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// Database functions
class BidDatabase {
  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'bids.json');
    this.initDatabase();
  }

  initDatabase() {
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create database file if it doesn't exist
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify([], null, 2));
    }
  }

  getAllBids() {
    try {
      const data = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading bids database:', error);
      return [];
    }
  }

  getBid(bidId) {
    const bids = this.getAllBids();
    return bids.find(bid => bid.bidId === parseInt(bidId));
  }

  saveBid(updatedBid) {
    try {
      const bids = this.getAllBids();
      const bidIndex = bids.findIndex(bid => bid.bidId === updatedBid.bidId);
      
      if (bidIndex === -1) {
        // New bid - add to database
        bids.push(updatedBid);
      } else {
        // Update existing bid
        bids[bidIndex] = updatedBid;
      }

      fs.writeFileSync(this.dbPath, JSON.stringify(bids, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving bid:', error);
      return false;
    }
  }

  processPayment(bidId, paymentData) {
    const bid = this.getBid(bidId);
    if (!bid) {
      throw new Error(`Bid ${bidId} not found in database`);
    }

    // Update bid with payment information
    if (!bid.payments) bid.payments = [];
    bid.payments.push({
      amount: paymentData.amount,
      currency: paymentData.currency,
      transactionHash: paymentData.transactionHash,
      date: new Date().toISOString(),
      status: 'completed'
    });

    // Update milestones
    if (bid.milestones && bid.milestones.length > 0) {
      bid.milestones[0].paymentTxHash = paymentData.transactionHash;
      bid.milestones[0].paymentDate = new Date().toISOString();
    }

    // Update total paid
    bid.totalPaid = (bid.totalPaid || 0) + paymentData.amount;

    // Save updated bid
    return this.saveBid(bid);
  }
}

// Create database instance
const bidDB = new BidDatabase();

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { amount, token, bidId } = req.body;
    
    console.log('Processing payment for bidId:', bidId);

    // Validate required parameters
    if (!amount || !token || !bidId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: amount, token, or bidId' 
      });
    }

    // Get bid from database
    const bid = bidDB.getBid(bidId);
    if (!bid) {
      return res.status(404).json({ 
        success: false, 
        error: `Bid ${bidId} not found in database` 
      });
    }

    // Use the bid's wallet address (NOT from request)
    const toAddress = bid.walletAddress;
    if (!toAddress || !ethers.isAddress(toAddress)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid wallet address in bid data' 
      });
    }

    // Check if environment variables are set
    if (!process.env.RPC_URL || !process.env.PRIVATE_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Server configuration error: Missing RPC_URL or PRIVATE_KEY' 
      });
    }

    // Get token address from environment variables
    const tokenAddress = token === 'USDC' 
      ? process.env.USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS
      : process.env.USDT_ADDRESS || process.env.NEXT_PUBLIC_USDT_ADDRESS;

    if (!tokenAddress) {
      return res.status(500).json({ 
        success: false, 
        error: `Token address not configured for ${token}` 
      });
    }

    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Create token contract instance
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token decimals
    const decimals = await tokenContract.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    // Send tokens
    const tx = await tokenContract.transfer(toAddress, amountInWei);
    const receipt = await tx.wait();

    // Update database with payment information
    const paymentData = {
      amount: parseFloat(amount),
      currency: token,
      transactionHash: tx.hash
    };
    
    const updateSuccess = bidDB.processPayment(bidId, paymentData);

    if (!updateSuccess) {
      console.error('Failed to update database, but blockchain transaction was successful');
    }

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      transactionHash: tx.hash,
      amount: amount,
      currency: token,
      toAddress: toAddress,
      bidId: bidId,
      databaseUpdated: updateSuccess
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error occurred'
    });
  }
}