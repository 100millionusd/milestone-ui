// server.js — Milestone API with USDT/USDC payments
// -----------------------------------------------------------
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const helmet = require("helmet");
const Joi = require("joi");
const { ethers } = require("ethers");

// ========== Config ==========
const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://lithiumx.netlify.app";

const PINATA_JWT = process.env.PINATA_JWT || "";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY_DOMAIN || "gateway.pinata.cloud";

// Blockchain configuration
const NETWORK = process.env.NETWORK || "sepolia";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ESCROW_ADDR = process.env.ESCROW_ADDR || "";

// Sepolia token addresses
const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

// ERC20 ABI (simplified)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// Token configurations
const TOKENS = {
  USDC: {
    address: USDC_ADDRESS,
    decimals: 6
  },
  USDT: {
    address: USDT_ADDRESS,
    decimals: 6
  }
};

// ========== Validation Schemas ==========
const proposalSchema = Joi.object({
  orgName: Joi.string().min(1).max(100).required(),
  title: Joi.string().min(1).max(200).required(),
  summary: Joi.string().min(1).max(1000).required(),
  contact: Joi.string().email().required(),
  address: Joi.string().max(200).optional().allow(''),
  city: Joi.string().max(100).optional().allow(''),
  country: Joi.string().max(100).optional().allow(''),
  amountUSD: Joi.number().min(0).optional().default(0),
  docs: Joi.array().optional().default([]),
  cid: Joi.string().optional().allow('')
});

const bidSchema = Joi.object({
  proposalId: Joi.number().integer().min(1).required(),
  vendorName: Joi.string().min(1).max(100).required(),
  priceUSD: Joi.number().min(0).required(),
  days: Joi.number().integer().min(0).required(),
  notes: Joi.string().max(1000).optional().allow(''),
  walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required().messages({
    'string.pattern.base': 'Wallet address must be a valid Ethereum address'
  }),
  preferredStablecoin: Joi.string().valid('USDT', 'USDC').default('USDT'),
  milestones: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    dueDate: Joi.date().iso().required()
  })).min(1).required(),
  doc: Joi.object({
    cid: Joi.string().required(),
    url: Joi.string().uri().required(),
    name: Joi.string().required(),
    size: Joi.number().required()
  }).optional().allow(null)
});

// ========== Database Layer ==========
class JSONDatabase {
  constructor(filePath) {
    this.filePath = filePath;
  }
  
  async read() {
    try {
      const data = await fsp.readFile(this.filePath, 'utf8');
      return JSON.parse(data || '[]');
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.write([]);
        return [];
      }
      throw error;
    }
  }
  
  async write(data) {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    await fsp.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
  
  async findById(id) {
    const data = await this.read();
    return data.find(item => item.proposalId === id || item.bidId === id);
  }
  
  async findByProposalId(proposalId) {
    const data = await this.read();
    return data.filter(item => item.proposalId === proposalId);
  }
  
  async add(item) {
    const data = await this.read();
    data.push(item);
    await this.write(data);
    return item;
  }
  
  async update(id, updates) {
    const data = await this.read();
    const index = data.findIndex(item => item.proposalId === id || item.bidId === id);
    if (index === -1) return null;
    
    data[index] = { ...data[index], ...updates };
    await this.write(data);
    return data[index];
  }
}

