import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Web3Provider } from "@/providers/web3-provider";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HashFlow Protocol | CFO Command Center",
  description: "Next-generation PayFi Settlement & Tax Routing Dashboard",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.variable} ${jetBrainsMono.variable} font-sans min-h-full bg-background antialiased`}
      >
        <Web3Provider>
          <Suspense fallback={null}>
            {children}
          </Suspense>
          <Toaster position="top-right" richColors />
        </Web3Provider>
      </body>
    </html>
  );
}
