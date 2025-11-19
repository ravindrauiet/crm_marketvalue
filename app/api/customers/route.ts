import { NextRequest, NextResponse } from 'next/server';
import { listCustomers, createCustomer } from '@/lib/customers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get('q') || undefined;
  const customers = await listCustomers(query);
  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const customer = await createCustomer(data);
    return NextResponse.json(customer);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}





