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
  const [tokenPrice, setTokenPrice] = useState(0);
  const [targetPrice, setTargetPrice] = useState("");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [savedTokens, setSavedTokens] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { 
    setIsMounted(true); 
    const loadedTokens = localStorage.getItem("my_saved_tokens");
    if (loadedTokens) {
      try {
        setSavedTokens(JSON.parse(loadedTokens));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

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

  // حفظ العملة الحالية في القائمة المفضلة
  const saveTokenToWatchlist = () => {
    if (!tokenMint.trim()) return;
    if (savedTokens.includes(tokenMint.trim())) {
      alert("هذه العملة موجودة مسبقاً في القائمة المفضلة!");
      return;
    }
    const updated = [...savedTokens, tokenMint.trim()];
    setSavedTokens(updated);
    localStorage.setItem("my_saved_tokens", JSON.stringify(updated));
    alert("تمت إضافة العملة إلى القائمة بنجاح! ⭐");
  };

  // حذف عملة من القائمة
  const removeTokenFromWatchlist = (mintToRemove: string) => {
    const updated = savedTokens.filter(t => t !== mintToRemove);
    setSavedTokens(updated);
    localStorage.setItem("my_saved_tokens", JSON.stringify(updated));
  };

  // دالة إرسال تنبيه تيليجرام داخلياً
  const sendTelegramAlert = async (text: string) => {
    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
    } catch (err) {
      console.error("خطأ في إرسال إشعار تيليجرام:", err);
    }
  };

  // دالة رصد سعر العملة الحقيقي ورصيدك في المحفظة عبر DexScreener
  const trackCustomToken = async (mintToTrack?: string) => {
    const targetMint = mintToTrack || tokenMint.trim();
    if (!targetMint) {
      alert("الرجاء إدخال أو اختيار عقد العملة أولاً!");
      return;
    }
    
    if (mintToTrack) {
      setTokenMint(mintToTrack);
    }

    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${targetMint}`);
      const data = await response.json();
      const price = parseFloat(data.pairs?.[0]?.priceUsd || 0);
      setTokenPrice(price);
      
      if (publicKey) {
        const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { 
          programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") 
        });
        const myToken = accounts.value.find(a => a.account.data.parsed.info.mint === targetMint);
        setTokenBalance(myToken ? myToken.account.data.parsed.info.tokenAmount.uiAmountString : "0");
      }
    } catch (e) { 
      console.error("خطأ في الاتصال:", e);
      setTokenPrice(0);
    }
  };

  // حساب القيمة الإجمالية للتوكن بالدولار
  const totalHoldingValue = (parseFloat(tokenBalance) * tokenPrice).toFixed(2);

  // محرك المراقبة الذكية (Take Profit Monitor) مع تنبيه تيليجرام
  const toggleMonitor = () => {
    if (!targetPrice || !tokenMint) {
      alert("الرجاء تحديد عقد العملة والسعر المستهدف للبيع!");
      return;
    }
    const newState = !isMonitoring;
    setIsMonitoring(newState);
    if (newState) {
      sendTelegramAlert(`🚨 *تم بدء مراقبة العملة بنجاح!*\nالعقد: \`${tokenMint.slice(0,6)}...\`\nالسعر المستهدف: $${targetPrice}`);
    }
  };

  useEffect(() => {
    if (!isMonitoring) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint.trim()}`);
        const data = await response.json();
        const currentPrice = parseFloat(data.pairs?.[0]?.priceUsd || 0);
        const target = parseFloat(targetPrice);

        setTokenPrice(currentPrice);

        if (currentPrice >= target && parseFloat(tokenBalance) > 0) {
          setIsMonitoring(false);
          await sendTelegramAlert(`🎉 *تنبيه تحقيق الهدف (Take Profit)!*\nالسعر الحالي وصل إلى: *$${currentPrice}*\nجاري تنفيذ أمر البيع تلقائياً... 💰`);
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
      const amountToSell = Math.floor(parseFloat(tokenBalance) * 1e6);

      if (amountToSell <= 0) {
        alert("رصيدك من هذه العملة يساوي صفر!");
        return;
      }

      const res = await fetch(`/api/jupiter?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountToSell}&slippageBps=100`);
      const quote = await res.json();

      if (!quote || quote.error) {
        alert("فشل جلب تسعيرة البيع: " + (quote.error || "تأكد من وجود سيولة كافية للعملة"));
        return;
      }

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
      
      await sendTelegramAlert(`✅ *تمت عملية البيع بنجاح وتحويل الأرباح إلى SOL!* 🚀💰`);
      alert("تمت عملية البيع بنجاح وتحويل الأرباح إلى SOL! 🚀💰");
      trackCustomToken();
    } catch (e: any) {
      console.error("خطأ في عملية البيع:", e);
      await sendTelegramAlert(`❌ *فشلت عملية البيع:* ${e.message || e}`);
      alert("حدث خطأ أثناء البيع: " + (e.message || e));
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex flex-col items-center p-10 gap-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold text-purple-400">منصة تتبع الأصول والأرباح (Pro)</h1>
      <WalletMultiButton />
      
      <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-md border border-purple-500 shadow-xl flex flex-col gap-4">
        {/* شريط الأرصدة العلوي */}
        <div className="bg-gray-700/50 p-3 rounded-xl border border-gray-600 grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-gray-300">رصيد السولانا:</p>
            <p className="text-base font-bold text-green-400">{solBalance.toFixed(4)} SOL</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-300">السعر الحي:</p>
            <p className="text-sm font-semibold text-white">{tokenPrice > 0 ? `$${tokenPrice}` : "غير متاح"}</p>
          </div>
        </div>

        {/* لوحة الأرباح والقيمة الإجمالية (PnL Tracker) */}
        <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 p-3.5 rounded-xl border border-purple-500/40 flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-300">رصيد العملة:</p>
            <p className="text-base font-bold text-blue-400">{tokenBalance}</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-purple-300 font-medium">القيمة الإجمالية ($):</p>
            <p className="text-lg font-extrabold text-yellow-400">${totalHoldingValue}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <input 
            className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-400 text-xs" 
            placeholder="عنوان عقد العملة (Mint Address)" 
            value={tokenMint}
            onChange={(e) => setTokenMint(e.target.value)} 
          />
          <button 
            onClick={saveTokenToWatchlist} 
            className="bg-yellow-600 hover:bg-yellow-700 px-3 rounded-lg text-xs font-bold transition shadow"
            title="حفظ في المفضلة"
          >
            ⭐ حفظ
          </button>
        </div>

        {/* قائمة العملات المحفوظة */}
        {savedTokens.length > 0 && (
          <div className="bg-gray-900/60 p-3 rounded-xl border border-gray-700">
            <p className="text-xs font-semibold text-gray-400 mb-2">⭐ العملات المفضلة لديك:</p>
            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
              {savedTokens.map((token, idx) => (
                <div key={idx} className="flex justify-between items-center bg-gray-800 p-2 rounded-lg border border-gray-700">
                  <span className="text-xs font-mono text-purple-300 truncate w-48" title={token}>
                    {token.slice(0, 6)}...{token.slice(-6)}
                  </span>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => trackCustomToken(token)} 
                      className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs transition"
                    >
                      اختيار
                    </button>
                    <button 
                      onClick={() => removeTokenFromWatchlist(token)} 
                      className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <input 
          className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-purple-400 text-xs" 
          placeholder="سعر جني الأرباح المستهدف بالدولار ($)" 
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)} 
        />
        
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button 
            onClick={() => trackCustomToken()} 
            className="bg-blue-600 hover:bg-blue-700 p-2.5 rounded-lg font-semibold transition text-xs shadow-md"
          >
            تحديث السعر والقيمة
          </button>
          
          <button 
            onClick={executeSell} 
            className="bg-red-600 hover:bg-red-700 p-2.5 rounded-lg font-semibold transition text-xs shadow-md"
          >
            بيع فوري (يدوي)
          </button>
        </div>

        <button 
          onClick={toggleMonitor} 
          className={`w-full p-3 rounded-lg font-bold transition shadow-lg text-xs ${isMonitoring ? 'bg-yellow-600 hover:bg-yellow-700 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}`}
        >
          {isMonitoring ? "🛑 إيقاف مراقبة الأرباح" : "🚀 تفعيل مراقبة جني الأرباح مع تنبيه تيليجرام"}
        </button>
      </div>
    </main>
  );
}