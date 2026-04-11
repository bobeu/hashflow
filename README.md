# HashFlow Protocol ⚡
**Global PayFi Engine | Yield-Collateralized Compliance | ZK-Identity Gated**

HashFlow is the premier settlement layer for the HashKey ecosystem. We transform stagnant escrow capital into productive, yield-bearing assets using a "Regulatory-Clean" architecture.

## 🚀 The Triple-Track Advantage
HashFlow is engineered to dominate three core hackathon tracks:

### 1. PayFi (HashKey Settlement Protocol)
By integrating as a specialized handler for the **HashKey Settlement Protocol (HSP)**, HashFlow allows institutions to bridge the gap between high-volume settlement and DeFi yield. It's the first "Smart Gateway" for HashKey merchants.

### 2. DeFi (ERC-4626 "Shadow Spread")
We decouple protocol revenue from settlement principal.
* **Merchants**: Pay 0% principal fees.
* **Governments**: Receive 100% of jurisdictional tax.
* **HashFlow**: Monetizes the **Shadow Spread** (a programmable % of the interest generated).

### 3. ZKID (Compliance-as-Code)
Settlements are gated by **ZK-Identity verification**. This ensures institutional-grade KYC/AML compliance without exposing sensitive user data on-chain.

---

## 🏗️ Technical Breakthroughs

### **Multitenant Singleton Architecture**
Unlike typical "One-Contract-Per-User" designs, HashFlow uses a high-performance **Singleton Model**.
* **On-Chain Indexing**: We implement `clientMilestones` mapping directly in the contract.
* **Data Sovereignty**: If the blockchain is up, the Merchant Dashboard is up. No reliance on third-party indexers or Subgraphs ensures 100% data availability for regulated entities.

### **Jurisdictional Routing**
HashFlow is globally compliant. Each milestone can define a unique `taxRecipient`. Whether you are remitting to the HK IRD or a custom UAE authority, the "Global Shredder" logic routes funds with 100% precision.

---

## ⚖️ Judge's Verification Guide

### **Project Structure**
* `/contracts/src`: The "Brain"—featuring `HashFlowEscrow.sol` with multi-jurisdictional logic.
* `/frontend/src`: The "CFO Command Center"—a Next.js 16 dashboard featuring real-time yield tickers and ZK-status indicators.

### **Execution**
```bash
# 1. Initialize the environment
./init.sh

# 2. Verify the Math (27+ Passing Tests)
cd contracts && forge test --gas-report

# 3. Launch the Merchant Hub
cd frontend && npm run dev
```
