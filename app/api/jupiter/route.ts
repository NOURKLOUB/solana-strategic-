import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = `https://quote-api.jup.ag/v6/quote?${searchParams.toString()}`;
    
    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    const data = await response.json();
    
    // إذا رفضت Jupiter الطلب، سنطبع السبب الحقيقي في الـ Logs ونعيده للمتصفح
    if (!response.ok) {
      console.error("Jupiter API Error:", data);
      return NextResponse.json({ error: data.error || data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Internal Server Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}