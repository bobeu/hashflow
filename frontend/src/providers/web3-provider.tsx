'use client';

import React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
  Chain,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

/**
 * HashKey Chain Testnet Definition
 */
const hashkeyTestnet = {
  id: 133,
  name: 'HashKey Testnet',
  nativeCurrency: { name: 'HashKey', symbol: 'HSK', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://hashkeychain-testnet.alt.technology'] },
    public: { http: ['https://hashkeychain-testnet.alt.technology'] },
  },
  blockExplorers: {
    default: { name: 'HashKey Explorer', url: 'https://hashkeychain-testnet-explorer.alt.technology' },
  },
  testnet: true,
} as const satisfies Chain;

/**
 * Local Anvil Definition (for development/simulation)
 */
const anvil = {
  id: 31337,
  name: 'Anvil Simulation',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
} as const satisfies Chain;

const config = getDefaultConfig({
  appName: 'HashFlow Protocol',
  projectId: 'YOUR_PROJECT_ID', // Replace or use PUBLIC_WALLETCONNECT_PROJECT_ID
  chains: [hashkeyTestnet, anvil],
  transports: {
    [hashkeyTestnet.id]: http(),
    [anvil.id]: http(),
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
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
