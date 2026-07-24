import type { Metadata } from "next";
import "./globals.css";
import WalletContextProvider from "./WalletContextProvider";

export const metadata: Metadata = {
  title: "مِختبر Web3 الاستراتيجي",
  description: "لوحة تحكم البوتات الذكية",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {/* تغليف الموقع بالكامل ببيئة سولانا اللامركزية */}
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}