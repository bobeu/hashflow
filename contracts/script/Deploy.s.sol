// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20}        from "../src/MockERC20.sol";
import {MockVault}        from "../src/MockVault.sol";
import {MockHSP}          from "../src/MockHSP.sol";
import {HashFlowEscrow}   from "../src/HashFlowEscrow.sol";

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
 *            PLATFORM_ADDRESS   — platform owner that receives 50 % of yield.
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

    MockERC20      internal token;
    MockVault      internal vault;
    HashFlowEscrow internal escrow;
    MockHSP        internal hsp;

    // ─────────────────────────────────────────────────────────────────────────
    // Entry point
    // ─────────────────────────────────────────────────────────────────────────

    function run() external {
        // Load environment — fallback to msg.sender for local / fork runs.
        deployer      = vm.envOr("DEPLOYER_ADDRESS",  msg.sender);
        taxVault      = vm.envOr("TAX_VAULT_ADDRESS", msg.sender);
        platformOwner = vm.envOr("PLATFORM_ADDRESS",  msg.sender);

        console2.log("=== HashFlow Protocol Deployment ===");
        console2.log("Deployer     :", deployer);
        console2.log("Tax Vault    :", taxVault);
        console2.log("Platform     :", platformOwner);
        console2.log("Chain ID     :", block.chainid);
        console2.log("------------------------------------");

        vm.startBroadcast();

        // ── Step 1: Settlement token ──────────────────────────────────────────
        token = new MockERC20("Mock USD", "mUSD", 6);
        console2.log("MockERC20 deployed      :", address(token));

        // ── Step 2: ERC-4626 yield vault ─────────────────────────────────────
        vault = new MockVault(address(token), platformOwner);
        console2.log("MockVault deployed      :", address(vault));

        // ── Step 3: Core escrow (no HSP yet — set below) ─────────────────────
        escrow = new HashFlowEscrow(
            address(token),
            address(vault),
            taxVault,
            address(0),    // HSP address — registered after MockHSP deployment.
            platformOwner
        );
        console2.log("HashFlowEscrow deployed :", address(escrow));

        // ── Step 4: Mock HSP caller ───────────────────────────────────────────
        hsp = new MockHSP(address(token), address(escrow));
        console2.log("MockHSP deployed        :", address(hsp));

        // ── Step 5: Link HSP with the escrow ─────────────────────────────────
        // This requires the broadcast signer to be the escrow's owner (platformOwner).
        // On testnet the deployer and platformOwner should be the same address.
        escrow.setHSPAddress(address(hsp));
        console2.log("HSP registered          :", address(hsp));

        vm.stopBroadcast();

        // ── Deployment summary ────────────────────────────────────────────────
        console2.log("====================================");
        console2.log("Deployment complete. Copy these addresses to your .env / frontend:");
        console2.log("  SETTLEMENT_TOKEN=", address(token));
        console2.log("  VAULT_ADDRESS    =", address(vault));
        console2.log("  ESCROW_ADDRESS   =", address(escrow));
        console2.log("  HSP_ADDRESS      =", address(hsp));
        console2.log("====================================");
    }
}
