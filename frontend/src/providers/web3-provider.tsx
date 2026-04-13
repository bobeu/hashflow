'use client';

import React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
  Chain,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { hashkeyTestnet, hashkey } from "wagmi/chains"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
  appName: 'HashFlow Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID as string, // Replace or use PUBLIC_WALLETCONNECT_PROJECT_ID
  chains: [hashkeyTestnet],
  transports: {
    [hashkeyTestnet.id]: http("https://testnet.hsk.xyz"),
    // [hashkey.id]: http(https://mainnet.hsk.xyz),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
            theme={lightTheme({
                accentColor: '#001B3D',
                accentColorForeground: 'white',
                borderRadius: 'medium',
            })}
            initialChain={hashkeyTestnet.id}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