// ========== Blockchain Service ==========
class BlockchainService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    
    // Initialize signer if private key is provided
    if (PRIVATE_KEY) {
      // Ensure private key starts with 0x
      const formattedPrivateKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
      this.signer = new ethers.Wallet(formattedPrivateKey, this.provider);
      console.log(`Blockchain service initialized with address: ${this.signer.address}`);
    } else {
      console.warn('No private key provided. Blockchain functions will be disabled.');
      this.signer = null;
    }
  }

  async sendToken(tokenSymbol, toAddress, amount) {
    if (!this.signer) {
      throw new Error('Blockchain service not configured. Please provide a PRIVATE_KEY.');
    }

    const token = TOKENS[tokenSymbol];
    if (!token) {
      throw new Error(`Unsupported token: ${tokenSymbol}`);
    }

    // Validate address
    if (!ethers.isAddress(toAddress)) {
      throw new Error('Invalid recipient address');
    }

    const contract = new ethers.Contract(token.address, ERC20_ABI, this.signer);
    
    // Get token decimals
    const decimals = await contract.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    // Check balance first
    const balance = await contract.balanceOf(await this.signer.getAddress());
    if (balance < amountInWei) {
           throw new Error('Insufficient balance for payment');
    }

    // Send transaction
    const tx = await contract.transfer(toAddress, amountInWei);
    const receipt = await tx.wait();

    if (!receipt.status) {
      throw new Error('Transaction failed');
    }

    return {
      success: true,
      transactionHash: receipt.hash,
      amount: amount,
      toAddress: toAddress,
      currency: tokenSymbol
    };
  }

  async getBalance(tokenSymbol) {
    if (!this.signer) {
      return 0;
    }

    const token = TOKENS[tokenSymbol];
    if (!token) {
      throw new Error(`Unsupported token: ${tokenSymbol}`);
    }

    const contract = new ethers.Contract(token.address, ERC20_ABI, this.signer);
    const balance = await contract.balanceOf(await this.signer.getAddress());
    const decimals = await contract.decimals();
    
    return parseFloat(ethers.formatUnits(balance, decimals));
  }

  async getTransactionStatus(txHash) {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      return { status: 'not_found' };
    }

    return {
      status: receipt.status === 1 ? 'success' : 'failed',
      blockNumber: receipt.blockNumber,
      confirmations: receipt.confirmations
    };
  }

  isConfigured() {
    return this.signer !== null;
  }
}

// ========== App ==========
const app = express();

// Initialize blockchain service
const blockchainService = new BlockchainService();

// Add trust proxy for Railway (CRITICAL)
app.set('trust proxy', 1);

// ========== CORS FIX - MUST COME FIRST ==========
// Handle preflight requests for all endpoints
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://lithiumx.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  return res.status(200).end();
});

// Regular CORS middleware
app.use(cors({
  origin: 'https://lithiumx.netlify.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Security middleware
app.use(helmet());

app.use(express.json({ limit: "20mb" }));
app.use(
  fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    useTempFiles: false,
    abortOnLimit: true,
  })
);

// ========== Initialize Databases ==========
const DATA_DIR = path.join(__dirname, "data");
const PROPOSALS_FILE = path.join(DATA_DIR, "proposals.json");
const BIDS_FILE = path.join(DATA_DIR, "bids.json");

const proposalsDB = new JSONDatabase(PROPOSALS_FILE);
const bidsDB = new JSONDatabase(BIDS_FILE);

function toNumber(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// ========== IPFS / Pinata ==========
async function pinataUploadFile(oneFile) {
  if (!PINATA_JWT) throw new Error("No Pinata auth configured (PINATA_JWT).");
  
  const form = new FormData();
  const blob = new Blob([oneFile.data], {
    type: oneFile.mimetype || "application/octet-stream",
  });
  form.append("file", blob, oneFile.name || "upload.bin");

  const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });
  
  const t = await r.text();
  let j;
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    throw new Error(`Pinata pinFileToIPFS bad JSON: ${t}`);
  }
  
  if (!r.ok) {
    throw new Error(
      j?.error?.details ||
        j?.error ||
        j?.message ||
        `Pinata error (${r.status})`
    );
  }
  
  const cid = j.IpfsHash || j.cid || j?.pin?.cid;
  if (!cid) throw new Error("Pinata response missing CID");
  const url = `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  return { cid, url, size: oneFile.size || 0, name: oneFile.name || "file" };
}

async function pinataUploadJson(obj) {
  if (!PINATA_JWT) throw new Error("No Pinata auth configured (PINATA_JWT).");
  
  const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(obj),
  });
  
  const t = await r.text();
  let j;
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    throw new Error(`Pinata pinJSONToIPFS bad JSON: ${t}`);
  }
  
  if (!r.ok) {
    throw new Error(
      j?.error?.details ||
        j?.error ||
        j?.message ||
        `Pinata error (${r.status})`
    );
  }
  
  const cid = j.IpfsHash || j.cid || j?.pin?.cid;
  if (!cid) throw new Error("Pinata response missing CID");
  const url = `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  return { cid, url };
}

