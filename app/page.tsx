"use client";

import React, { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Home() {
  // 1. استخدام useConnection للحصول على الاتصال الموثوق
  const { connection } = useConnection();
  // 2. استخدام useWallet للحصول على المحفظة والعمليات
  const { publicKey, connected, sendTransaction } = useWallet();
  
  const [solBalance, setSolBalance] = useState(0);
  const [tokenMint, setTokenMint] = useState("");
  const [tokenBalance, setTokenBalance] = useState("0.00");
  const [tokenPrice, setTokenPrice] = useState("0.00");
  const [targetPrice, setTargetPrice] = useState("");
  const [isSniperActive, setIsSniperActive] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

// تحديث الرصيد الحي (الطريقة الصحيحة البرمجياً)
   useEffect(() => {
     if (!publicKey || !connection) return;
     
     const updateBalance = async () => {
       const balance = await connection.getBalance(publicKey);
       // ... باقي الكود الخاص بك لتحديث الرصيد
     };

     updateBalance();
   }, [publicKey, connection]);
  // دالة الرصد
  const trackCustomToken = async () => {
    if (!tokenMint) return;
    setTokenLoading(true);
    try {
      // 1. جلب السعر (يعمل بدون محفظة)
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
      const data = await response.json();
      const price = data.pairs?.[0]?.priceUsd;
      setTokenPrice(price ? `$${price}` : "غير متاح");
      
      // 2. جلب الرصيد (استخدام الاتصال الثابت الجديد)
      if (publicKey) {
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { 
          programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") 
        });
        const myToken = accounts.value.find(a => a.account.data.parsed.info.mint === tokenMint.trim());
        setTokenBalance(myToken ? myToken.account.data.parsed.info.tokenAmount.uiAmountString : "0");
      }
    } catch (e) { 
      console.error("خطأ في الاتصال:", e);
      setTokenPrice("خطأ في الاتصال");
    }
    finally { setTokenLoading(false); }
  };
  // محرك القنص
  const startSniper = () => {
    if (!targetPrice || !tokenMint) return alert("حدد العملة والسعر المستهدف!");
    setIsSniperActive(true);
    
    const interval = setInterval(async () => {
      // جلب السعر
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
      const data = await response.json();
      const currentPrice = parseFloat(data.pairs?.[0]?.priceUsd || 0);

      // منطق الشراء التلقائي
      if (tokenBalance === "0" && currentPrice <= parseFloat(targetPrice)) {
        await executeSafeSwap("buy");
      } 
      // منطق البيع التلقائي (هدف ربح 20% مثلاً)
      else if (parseFloat(tokenBalance) > 0 && currentPrice >= parseFloat(targetPrice) * 1.2) {
        await executeSafeSwap("sell");
        setIsSniperActive(false);
        clearInterval(interval);
      }
    }, 10000); // يفحص كل 10 ثوانٍ لضمان عدم حظر الـ API
  };

  // دالة الشراء والبيع في دالة واحدة احترافية (Clean Code)
  const executeSafeSwap = async (action: "buy" | "sell") => {
    try {
      const inputMint = action === "buy" ? "So11111111111111111111111111111111111111112" : tokenMint;
      const outputMint = action === "buy" ? tokenMint : "So11111111111111111111111111111111111111112";

      const quoteRes = await fetch(`/api/jupiter?inputMint=${inputMint}&outputMint=${outputMint}&amount=100000&slippageBps=50`);
      const quote = await quoteRes.json();

      if (!quote || !quote.routePlan) {
        alert("فشل جلب التسعيرة");
        return;
      }

      const swapRes = await fetch('/api/jupiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey?.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: "auto"
        })
      });
      
      const { swapTransaction } = await swapRes.json();

      if (!swapTransaction) {
        alert("لم يتم استرجاع المعاملة");
        return;
      }

      const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      alert(`تمت العملية بنجاح! 🚀`);
    } catch (e) {
      console.error("خطأ:", e);
      alert("حدث خطأ في التنفيذ.");
    }
  };
  if (!isMounted) return null;

  return (
    <main className="flex flex-col items-center p-10 gap-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold text-purple-400">منصة التداول الذكي (Pro)</h1>
      <WalletMultiButton />
      
      <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-purple-500">
        <p className="text-lg">الرصيد: {solBalance.toFixed(4)} SOL</p>
        <p className="text-sm text-gray-400">رصيد العملة: {tokenBalance} | السعر: {tokenPrice}</p>
        
        <input className="w-full p-2 mt-4 rounded bg-gray-700" placeholder="عقد العملة" onChange={(e) => setTokenMint(e.target.value)} />
        <input className="w-full p-2 mt-2 rounded bg-gray-700" placeholder="السعر المستهدف (Buy at)" onChange={(e) => setTargetPrice(e.target.value)} />
        
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={trackCustomToken} className="bg-blue-600 p-2 rounded">رصد السعر</button>
          <button onClick={() => executeSafeSwap("buy")} className="bg-green-600 p-2 rounded">شراء يدوي</button>
          <button onClick={() => executeSafeSwap("sell")} className="bg-red-600 p-2 rounded">بيع يدوي</button>
          <button onClick={startSniper} className={`p-2 rounded ${isSniperActive ? 'bg-yellow-600' : 'bg-purple-600'}`}>
            {isSniperActive ? "يُراقب..." : "تفعيل التلقائي"}
          </button>
        </div>
      </div>
    </main>
  );
}