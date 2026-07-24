import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = `https://quote-api.jup.ag/v6/quote?${searchParams.toString()}`;
    
    // إضافة Headers وهمية ومتصفح وهمي لكي تقبلها Jupiter بدون حظر
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json({ error: data || "Jupiter API rejected the request" }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}