// ========== Routes ==========

// Health
app.get("/health", async (_req, res) => {
  try {
    const proposals = await proposalsDB.read();
    const bids = await bidsDB.read();
    
    // Get blockchain status
    let blockchainStatus = "not_configured";
    let signerAddress = null;
    let balances = {};
    
    if (blockchainService.isConfigured()) {
      blockchainStatus = "configured";
      signerAddress = await blockchainService.signer.getAddress();
      
      // Try to get balances
      try {
        balances.USDC = await blockchainService.getBalance('USDC');
        balances.USDT = await blockchainService.getBalance('USDT');
      } catch (error) {
        console.error('Error fetching balances:', error);
        balances.error = error.message;
      }
    }
    
    res.json({
      ok: true,
      network: NETWORK,
      rpc: SEPOLIA_RPC_URL ? "(set)" : "",
      escrow: ESCROW_ADDR || "",
      signer: signerAddress,
      blockchain: blockchainStatus,
      balances: balances,
      pinata: !!PINATA_JWT,
      counts: { proposals: proposals.length, bids: bids.length },
      endpoints: [
        "POST /ipfs/upload-file",
        "POST /ipfs/upload-json",
        "POST /proposals",
        "GET /proposals",
        "GET /proposals/:id",
        "POST /proposals/:id/approve",
        "POST /proposals/:id/reject",
        "POST /bids",
        "GET /bids?proposalId=ID",
        "POST /bids/:id/approve",
        "POST /bids/:id/complete-milestone",
        "POST /bids/:id/pay-milestone",
        "GET /balances/:address",
        "GET /transaction/:txHash"
      ],
    });
  } catch (error) {
    res.status(500).json({ error: "Health check failed" });
  }
});

// Test endpoint for debugging
app.get("/test", async (req, res) => {
  try {
    const bids = await bidsDB.read();
    
    let blockchainInfo = { configured: blockchainService.isConfigured() };
    if (blockchainService.isConfigured()) {
      blockchainInfo.signerAddress = await blockchainService.signer.getAddress();
    }
    
    res.json({ 
      success: true, 
      bidCount: bids.length,
      sampleBid: bids[0] || null,
      blockchain: blockchainInfo,
      message: "Server is working correctly"
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Test failed", 
      message: error.message 
    });
  }
});

