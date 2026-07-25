import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const inputMint = searchParams.get('inputMint');
    const outputMint = searchParams.get('outputMint');
    const amount = searchParams.get('amount');
    const slippageBps = searchParams.get('slippageBps');

    // تحقق من وجود البيانات الأساسية لمنع انهيار السيرفر
    if (!inputMint || !outputMint || !amount) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const targetUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps || 50}`;
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    });
    
    // إذا فشل جلب التسعير من Jupiter (مثلاً التوكن غير مدعوم أو لا توجد سيولة)، نرجع استجابة واضحة بدلاً من خطأ 500
    if (!response.ok) {
      return NextResponse.json({ error: "Jupiter liquidity not found for this token" }, { status: 400 });
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    // حتى لو حدث استثناء، نمنع الـ 500 ونعطي خطأ مفهوم
    return NextResponse.json({ error: error.message || "Internal Server Error handled safely" }, { status: 400 });
  }
}