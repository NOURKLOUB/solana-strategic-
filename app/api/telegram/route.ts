import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    
    // ضع الـ Token والـ Chat ID الخاصين بك هنا بدلاً من النصوص الوهمية
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8762139772:AAFTWy1G28ZT7tFOfh-MkFbMjByYLzO9fUg";
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "5988240760";

    if (!BOT_TOKEN || BOT_TOKEN.includes("هنا")) {
      return NextResponse.json({ error: "Telegram Bot Token is missing" }, { status: 400 });
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || "Failed to send telegram message");
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Telegram API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}