// Get token balances for an address
app.get("/balances/:address", async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const balances = {};
    
    for (const [symbol, token] of Object.entries(TOKENS)) {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, blockchainService.provider);
        const balance = await contract.balanceOf(address);
        balances[symbol] = ethers.formatUnits(balance, token.decimals);
      } catch (error) {
        console.error(`Error fetching ${symbol} balance:`, error);
        balances[symbol] = '0';
      }
    }

    res.json(balances);
  } catch (error) {
    console.error('Error in balances endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction status
app.get("/transaction/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;
    const status = await blockchainService.getTransactionStatus(txHash);
    res.json(status);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Uploads
app.post("/ipfs/upload-file", async (req, res) => {
  try {
    const f = req.files?.file || req.files?.files;
    if (!f) return res.status(400).json({ error: "file is required" });
    
    if (Array.isArray(f)) {
      const out = [];
      for (const one of f) out.push(await pinataUploadFile(one));
      return res.json({ files: out });
    }
    
    const info = await pinataUploadFile(f);
    res.json(info);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/ipfs/upload-json", async (req, res) => {
  try {
    const info = await pinataUploadJson(req.body || {});
    res.json(info);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Proposals
app.post("/proposals", async (req, res) => {
  try {
    const { error, value } = proposalSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const proposals = await proposalsDB.read();
    const proposalId = proposals.length ? proposals[proposals.length - 1].proposalId + 1 : 1;

    const record = {
      proposalId,
      orgName: value.orgName,
      title: value.title,
      summary: value.summary,
      contact: value.contact,
      address: value.address || "",
      city: value.city || "",
      country: value.country || "",
      amountUSD: value.amountUSD,
      docs: value.docs || [],
      cid: value.cid || "",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    
    await proposalsDB.add(record);
    res.json({ ok: true, proposalId, cid: record.cid || null });
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: "Failed to create proposal" });
  }
});

app.get("/proposals", async (_req, res) => {
  try {
    const proposals = await proposalsDB.read();
    res.json(proposals);
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

app.get("/proposals/:id", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const proposal = await proposalsDB.findById(id);
    if (!proposal) return res.status(404).json({ error: "proposal 404" });
    res.json(proposal);
  } catch (error) {
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: "Failed to fetch proposal" });
  }
});

app.post("/proposals/:id/approve", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const updated = await proposalsDB.update(id, { status: "approved" });
    if (!updated) return res.status(404).json({ error: "proposal 404" });
    res.json({ ok: true, proposalId: id, status: "approved" });
  } catch (error) {
    console.error('Error approving proposal:', error);
    res.status(500).json({ error: "Failed to approve proposal" });
  }
});

app.post("/proposals/:id/reject", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const updated = await proposalsDB.update(id, { status: "rejected" });
    if (!updated) return res.status(404).json({ error: "proposal 404" });
    res.json({ ok: true, proposalId: id, status: "rejected" });
  } catch (error) {
    console.error('Error rejecting proposal:', error);
    res.status(500).json({ error: "Failed to reject proposal" });
  }
});

// Bids
app.post("/bids", async (req, res) => {
  try {
    const { error, value } = bidSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const proposal = await proposalsDB.findById(value.proposalId);
    if (!proposal) return res.status(404).json({ error: "proposal 404" });

    const bids = await bidsDB.read();
    const bidId = bids.length ? bids[bids.length - 1].bidId + 1 : 1;

    const rec = {
      bidId,
      proposalId: value.proposalId,
      vendorName: value.vendorName,
      priceUSD: value.priceUSD,
      days: value.days,
      notes: value.notes || "",
      walletAddress: value.walletAddress,
      preferredStablecoin: value.preferredStablecoin,
      milestones: value.milestones.map(m => ({
        ...m,
        completed: false,
        completionDate: null,
        proof: "",
        paymentTxHash: null,
        paymentDate: null
      })),
      doc: value.doc || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    
    await bidsDB.add(rec);
    res.json({ ok: true, bidId, proposalId: value.proposalId });
  } catch (error) {
    console.error('Error creating bid:', error);
    res.status(500).json({ error: "Failed to create bid" });
  }
});

app.get("/bids", async (req, res) => {
  try {
    const pid = toNumber(req.query.proposalId, 0);
    const bids = await bidsDB.read();
    
    // Filter bids if proposalId is provided
    let filteredBids = bids;
    if (pid) {
      filteredBids = bids.filter(b => b.proposalId === pid);
      
      // Optional: Check if proposal exists
      if (filteredBids.length === 0) {
        const proposals = await proposalsDB.read();
        const proposalExists = proposals.some(p => p.proposalId === pid);
        if (!proposalExists) {
          return res.status(404).json({ 
            error: "Proposal not found",
            proposalId: pid 
          });
        }
      }
    }
    
    res.json(filteredBids);
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ 
      error: "Failed to fetch bids",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get("/bids/:id", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const bid = await bidsDB.findById(id);
    if (!bid) return res.status(404).json({ error: "bid 404" });
    res.json(bid);
  } catch (error) {
    console.error('Error fetching bid:', error);
    res.status(500).json({ error: "Failed to fetch bid" });
  }
});

app.post("/bids/:id/approve", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const bids = await bidsDB.read();
    const i = bids.findIndex((b) => b.bidId === id);
    if (i < 0) return res.status(404).json({ error: "bid 404" });
    
    bids[i].status = "approved";
    await bidsDB.write(bids);
    res.json({ ok: true, bidId: id, status: "approved" });
  } catch (error) {
    console.error('Error approving bid:', error);
    res.status(500).json({ error: "Failed to approve bid" });
  }
});

app.post("/bids/:id/complete-milestone", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const { milestoneIndex, proof } = req.body;
    
    const bids = await bidsDB.read();
    const i = bids.findIndex((b) => b.bidId === id);
    if (i < 0) return res.status(404).json({ error: "bid 404" });
    
    if (!bids[i].milestones[milestoneIndex]) {
      return res.status(400).json({ error: "milestone not found" });
    }
    
    bids[i].milestones[milestoneIndex].completed = true;
    bids[i].milestones[milestoneIndex].completionDate = new Date().toISOString();
    bids[i].milestones[milestoneIndex].proof = proof || "";
    
    // Check if all milestones are completed
    const allCompleted = bids[i].milestones.every(m => m.completed);
    if (allCompleted) {
      bids[i].status = "completed";
    }
    
    await bidsDB.write(bids);
    res.json({ ok: true, bidId: id, milestoneIndex });
  } catch (error) {
    console.error('Error completing milestone:', error);
    res.status(500).json({ error: "Failed to complete milestone" });
  }
});

