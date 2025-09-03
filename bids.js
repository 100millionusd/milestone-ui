cat > data/bids.json << 'EOF'
[
  {
    "bidId": 3,
    "proposalId": 8,
    "vendorName": "1",
    "priceUSD": 5000,
    "days": 1,
    "notes": "",
    "walletAddress": "0x6Ea01052F315EBf1a4E907eF3B6CC1006D37Ce9D",
    "preferredStablecoin": "USDT",
    "milestones": [
      {
        "name": "Milestone 1",
        "amount": 5000,
        "dueDate": "2025-08-29T16:25:14.657Z",
        "completed": true,
        "completionDate": "2025-08-29T16:25:14.657Z",
        "proof": "",
        "paymentTxHash": null,
        "paymentDate": null
      }
    ],
    "doc": null,
    "status": "completed",
    "createdAt": "2025-08-29T16:25:14.657Z",
    "payments": []
  }
]
EOF

