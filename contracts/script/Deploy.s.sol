// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { MockERC20 }        from "../src/MockERC20.sol";
import { MockUSDC_EIP3009 } from "../src/MockUSDC_EIP3009.sol";
import { MockVault }        from "../src/MockVault.sol";
import { MockHSP }          from "../src/MockHSP.sol";
import { HashFlowEscrow }   from "../src/HashFlowEscrow.sol";
import { MockZKVerifier }   from "../src/MockZKVerifier.sol";

/**
 * @title Deploy
 * @author HashFlow Protocol
 * @notice End-to-end deployment script for the HashFlow Settlement Protocol.
 *
 *         Deploys (in order):
 *           1. MockERC20      — a 6-decimal "mock USDC" settlement token.
 *           2. MockVault      — ERC-4626 vault that simulates yield.
 *           3. HashFlowEscrow — the primary settlement engine.
 *           4. MockHSP        — simulated HashKey Settlement Protocol caller.
 *
 *         After deployment the script:
 *           • Registers MockHSP with the escrow via {setHSPAddress}.
 *           • Logs all deployed addresses for easy front-end sync.
 *
 * @dev     Required environment variables (set in .env, never commit):
 *            DEPLOYER_ADDRESS   — wallet that broadcasts the transactions.
 *            TAX_VAULT_ADDRESS  — destination for collected tax (can equal DEPLOYER_ADDRESS on testnet).
 *            PLATFORM_ADDRESS   — platform owner that receives a portion of yield.
 *
 *          Run against HashKey testnet:
 *            forge script script/Deploy.s.sol:Deploy \
 *              --rpc-url hashkey_testnet \
 *              --broadcast \
 *              --private-key $PRIVATE_KEY
 */
contract Deploy is Script {
    // ─────────────────────────────────────────────────────────────────────────
    // Deploy parameters — loaded from environment.
    // ─────────────────────────────────────────────────────────────────────────

    address internal deployer;
    address internal taxVault;
    address internal platformOwner;

    // ─────────────────────────────────────────────────────────────────────────
    // Deployed addresses — stored for verification logging.
    // ─────────────────────────────────────────────────────────────────────────

    MockUSDC_EIP3009 internal token;
    MockVault      internal vault;
    HashFlowEscrow internal escrow;
    MockHSP        internal hsp;
    MockZKVerifier internal zk;

    // ─────────────────────────────────────────────────────────────────────────
    // Entry point
    // ─────────────────────────────────────────────────────────────────────────

    function run() external {
        // Load environment — fallback to msg.sender for local / fork runs.
        deployer      = vm.envOr("DEPLOYER_ADDRESS",  msg.sender);
        taxVault      = vm.envOr("TAX_VAULT_ADDRESS", msg.sender);
        platformOwner = vm.envOr("PLATFORM_ADDRESS",  msg.sender);

        address hspAddress = vm.envOr("HSP_ADDRESS", address(0));
        address serviceVault  = vm.envOr("AUTO_SERVICE_FEE_VAULT_ADDRESS", platformOwner);

        console2.log("=== HashFlow Protocol Deployment ===");
        console2.log("Deployer     :", deployer);
        console2.log("Tax Vault    :", taxVault);
        console2.log("Service Fee:", serviceVault);
        console2.log("Platform     :", platformOwner);
        console2.log("HSP Address  :", hspAddress);
        console2.log("Chain ID     :", block.chainid);
        console2.log("------------------------------------");

        vm.startBroadcast();

        // Settlement token ──────────────────────────────────────────
        token = new MockUSDC_EIP3009();
        console2.log("MockUSDC_EIP3009 deployed :", address(token));

        // ERC-4626 yield vault ─────────────────────────────────────
        vault = new MockVault(address(token), platformOwner);
        console2.log("MockVault deployed      :", address(vault));

        // ── Step 3: Core escrow ───────────────────────────────────────────
        // Use provided HSP address, or deploy MockHSP for local testing
        escrow = new HashFlowEscrow(
            address(token),
            address(vault),
            hspAddress,  // Use real HSP from env, or 0 for local testing
            platformOwner
        );
        console2.log("HashFlowEscrow deployed :", address(escrow));

        // ── Step 4: Deploy MockHSP for local testing if no real HSP provided ─
        if (hspAddress == address(0)) {
            hsp = new MockHSP(address(token), address(escrow));
            console2.log("MockHSP deployed        :", address(hsp));
            escrow.setHSPAddress(address(hsp));
            console2.log("HSP registered          :", address(hsp));
        } else {
            console2.log("Using real HSP address   :", hspAddress);
        }

        // ── Step 6: Deploy & Link ZK Verifier ────────────────────────────────
        zk = new MockZKVerifier();
        escrow.setZKVerifier(address(zk));
        console2.log("ZK Verifier deployed    :", address(zk));

        if (serviceVault != address(0)) {
            escrow.setAutoServiceFeeVault(serviceVault);
            console2.log("Service Fee Vault set   :", serviceVault);
        }

        vm.stopBroadcast();

        // ── Deployment summary ────────────────────────────────────────────────
        console2.log("====================================");
        console2.log("Deployment complete. Copy these addresses to your .env / frontend:");
        console2.log("  SETTLEMENT_TOKEN=", address(token));
        console2.log("  VAULT_ADDRESS    =", address(vault));
        console2.log("  ESCROW_ADDRESS   =", address(escrow));
        console2.log("  HSP_ADDRESS      =", hspAddress == address(0) ? address(hsp) : hspAddress);
        console2.log("  ZK_VERIFIER_ADDR =", address(zk));
        console2.log("====================================");
    }
}
