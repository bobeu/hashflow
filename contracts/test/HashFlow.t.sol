// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console2 } from "forge-std/Test.sol";
import { HashFlowEscrow } from "../src/HashFlowEscrow.sol";
import { MockVault } from "../src/MockVault.sol";
import { MockERC20 } from "../src/MockERC20.sol";
import { MockHSP } from "../src/MockHSP.sol";
import { MockZKVerifier } from "../src/MockZKVerifier.sol";
import { IZKVerifier } from "../src/interfaces/IZKVerifier.sol";

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
            address(0),
            owner
        );

        hsp = new MockHSP(address(token), address(escrow));
        zk = new MockZKVerifier();

        vm.startPrank(owner);
        escrow.setHSPAddress(address(hsp));
        escrow.setZKVerifier(address(zk));
        escrow.setAutoServiceFeeVault(serviceVault);
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

    function test_setTaxVaults_MilestoneSpecific() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);
        address newTaxVault = makeAddr("newTaxVault");

        // Try to update from non-client (Attacker)
        vm.prank(attacker);
        vm.expectRevert(HashFlowEscrow.NotClient.selector);
        escrow.setTaxVaults(newTaxVault, id);

        // Update from client
        vm.prank(client);
        escrow.setTaxVaults(newTaxVault, id);

        // Verify state
        (,,,,,,, address recipient) = escrow.milestones(id);
        assertEq(recipient, newTaxVault);

        // Verify routing on release
        vm.prank(client);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(newTaxVault), 5e6);
    }

    function test_setTaxRateBP_MilestoneSpecific() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);

        // Try to update from non-client
        vm.prank(attacker);
        vm.expectRevert(HashFlowEscrow.NotClient.selector);
        escrow.setTaxtRateBP(TAX_10PCT, id);

        // Update from client
        vm.prank(client);
        escrow.setTaxtRateBP(TAX_10PCT, id);

        // Verify state
        (,,, uint16 taxBP,,,,) = escrow.milestones(id);
        assertEq(taxBP, TAX_10PCT);

        // Verify calculation on release
        vm.prank(client);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(regionalVault), 10e6);
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

    // ─────────────────────────────────────────────────────────────────────────
    // Additional Tests: Owner Functions & Edge Cases
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetYieldFee() public {
        vm.prank(owner);
        escrow.setYieldFee(3000);
        assertEq(escrow.yieldFeeBP(), 3000);
    }

    function test_SetYieldFee_RevertWhenNotOwner() public {
        vm.prank(client);
        vm.expectRevert();
        escrow.setYieldFee(3000);
    }

    function test_SetYieldFee_RevertWhenTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(HashFlowEscrow.TaxRateTooHigh.selector);
        escrow.setYieldFee(10001);
    }

    function test_SetHSPAddress() public {
        address newHsp = makeAddr("newHSP");
        vm.prank(owner);
        escrow.setHSPAddress(newHsp);
        assertEq(escrow.hspAddress(), newHsp);
    }

    function test_SetHSPAddress_RevertWhenNotOwner() public {
        address newHsp = makeAddr("newHSP");
        vm.prank(client);
        vm.expectRevert();
        escrow.setHSPAddress(newHsp);
    }

    function test_SetZKVerifier() public {
        address newVerifier = makeAddr("newVerifier");
        vm.prank(owner);
        escrow.setZKVerifier(newVerifier);
        assertEq(escrow.zkVerifier(), newVerifier);
    }

    function test_SetZKVerifier_RevertWhenNotOwner() public {
        address newVerifier = makeAddr("newVerifier");
        vm.prank(client);
        vm.expectRevert();
        escrow.setZKVerifier(newVerifier);
    }

    function test_SetAutoServiceFeeVault() public {
        address newServiceVault = makeAddr("newServiceVault");
        vm.prank(owner);
        escrow.setAutoServiceFeeVault(newServiceVault);
        assertEq(escrow.autoServiceFeeVault(), newServiceVault);
    }

    function test_SetAutoServiceFeeVault_RevertWhenZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(HashFlowEscrow.ZeroAddress.selector);
        escrow.setAutoServiceFeeVault(address(0));
    }

    function test_GetPendingYield() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);
        
        vm.startPrank(owner);
        token.approve(address(vault), FIVE);
        vault.simulateYield(FIVE);
        vm.stopPrank();

        uint256 pendingYield = escrow.getPendingYield(id);
        assertGt(pendingYield, 0);
    }

    function test_GetPendingYield_RevertInvalidMilestone() public {
        vm.expectRevert(HashFlowEscrow.InvalidMilestoneId.selector);
        escrow.getPendingYield(999);
    }

    function test_MilestoneValue() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);
        uint256 value = escrow.milestoneValue(id);
        assertGt(value, 0);
    }

    function test_MilestoneValue_RevertInvalidMilestone() public {
        vm.expectRevert(HashFlowEscrow.InvalidMilestoneId.selector);
        escrow.milestoneValue(999);
    }

    function test_GetTotalTaxLiability() public {
        _createEscrow(ONE_HUNDRED, TAX_5PCT);
        
        uint256 liability = escrow.getTotalTaxLiability(client);
        assertEq(liability, 5e6);
    }

    function test_CreateEscrow_RevertZeroWorker() public {
        vm.startPrank(client);
        token.approve(address(escrow), ONE_HUNDRED);
        vm.expectRevert(HashFlowEscrow.ZeroAddress.selector);
        escrow.createEscrow(address(0), regionalVault, ONE_HUNDRED, TAX_5PCT);
        vm.stopPrank();
    }

    function test_CreateEscrow_RevertZeroTaxRecipient() public {
        vm.startPrank(client);
        token.approve(address(escrow), ONE_HUNDRED);
        vm.expectRevert(HashFlowEscrow.ZeroAddress.selector);
        escrow.createEscrow(worker, address(0), ONE_HUNDRED, TAX_5PCT);
        vm.stopPrank();
    }

    function test_CreateEscrow_RevertZeroAmount() public {
        vm.startPrank(client);
        token.approve(address(escrow), ONE_HUNDRED);
        vm.expectRevert(HashFlowEscrow.ZeroAmount.selector);
        escrow.createEscrow(worker, regionalVault, 0, TAX_5PCT);
        vm.stopPrank();
    }

    function test_CreateEscrow_RevertTaxRateTooHigh() public {
        vm.startPrank(client);
        token.approve(address(escrow), ONE_HUNDRED);
        vm.expectRevert(HashFlowEscrow.TaxRateTooHigh.selector);
        escrow.createEscrow(worker, regionalVault, ONE_HUNDRED, 10000);
        vm.stopPrank();
    }

    function test_ReleaseMilestone_RevertNotClient() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);
        vm.prank(attacker);
        vm.expectRevert(HashFlowEscrow.NotClient.selector);
        escrow.releaseMilestone(id);
    }

    function test_ReleaseMilestone_RevertAlreadyReleased() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);
        vm.prank(client);
        escrow.releaseMilestone(id);
        vm.prank(client);
        vm.expectRevert(HashFlowEscrow.AlreadyReleased.selector);
        escrow.releaseMilestone(id);
    }

    function test_ReleaseMilestone_RevertInvalidMilestone() public {
        vm.prank(client);
        vm.expectRevert(HashFlowEscrow.InvalidMilestoneId.selector);
        escrow.releaseMilestone(999);
    }

    function test_ReceiveHSPPayment_RevertNotHSP() public {
        vm.prank(client);
        vm.expectRevert(HashFlowEscrow.NotHSP.selector);
        escrow.receiveHSPPayment(client, worker, regionalVault, ONE_HUNDRED, 0);
    }

    function test_YieldDistributionCorrect() public {
        uint256 id = _createEscrow(ONE_HUNDRED, 0);
        
        vm.startPrank(owner);
        token.approve(address(vault), 10e6);
        vault.simulateYield(10e6);
        vm.stopPrank();

        uint256 workerBalanceBefore = token.balanceOf(worker);
        
        vm.prank(client);
        escrow.releaseMilestone(id);

        uint256 workerReceived = token.balanceOf(worker) - workerBalanceBefore;
        assertApproxEqAbs(workerReceived, 105e6, 1e6, "Worker gets principal + half yield");
        assertApproxEqAbs(token.balanceOf(serviceVault), 5e6, 1, "Platform gets half yield");
    }
}
