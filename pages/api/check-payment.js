// pages/api/check-payment.js
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { txHash } = req.query;

  if (!txHash) {
    return res.status(400).json({ error: 'Missing transaction hash' });
  }

  try {
    // 1. First check blockchain status
    if (process.env.RPC_URL) {
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (receipt) {
        return res.status(200).json({
          blockchainStatus: receipt.status === 1 ? 'confirmed' : 'failed',
          confirmations: receipt.confirmations || 0,
          blockNumber: receipt.blockNumber
        });
      }
    }

    // 2. Check local bids.json file
    const bidsPath = path.join(process.cwd(), 'data', 'bids.json');
    if (fs.existsSync(bidsPath)) {
      const bidsData = fs.readFileSync(bidsPath, 'utf8');
      const bids = JSON.parse(bidsData);
      
      // Look for this transaction in all bids
      for (const bid of bids) {
        if (bid.payments) {
          const payment = bid.payments.find(p => p.transactionHash === txHash);
          if (payment) {
            return res.status(200).json({
              foundInLocalData: true,
              bidId: bid.bidId,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              date: payment.date
            });
          }
        }
        
        // Also check milestones
        if (bid.milestones) {
          const milestone = bid.milestones.find(m => m.paymentTxHash === txHash);
          if (milestone) {
            return res.status(200).json({
              foundInMilestone: true,
              bidId: bid.bidId,
              amount: milestone.amount,
              paid: milestone.paid,
              paymentDate: milestone.paymentDate
            });
          }
        }
      }
    }

    // 3. Not found anywhere
    res.status(404).json({ 
      message: 'Transaction not found in local data',
      transactionHash: txHash 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}