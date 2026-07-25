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
  const [isSniperActive, setIsSniperActive] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  // تحديث رصيد السولانا الحي
  useEffect(() => {
    if (!publicKey || !connection) return;
    
    const updateBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / 1e9); // التحويل من Lamports إلى SOL
      } catch (e) {
        console.error("خطأ في جلب رصيد السولانا:", e);
      }
    };

    updateBalance();
    const interval = setInterval(updateBalance, 15000); // تحديث كل 15 ثانية
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  // دالة الرصد والتتبع
  const trackCustomToken = async () => {
    if (!tokenMint) return;
    try {
      // 1. جلب السعر عبر DexScreener (لا يحتاج مفاتيح أو سيرفر)
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
      const data = await response.json();
      const price = data.pairs?.[0]?.priceUsd;
      setTokenPrice(price ? `$${price}` : "غير متاح");
      
      // 2. جلب رصيد التوكن الخاص بالمحفظة
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
  };

  // محرك القنص التلقائي
  const startSniper = () => {
    if (!targetPrice || !tokenMint) return alert("حدد العملة والسعر المستهدف!");
    setIsSniperActive(true);
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
        const data = await response.json();
        const currentPrice = parseFloat(data.pairs?.[0]?.priceUsd || 0);

        if (tokenBalance === "0" && currentPrice <= parseFloat(targetPrice)) {
          await executeSafeSwap("buy");
        } else if (parseFloat(tokenBalance) > 0 && currentPrice >= parseFloat(targetPrice) * 1.2) {
          await executeSafeSwap("sell");
          setIsSniperActive(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error("خطأ في محرك القنص:", err);
      }
    }, 10000); 
  };

  // دالة الشراء والبيع عبر Jupiter مع ضبط المعاملات
// دالة الشراء والبيع المباشرة والآمنة
  // دالة الشراء والبيع الآمنة الخالية من أي استدعاء خارجي محجوب
  const executeSafeSwap = async (action: "buy" | "sell") => {
    try {
      if (!publicKey) {
        alert("الرجاء ربط المحفظة أولاً!");
        return;
      }

      const inputMint = action === "buy" ? "So11111111111111111111111111111111111111112" : tokenMint;
      const outputMint = action === "buy" ? tokenMint : "So11111111111111111111111111111111111111112";
      const amount = action === "buy" ? 10000000 : Math.floor(parseFloat(tokenBalance) * 1e6);

      // نطلب البيانات من سيرفرنا الداخلي (/api/jupiter) وليس من Jupiter مباشرة لكي يتولى السيرفر المحاولة
      const res = await fetch(`/api/jupiter?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`);
      const quote = await res.json();

      if (!quote || quote.error) {
        alert("فشل جلب التسعيرة: " + (quote.error || "تأكد من صحة عقد العملة"));
        return;
      }

      // إرسال الطلب للسيرفر الداخلي
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
        alert("فشل إنشاء المعاملة من السيرفر");
        return;
      }

      const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      alert("تمت العملية بنجاح! 🚀");
    } catch (e: any) {
      console.error("خطأ في التنفيذ:", e);
      alert("حدث خطأ في التنفيذ: " + (e.message || e));
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex flex-col items-center p-10 gap-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold text-purple-400">منصة التداول الذكي (Pro)</h1>
      <WalletMultiButton />
      
      <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-purple-500 shadow-xl">
        <p className="text-lg">الرصيد: {solBalance.toFixed(4)} SOL</p>
        <p className="text-sm text-gray-400 mt-1">رصيد العملة: {tokenBalance} | السعر: {tokenPrice}</p>
        
        <input 
          className="w-full p-2 mt-4 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-400" 
          placeholder="عنوان عقد العملة (Mint)" 
          onChange={(e) => setTokenMint(e.target.value)} 
        />
        <input 
          className="w-full p-2 mt-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-400" 
          placeholder="السعر المستهدف للشراء ($)" 
          onChange={(e) => setTargetPrice(e.target.value)} 
        />
        
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={trackCustomToken} className="bg-blue-600 hover:bg-blue-700 p-2 rounded font-semibold transition">رصد السعر</button>
          <button onClick={() => executeSafeSwap("buy")} className="bg-green-600 hover:bg-green-700 p-2 rounded font-semibold transition">شراء يدوي</button>
          <button onClick={() => executeSafeSwap("sell")} className="bg-red-600 hover:bg-red-700 p-2 rounded font-semibold transition">بيع يدوي</button>
          <button onClick={startSniper} className={`p-2 rounded font-semibold transition ${isSniperActive ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
            {isSniperActive ? "يُراقب..." : "تفعيل التلقائي"}
          </button>
        </div>
      </div>
    </main>
  );
}