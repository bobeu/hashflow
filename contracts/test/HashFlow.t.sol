// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {HashFlowEscrow} from "../src/HashFlowEscrow.sol";
import {MockVault}       from "../src/MockVault.sol";
import {MockERC20}       from "../src/MockERC20.sol";
import {MockHSP}         from "../src/MockHSP.sol";
import {MockZKVerifier}  from "../src/MockZKVerifier.sol";
import {IZKVerifier}    from "../src/interfaces/IZKVerifier.sol";

/**
 * @title HashFlowTest
 * @author HashFlow Protocol
 * @notice Comprehensive Foundry test suite covering all phases of settlement.
 */
contract HashFlowTest is Test {
    // ─────────────────────────────────────────────────────────────────────────
    // Actors
    // ─────────────────────────────────────────────────────────────────────────

    address internal owner    = makeAddr("owner");
    address internal client   = makeAddr("client");
    address internal worker   = makeAddr("worker");
    address internal taxVault = makeAddr("taxVault");
    address internal regionalVault = makeAddr("regionalVault");
    address internal serviceVault  = makeAddr("serviceVault");
    address internal attacker = makeAddr("attacker");

    // ─────────────────────────────────────────────────────────────────────────
    // Protocol contracts
    // ─────────────────────────────────────────────────────────────────────────

    MockERC20       internal token;
    MockVault       internal vault;
    HashFlowEscrow  internal escrow;
    MockHSP         internal hsp;
    MockZKVerifier  internal zk;

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 internal constant ONE_THOUSAND = 1_000e6;
    uint256 internal constant ONE_HUNDRED  =   100e6;
    uint256 internal constant FIVE         =     5e6;

    uint16  internal constant TAX_10PCT    = 1_000;
    uint16  internal constant TAX_5PCT     =   500;

    // ─────────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        token = new MockERC20("Mock USD", "mUSD", 6);
        vault = new MockVault(address(token), owner);

        escrow = new HashFlowEscrow(
            address(token),
            address(vault),
            taxVault,
            address(0),
            owner
        );

        hsp = new MockHSP(address(token), address(escrow));
        zk = new MockZKVerifier();

        vm.startPrank(owner);
        escrow.setHSPAddress(address(hsp));
        escrow.setZKVerifier(address(zk));
        escrow.setTaxVaults(regionalVault, serviceVault);
        vm.stopPrank();

        zk.setVerificationStatus(worker, true);
        token.mint(client,  10_000e6);
        token.mint(owner,    1_000e6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper utilities
    // ─────────────────────────────────────────────────────────────────────────

    function _createEscrow(uint256 amount, uint16 taxBP, address recipient) internal returns (uint256 id) {
        vm.startPrank(client);
        token.approve(address(escrow), amount);
        id = escrow.createEscrow(worker, recipient, amount, taxBP);
        vm.stopPrank();
    }

    function _createEscrow(uint256 amount, uint16 taxBP) internal returns (uint256 id) {
        return _createEscrow(amount, taxBP, regionalVault);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Tests ───────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    function test_Phase1_BasicEscrowAndRelease() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);
        vm.prank(client);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(worker),        900e6);
        assertEq(token.balanceOf(regionalVault), 100e6);
    }

    function test_Phase1_MilestoneStateAfterCreation() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);
        (uint256 amount, address mClient, address mWorker, uint16 taxBP, bool released, , uint256 shares, address recipient) = escrow.milestones(id);
        assertEq(amount, ONE_THOUSAND);
        assertEq(mClient, client);
        assertEq(mWorker, worker);
        assertEq(taxBP, TAX_10PCT);
        assertFalse(released);
        assertGt(shares, 0);
        assertEq(recipient, regionalVault);
    }

    function test_Phase2_YieldSplitWithTax() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);
        vm.startPrank(owner);
        token.approve(address(vault), FIVE);
        vault.simulateYield(FIVE);
        vm.stopPrank();

        vm.prank(client);
        escrow.releaseMilestone(id);

        assertEq(token.balanceOf(regionalVault), 5_000_000, "Tax correct");
        assertApproxEqAbs(token.balanceOf(worker), 97_500_000, 1, "Worker payout correct");
    }

    function test_Phase3_HSPTrigger() public {
        vm.prank(client);
        token.approve(address(hsp), ONE_HUNDRED);
        uint256 id = hsp.triggerPayment(client, worker, regionalVault, ONE_HUNDRED, 0);
        vm.prank(client);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(worker), ONE_HUNDRED);
    }

    function test_Phase4_ZKGate() public {
        address unverified = makeAddr("unverified");
        vm.startPrank(client);
        token.approve(address(escrow), ONE_HUNDRED);
        vm.expectRevert(HashFlowEscrow.NotVerified.selector);
        escrow.createEscrow(unverified, regionalVault, ONE_HUNDRED, 0);
        vm.stopPrank();
    }

    function test_Phase7_Multitenancy() public {
        address clientB = makeAddr("clientB");
        token.mint(clientB, ONE_THOUSAND);

        _createEscrow(ONE_HUNDRED, 0); // Client A

        vm.startPrank(clientB);
        token.approve(address(escrow), 200e6);
        escrow.createEscrow(worker, regionalVault, 100e6, 0);
        escrow.createEscrow(worker, regionalVault, 100e6, 0);
        vm.stopPrank();

        assertEq(escrow.getMyMilestones(client).length, 1);
        assertEq(escrow.getMyMilestones(clientB).length, 2);
    }

    function test_CustomTaxRecipient() public {
        address hk = makeAddr("HK_IRD");
        address sg = makeAddr("SG_IRAS");

        uint256 idA = _createEscrow(ONE_THOUSAND, TAX_10PCT, hk);
        
        address clientB = makeAddr("clientB");
        token.mint(clientB, ONE_THOUSAND);
        vm.startPrank(clientB);
        token.approve(address(escrow), ONE_THOUSAND);
        uint256 idB = escrow.createEscrow(worker, sg, ONE_THOUSAND, TAX_10PCT);
        vm.stopPrank();

        vm.prank(client);
        escrow.releaseMilestone(idA);
        assertEq(token.balanceOf(hk), 100e6);

        vm.prank(clientB);
        escrow.releaseMilestone(idB);
        assertEq(token.balanceOf(sg), 100e6);
    }
}
