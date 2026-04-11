# HashFlow Smart Contracts 🧠

This directory contains the core settlement logic for the **HashFlow Protocol**, including yield-collateralized escrows and institutional jurisdictional tax routing.

## 🏗️ Architecture

- **`HashFlowEscrow.sol`**: The primary settlement engine. Implements jurisdictional routing, yield fees, and compliance gates.
- **`IHashFlowEscrow.sol`**: Interface for institutional and frontend integration.
- **`MockVault.sol`**: ERC-4626 implementation for simulating institutional yield generation.
- **`MockHSP.sol`**: Simulates the HashKey Settlement Protocol for automated payment triggering.
- **`MockZKVerifier.sol`**: Simulates the ZK-Identity compliance gate.

---

## 🚀 Getting Started

### **1. Prerequisites**
Ensure you have **Foundry** installed. If not, run:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### **2. Initialization**
From the root of the repository, run the setup script:
```bash
./init.sh
```

---

## 🛠️ Compilation & Development

### **Build**
Compile the contracts and generate ABIs:
```bash
cd contracts
forge build
```

### **Clean**
If you encounter compilation artifacts issues:
```bash
forge clean
```

---

## 🧪 Testing Suite

HashFlow maintains a high-fidelity test suite covering 27+ institutional scenarios, including rounding error protection and yield-fee precision.

### **Run All Tests**
```bash
forge test
```

### **Gas Analysis**
To verify the efficiency of the Multi-Jurisdictional Registry:
```bash
forge test --gas-report
```

### **Verbosity**
For detailed traces:
```bash
forge test -vvv
```

---

## 🚢 Deployment

### **1. Local Simulation (Anvil)**
Start a local HashKey simulation environment:
```bash
anvil --block-time 12
```

In a new terminal, deploy the contracts:
```bash
# This script deploys the core protocol and mock infrastructure
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### **2. HashKey Chain Testnet**
1. Update the `.env` file in the root directory with your `PRIVATE_KEY`.
2. Deploy using the Testnet RPC:
```bash
# Replace with the actual HashKey RPC URL
forge script script/Deploy.s.sol:Deploy --rpc-url https://hashkeychain-testnet.alt.technology --broadcast --private-key $PRIVATE_KEY
```

---

## 🛡️ Security & Math

- **Shadow Spread**: Revenue is decoupled from merchant principal. We only take a `yieldFeeBP` from the *excess interest*.
- **Sacrosanct Tax**: Tax is remitted 1:1 to the jurisdictional authority before any yield splits are calculated.
- **Precision**: We use the "Multiplication before Division" principle for all basis-point calculations to prevent rounding leaks.