// Pay milestone with real USDT/USDC
app.post("/bids/:id/pay-milestone", async (req, res) => {
  try {
    const id = toNumber(req.params.id, -1);
    const { milestoneIndex } = req.body;
    
    const bids = await bidsDB.read();
    const i = bids.findIndex((b) => b.bidId === id);
    if (i < 0) return res.status(404).json({ error: "bid 404" });
    
    const bid = bids[i];
    const milestone = bid.milestones[milestoneIndex];
    
    if (!milestone) {
      return res.status(400).json({ error: "milestone not found" });
    }
    
    if (!milestone.completed) {
      return res.status(400).json({ error: "milestone not completed" });
    }
    
    if (milestone.paymentTxHash) {
      return res.status(400).json({ error: "milestone already paid" });
    }
    
    // Send payment using blockchain
    const paymentResult = await blockchainService.sendToken(
      bid.preferredStablecoin,
      bid.walletAddress,
      milestone.amount
    );
    
    // Update milestone with payment info
    milestone.paymentTxHash = paymentResult.transactionHash;
    milestone.paymentDate = new Date().toISOString();
    
    await bidsDB.write(bids);
    
    res.json({
      ok: true,
      bidId: id,
      milestoneIndex,
      transactionHash: paymentResult.transactionHash
    });
  } catch (error) {
    console.error('Error paying milestone:', error);
    res.status(500).json({ 
      error: error.message || "Failed to pay milestone",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Centralized error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message 
  });
});

// Helpful JSON 404 for API-ish paths
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.match(/^\/(proposals|bids|ipfs|health|test|balances|transaction)/)) {
    return res.status(404).json({ error: "route 404" });
  }
  next();
});

// ========== Environment Validation ==========
function validateEnv() {
  // Set default CORS_ORIGIN if not provided
  if (!process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN = 'https://lithiumx.netlify.app';
  }
  
  // Only require PINATA_JWT in production
  if (process.env.NODE_ENV === 'production' && !process.env.PINATA_JWT) {
    console.error('Missing required environment variable: PINATA_JWT');
    process.exit(1);
  }
}

// ========== Start ==========
validateEnv();

// Initialize databases and start server
async function startServer() {
  try {
    // Ensure databases are initialized
    await proposalsDB.read();
    await bidsDB.read();
    
    app.listen(PORT, () => {
      console.log(`[api] listening on :${PORT}`);
      console.log(`[api] CORS origin: ${CORS_ORIGIN}`);
      console.log(`[api] Pinata configured: ${!!PINATA_JWT}`);
      console.log(`[api] Blockchain configured: ${blockchainService.isConfigured()}`);
      
      if (blockchainService.isConfigured()) {
        console.log(`[api] Signer address: ${blockchainService.signer.address}`);
      }
      
      console.log(`[api] Test endpoint: http://localhost:${PORT}/test`);
      console.log(`[api] Health endpoint: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();