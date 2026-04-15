# HashFlow Protocol: The Global PayFi & Compliance Engine

**Institutional-Grade Settlement | Yield-Collateralized Payouts | ZK-Identity Gated**

HashFlow is a high-performance settlement layer built natively for the **HashKey Chain**. We solve the "Idle Capital" problem in global payroll and institutional settlement by transforming stagnant escrow funds into productive, yield-bearing assets through a "Regulatory-Clean" architecture.

---

## The Triple-Track Advantage
HashFlow is architected to unify three critical sectors of the Web3 economy:

### 1. PayFi (HashKey Settlement Protocol)
HashFlow serves as a specialized handler for the **HashKey Settlement Protocol (HSP)**. We bridge the gap between regulated, high-volume merchant settlements and on-chain DeFi yield. By routing payments through our engine, institutions maintain absolute compliance while maximizing capital efficiency.

### 2. DeFi (The "Shadow Spread" Model)
We have decoupled protocol revenue from the settlement principal to provide a zero-cost experience for merchants.
* **Merchants**: Pay 0% fees on the principal settlement.
* **Governments**: Receive 100% of jurisdictional tax, remitted automatically upon release.
* **HashFlow**: Monetizes the **Shadow Spread**—a programmable percentage (default 30%) captured exclusively from the accrued DeFi yield.

### 3. ZKID (Compliance-as-Code)
Settlements are gated by **ZK-Identity verification**. By integrating with the **HashKey KycSBT**, we ensure that payouts are only directed to verified, non-sanctioned entities. This provides institutional-grade KYC/AML compliance without exposing sensitive personal data on-chain.

---

## Technical Architecture & Breakthroughs

### **Multitenant Singleton Model**
HashFlow rejects the inefficient "one-contract-per-user" design in favor of a high-performance **Singleton Architecture**.
* **On-Chain Indexing**: We implement a `clientMilestones` mapping directly in the contract, allowing merchants to retrieve their full history gas-efficiently.
* **Data Availability**: By storing indexing data on-chain, the Merchant Dashboard remains 100% functional as long as the blockchain is live, removing dependencies on third-party indexers like Subgraphs.

### **EIP-3009 "One-Click" Settlement**
We utilize the **EIP-3009 (Transfer with Authorization)** standard to provide an "Apple Pay" experience for institutional users. Merchants sign an off-chain EIP-712 message, allowing the protocol to "pull" funds gaslessly and initiate escrows in a single step.

### **Global Jurisdictional Routing**
HashFlow is designed for a fragmented regulatory landscape. Every milestone can define a unique `taxRecipient`. The "Global Shredder" logic ensures that whether remitting to the HK IRD or a custom UAE authority, funds are routed with 100% precision upon settlement release.

---

## Project Structure

### **`/contracts` (The Settlement Engine)**
* **`HashFlowEscrow.sol`**: The core logic handling EIP-3009 authorizations, ERC-4626 staking, and tax shredding.
* **`MockVault.sol`**: A pull-based ERC-4626 vault that simulates time-weighted yield growth backed by an admin allowance.
* **`MockUSDC_EIP3009.sol`**: A FiatTokenV2.2 compliant mock for testing gasless authorizations on the HashKey Testnet.

### **`/frontend` (The CFO Command Center)**
* **Context-Provider Architecture**: Centralized data management via `HashFlowContext.tsx` for real-time state across components.
* **Modular Components**: Specialized directories for `/analytics` (TVL/Yield), `/escrow` (Settlement Flows), and `/compliance` (ZK-Gating).
* **Multicall Integration**: Aggregates all on-chain data into a single RPC request for a seamless, "ticking" dashboard experience.

---

## Judge's Verification Guide

### **Live Environment Settings**
* **Network**: HashKey Chain Testnet (Chain ID: 133)
* **Settlement Token**: Official HashKey USDC (`0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6`)
* **HashFlowEscrow**: `0xB3a66718355Bc95Ff8Fb96e70AAd649487D51A5d`
* **HMockVault**: `0x60D83f53792f084333FD9D915300f2fbAa906Ed0`

### **Execution Commands**
```bash
# 1. Initialize the Environment
./init.sh

# 2. Run Comprehensive Test Suite (Math & Security)
cd contracts && forge test --gas-report

# 3. Build & Launch the Merchant Hub (Using Bun for Performance)
cd frontend && bun install && bun run dev
```



---

**Built with Precision for the HashKey Ecosystem.**
*Isaac J | Full-Stack Web3 Developer & Co-Founder*