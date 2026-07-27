"use client";

import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  
  const [solBalance, setSolBalance] = useState(0);
  const [tokenMint, setTokenMint] = useState("");
  const [tokenBalance, setTokenBalance] = useState("0.00");
  const [tokenPrice, setTokenPrice] = useState("0.00");
  const [targetPrice, setTargetPrice] = useState("");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  // تحديث رصيد السولانا الحي من المحفظة
  useEffect(() => {
    if (!publicKey || !connection) return;
    
    const updateBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / 1e9);
      } catch (e) {
        console.error("خطأ في جلب رصيد السولانا:", e);
      }
    };

    updateBalance();
    const interval = setInterval(updateBalance, 15000);
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  // دالة رصد سعر العملة الحقيقي ورصيدك في المحفظة عبر DexScreener
  const trackCustomToken = async () => {
    if (!tokenMint.trim()) {
      alert("الرجاء إدخال عنوان عقد العملة (Mint) أولاً!");
      return;
    }
    try {
      // جلب السعر اللحظي من DexScreener (بدون حجب)
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
      const data = await response.json();
      const price = data.pairs?.[0]?.priceUsd;
      setTokenPrice(price ? `$${price}` : "غير متاح (لا توجد سيولة نشطة)");
      
      // جلب رصيد العملة الموجود فعلياً في محفظة Phantom الخاصة بك
      if (publicKey) {
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { 
          programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") 
        });
        const myToken = accounts.value.find(a => a.account.data.parsed.info.mint === tokenMint.trim());
        setTokenBalance(myToken ? myToken.account.data.parsed.info.tokenAmount.uiAmountString : "0");
      }
    } catch (e) { 
      console.error("خطأ في الاتصال:", e);
      setTokenPrice("خطأ في جلب السعر");
    }
  };

  // محرك المراقبة الذكية (Take Profit Monitor)
  const toggleMonitor = () => {
    if (!targetPrice || !tokenMint) {
      alert("الرجاء تحديد عقد العملة والسعر المستهدف للبيع!");
      return;
    }
    setIsMonitoring(!isMonitoring);
  };

  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
        const data = await response.json();
        const currentPrice = parseFloat(data.pairs?.[0]?.priceUsd || 0);
        const target = parseFloat(targetPrice);

        setTokenPrice(currentPrice ? `$${currentPrice}` : "غير متاح");

        // إذا وصل السعر المستهدف أو تجاوز، نقوم بتنفيذ البيع التلقائي للأرباح!
        if (currentPrice >= target && parseFloat(tokenBalance) > 0) {
          setIsMonitoring(false);
          alert("🎉 تم الوصول للسعر المستهدف! جاري تنفيذ أمر البيع...");
          await executeSell();
        }
      } catch (err) {
        console.error("خطأ في محرك المراقبة:", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isMonitoring, targetPrice, tokenMint, tokenBalance]);

  // دالة البيع السريع والآمن عبر السيرفر الداخلي و Jupiter
  const executeSell = async () => {
    try {
      if (!publicKey) {
        alert("الرجاء ربط المحفظة أولاً!");
        return;
      }

      const inputMint = tokenMint.trim();
      const outputMint = "So11111111111111111111111111111111111111112"; // SOL
      const amountToSell = Math.floor(parseFloat(tokenBalance) * 1e6); // تعديل حسب تفاصيل التوكن

      if (amountToSell <= 0) {
        alert("رصيدك من هذه العملة يساوي صفر!");
        return;
      }

      // جلب التسعيرة للبيع عبر السيرفر الداخلي الآمن
      const res = await fetch(`/api/jupiter?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountToSell}&slippageBps=100`);
      const quote = await res.json();

      if (!quote || quote.error) {
        alert("فشل جلب تسعيرة البيع: " + (quote.error || "تأكد من وجود سيولة كافية للعملة"));
        return;
      }

      // طلب معاملة البيع
      const swapRes = await fetch('/api/jupiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: "auto"
        })
      });
      
      const swapData = await swapRes.json();
      if (!swapData.swapTransaction) {
        alert("لم يتم استرجاع معاملة البيع من السيرفر");
        return;
      }

      const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      alert("تمت عملية البيع بنجاح وتحويل الأرباح إلى SOL! 🚀💰");
      trackCustomToken(); // تحديث الأرصدة فوراً
    } catch (e: any) {
      console.error("خطأ في عملية البيع:", e);
      alert("حدث خطأ أثناء البيع: " + (e.message || e));
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex flex-col items-center p-10 gap-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold text-purple-400">منصة إدارة الأصول والأرباح (Pro)</h1>
      <WalletMultiButton />
      
      <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-purple-500 shadow-xl flex flex-col gap-4">
        <div className="bg-gray-700/50 p-3 rounded-xl border border-gray-600">
          <p className="text-sm text-gray-300">رصيد السولانا:</p>
          <p className="text-xl font-bold text-green-400">{solBalance.toFixed(4)} SOL</p>
        </div>

        <div className="bg-gray-700/50 p-3 rounded-xl border border-gray-600">
          <p className="text-sm text-gray-300">رصيد العملة المستهدفة:</p>
          <p className="text-lg font-bold text-blue-400">{tokenBalance}</p>
          <p className="text-xs text-gray-400 mt-1">السعر الحي: <span className="text-white font-semibold">{tokenPrice}</span></p>
        </div>
        
        <input 
          className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-400 text-sm" 
          placeholder="عنوان عقد العملة (Mint Address)" 
          value={tokenMint}
          onChange={(e) => setTokenMint(e.target.value)} 
        />
        
        <input 
          className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-400 text-sm" 
          placeholder="سعر جني الأرباح المستهدف بالدولار ($)" 
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)} 
        />
        
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button 
            onClick={trackCustomToken} 
            className="bg-blue-600 hover:bg-blue-700 p-2.5 rounded-lg font-semibold transition text-sm shadow-md"
          >
            تحديث السعر والرصيد
          </button>
          
          <button 
            onClick={executeSell} 
            className="bg-red-600 hover:bg-red-700 p-2.5 rounded-lg font-semibold transition text-sm shadow-md"
          >
            بيع فوري (يدوي)
          </button>
        </div>

        <button 
          onClick={toggleMonitor} 
          className={`w-full p-3 rounded-lg font-bold transition shadow-lg text-sm mt-1 ${isMonitoring ? 'bg-yellow-600 hover:bg-yellow-700 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}`}
        >
          {isMonitoring ? "🛑 إيقاف مراقبة الأرباح" : "🚀 تفعيل مراقبة جني الأرباح (Take Profit)"}
        </button>
      </div>
    </main>
  );
}