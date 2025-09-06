// src/app/api/payment/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { blockchainService } from '@/lib/blockchain';

export async function POST(request: NextRequest) {
  try {
    const { toAddress, amount, tokenSymbol } = await request.json();

    // Validate input
    if (!toAddress || !amount || !tokenSymbol) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Send tokens using blockchain service
    let result;
    if (tokenSymbol === 'USDT') {
      result = await blockchainService.sendUSDT(toAddress, amount);
    } else if (tokenSymbol === 'USDC') {
      result = await blockchainService.sendUSDC(toAddress, amount);
    } else {
      return NextResponse.json(
        { error: 'Unsupported token symbol' },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send tokens' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Payment API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}