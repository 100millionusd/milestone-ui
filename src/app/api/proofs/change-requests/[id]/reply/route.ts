import { NextResponse } from 'next/server';
export { POST } from '../respond/route';

export function GET() {
  return NextResponse.json({ error: 'Use POST' }, { status: 405 });
}
