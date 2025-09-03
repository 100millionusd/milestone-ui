// pages/api/bids/index.js - For managing bids
import { BidDatabase } from './bid-database';

const bidDB = new BidDatabase();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Get all bids
      const bids = bidDB.getAllBids();
      res.status(200).json({ success: true, bids });
    }
    else if (req.method === 'POST') {
      // Create new bid
      const newBid = req.body;
      const success = bidDB.saveBid(newBid);
      res.status(200).json({ success, bid: newBid });
    }
    else {
      res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}