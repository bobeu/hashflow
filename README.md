# HashFlow Protocol ⚡️

**Institutional-Grade PayFi. Regulatory-Clean DeFi. Self-Sovereign Identity.**

HashFlow is the premier settlement engine for the HashKey ecosystem, transforming idle capital into active yields while maintaining absolute regulatory compliance and ZK-Identity verification.

## 🏆 The Triple-Track Advantage

HashFlow is uniquely designed to dominate three critical tracks:

### 1. PayFi (HashKey Settlement Protocol)
By integrating directly as an institutional entry point for the **HashKey Settlement Protocol (HSP)**, HashFlow transforms static merchant payments into dynamic, yield-bearing assets. It ensures that every dollar in transition is productive, programmable, and compliant.

### 2. DeFi (The EIP-4626 standard)
Built on the **Shadow Spread** model, HashFlow leverages ERC-4626 vaults to generate real yield. It decouples platform revenue from settlement principal—meaning merchants pay 0% principal fees, while the protocol captures a portion of the "Shadow Spread" (DeFi interest).

### 3. ZKID (Compliance-First Identity)
Every participant in the HashFlow economy is gated by **ZK-Identity**. Settlements only trigger when both parties are verified, ensuring institutional grade KYC/AML compliance at the smart contract level without compromising privacy.

---

## 🏗️ Technical Architecture

### **The "Shadow Spread" Revenue Model**
Traditional protocols tax the user's principal. **HashFlow is Regulatory-Clean.**
- **Tax (Sacrosanct)**: 100% of calculated tax is remitted directly to jurisdictional government vaults.
- **Protocol Revenue**: HashFlow monetizes the **DeFi Efficiency** by taking a percentage of the *Interest (Yield)* generated during the settlement period.

### **Self-Sovereign Indexing**
Unlike protocols that rely on third-party indexers (Subgraphs/Goldsky), HashFlow implements **On-Chain Indexing** via `clientMilestones`. This ensures 100% data availability and "Merchant Data Sovereignty"—if the blockchain is up, the merchant's dashboard is functional.

---

## 🚀 Quick Start (Judge Guide)

### **1. Environment Setup**
```bash
./init.sh
```

### **2. CFO Command Center (Frontend)**
Launch the institutional dashboard to see real-time yield aggregation and on-chain indexing in action:
```bash
cd hashflow/frontend
npm run dev
```

### **3. Smart Contract Verification**
Run the comprehensive test suite (27 passing tests) to verify the Regulatory-Clean logic:
```bash
cd hashflow/contracts
forge test --gas-report
```

---

## 💼 Merchant Operations Hub

The HashFlow Dashboard features:
- **Total Portfolio Yield**: Live ticker aggregating interest across all active flows.
- **Tax Liability Forecast**: Real-time preview of pending government remitments.
- **Institutional Escrow Form**: Unified interface for initiating compliant settlements.

---

*Powered by HashKey & Antigravity.*
