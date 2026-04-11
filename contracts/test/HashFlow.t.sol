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
 * @notice Comprehensive Foundry test suite covering:
 *   - Phase 1: Core escrow creation and release (tax math).
 *   - Phase 2: ERC-4626 yield generation and split math.
 *   - Phase 3: HashKey HSP callback flow and access control.
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

    /// @dev 6-decimal token amounts.
    uint256 internal constant ONE_THOUSAND = 1_000e6;
    uint256 internal constant ONE_HUNDRED  =   100e6;
    uint256 internal constant FIVE         =     5e6;

    uint16  internal constant TAX_10PCT    = 1_000;  // 10 % in basis points
    uint16  internal constant TAX_5PCT     =   500;  // 5 %

    // ─────────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        // Deploy mock token (6 decimals, like USDC).
        token = new MockERC20("Mock USD", "mUSD", 6);

        // Deploy mock ERC-4626 vault.
        vault = new MockVault(address(token), owner);

        // Deploy escrow — owner receives platform yield.
        escrow = new HashFlowEscrow(
            address(token),
            address(vault),
            taxVault,
            address(0),   // HSP not set yet; will be updated in Phase 3 tests.
            owner
        );

        // Deploy mock HSP and register it with the escrow.
        hsp = new MockHSP(address(token), address(escrow));
        
        // Deploy ZK Verifier.
        zk = new MockZKVerifier();

        vm.startPrank(owner);
        escrow.setHSPAddress(address(hsp));
        escrow.setZKVerifier(address(zk));
        escrow.setTaxVaults(regionalVault, serviceVault);
        vm.stopPrank();

        // Verify worker by default to simplify standard tests.
        zk.setVerificationStatus(worker, true);

        // Pre-mint tokens to test actors.
        token.mint(client,  10_000e6);
        token.mint(owner,    1_000e6);   // Owner needs tokens to inject yield.
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper utilities
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Client approves escrow and creates a milestone. Returns the milestone ID.
    function _createEscrow(uint256 amount, uint16 taxBP) internal returns (uint256 id) {
        vm.startPrank(client);
        token.approve(address(escrow), amount);
        id = escrow.createEscrow(worker, amount, taxBP);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Phase 1: Core Escrow & Tax Math ─────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice $1 000 deposit at 10 % tax → $900 to worker, $100 to taxVault.
     *         This is the primary acceptance criterion from Prompt 1.
     */
    function test_Phase1_BasicEscrowAndRelease() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);

        // Verify funds left client and entered vault.
        assertEq(token.balanceOf(client),          9_000e6, "Client balance after deposit");
        assertEq(token.balanceOf(address(escrow)),       0, "Escrow holds no raw tokens");
        assertGt(token.balanceOf(address(vault)),        0, "Vault received tokens");

        // Snapshot owner balance before release — setUp mints 1_000e6 to owner.
        uint256 ownerBefore = token.balanceOf(owner);

        // Release the milestone.
        vm.prank(client);
        escrow.releaseMilestone(id);

        // Assert distributions (no yield in this test — 1:1 share ratio).
        assertEq(token.balanceOf(worker),        900e6, "Worker received 900");
        assertEq(token.balanceOf(regionalVault),  80e6, "RegionalVault received 80");
        assertEq(token.balanceOf(serviceVault),   20e6, "ServiceVault received 20");
        // Owner should receive no platform yield when totalAssets == principal.
        assertEq(token.balanceOf(owner), ownerBefore, "No yield, owner balance unchanged");
    }

    /**
     * @notice Verifies the milestone state is correctly set after creation.
     */
    function test_Phase1_MilestoneStateAfterCreation() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);

        (
            uint256 amount,
            address mClient,
            address mWorker,
            uint16  taxBP,
            bool    isReleased,
            uint256 startTime,
            uint256 shares
        ) = escrow.milestones(id);

        assertEq(amount,     ONE_THOUSAND, "Amount stored");
        assertEq(mClient,    client,       "Client stored");
        assertEq(mWorker,    worker,       "Worker stored");
        assertEq(taxBP,      TAX_10PCT,    "Tax BP stored");
        assertFalse(isReleased,            "Not yet released");
        assertEq(startTime,  block.timestamp, "Start time recorded");
        assertGt(shares,     0,            "Shares received from vault");
    }

    /**
     * @notice Verifies events are emitted correctly on creation and release.
     * @dev    Ordering matters: the ERC-20 Approval event fired by token.approve() must
     *         come BEFORE vm.expectEmit is armed, otherwise Forge would match on the
     *         Approval event instead of EscrowCreated.
     *         checkData = false for EscrowCreated because the exact shares amount is
     *         not known at declaration time; share accuracy is covered by math tests.
     */
    function test_Phase1_EventsEmitted() public {
        // 1. Approve first so Approval event fires before expectEmit is armed.
        vm.startPrank(client);
        token.approve(address(escrow), ONE_THOUSAND);

        // 2. Arm expectEmit — next event from address(escrow) must be EscrowCreated.
        vm.expectEmit(true, true, true, false, address(escrow));
        emit HashFlowEscrow.EscrowCreated(0, client, worker, ONE_THOUSAND, TAX_10PCT, 0);
        uint256 id = escrow.createEscrow(worker, ONE_THOUSAND, TAX_10PCT);
        vm.stopPrank();

        // 3. Arm for MilestoneReleased — checks milestoneId + worker (indexed).
        vm.expectEmit(true, true, false, false, address(escrow));
        emit HashFlowEscrow.MilestoneReleased(id, worker, 0, 0, 0, 0, 0);
        vm.prank(client);
        escrow.releaseMilestone(id);
    }

    /**
     * @notice Only the client should be able to release a milestone.
     */
    function test_Phase1_RevertIf_NotClient() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);
        vm.expectRevert(HashFlowEscrow.NotClient.selector);
        vm.prank(attacker);
        escrow.releaseMilestone(id);
    }

    /**
     * @notice Double-release must revert with {AlreadyReleased}.
     */
    function test_Phase1_RevertIf_AlreadyReleased() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);
        vm.prank(client);
        escrow.releaseMilestone(id);

        vm.expectRevert(HashFlowEscrow.AlreadyReleased.selector);
        vm.prank(client);
        escrow.releaseMilestone(id);
    }

    /**
     * @notice Zero-amount creates must revert.
     */
    function test_Phase1_RevertIf_ZeroAmount() public {
        vm.startPrank(client);
        token.approve(address(escrow), 0);
        vm.expectRevert(HashFlowEscrow.ZeroAmount.selector);
        escrow.createEscrow(worker, 0, TAX_10PCT);
        vm.stopPrank();
    }

    /**
     * @notice Tax rate at or above 100 % (10 000 BP) must revert.
     */
    function test_Phase1_RevertIf_TaxRateTooHigh() public {
        vm.startPrank(client);
        token.approve(address(escrow), ONE_THOUSAND);
        vm.expectRevert(HashFlowEscrow.TaxRateTooHigh.selector);
        escrow.createEscrow(worker, ONE_THOUSAND, 10_000);
        vm.stopPrank();
    }

    /**
     * @notice Querying a non-existent milestone must revert.
     */
    function test_Phase1_RevertIf_InvalidMilestoneId() public {
        vm.expectRevert(HashFlowEscrow.InvalidMilestoneId.selector);
        escrow.milestoneValue(999);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Phase 2: ERC-4626 Yield Math ────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice $100 principal grows to ~$105 (5 % simulated yield).
     *
     *         The OZ ERC-4626 implementation uses a virtual offset of 1 share + 1 asset
     *         to guard against inflation attacks (EIP-4626 §Security Considerations).
     *         This causes `convertToAssets` and `redeem` to return values that are 1 wei
     *         less than the naive arithmetic result:
     *
     *           totalAssets via convertToAssets = 104_999_999   (not 105_000_000)
     *           excessYield = 104_999_999 - 100_000_000 = 4_999_999
     *           workerYield = 4_999_999 / 2             = 2_499_999  (rounded down)
     *           platformYield = 4_999_999 - 2_499_999   = 2_500_000
     *
     *         Both the view helper and the distribution honour the same rounding so the
     *         total always equals totalAssets (conservation of tokens).
     */
    function test_Phase2_YieldSplitNoTax() public {
        uint256 id = _createEscrow(ONE_HUNDRED, 0); // 0 % tax

        // Inject $5 of simulated yield into the vault.
        vm.startPrank(owner);
        token.approve(address(vault), FIVE);
        vault.simulateYield(FIVE);
        vm.stopPrank();

        // Milestone value should reflect ~$105; OZ virtual-offset causes 1-wei shortfall.
        uint256 value = escrow.milestoneValue(id);
        assertApproxEqAbs(value, 105e6, 1, "Milestone value ~$105 after yield injection");

        uint256 workerBefore = token.balanceOf(worker);
        uint256 ownerBefore  = token.balanceOf(owner);

        vm.prank(client);
        escrow.releaseMilestone(id);

        uint256 workerGain   = token.balanceOf(worker) - workerBefore;
        uint256 platformGain = token.balanceOf(owner)  - ownerBefore;

        // Total distributed must equal totalAssets retrieved from vault.
        assertApproxEqAbs(workerGain + platformGain, 105e6, 1, "Conservation: worker + platform approx $105");
        // Yield split: each side gets ~$2.5 (1 wei tolerance for OZ rounding).
        assertApproxEqAbs(workerGain,   102_500_000, 1, "Worker: principal + ~half yield");
        assertApproxEqAbs(platformGain,   2_500_000, 1, "Platform: ~half yield");
    }

    /**
     * @notice $100 principal grows to ~$105 with a 5 % tax.
     *         Due to the OZ ERC-4626 virtual-offset (see test_Phase2_YieldSplitNoTax),
     *         values are within 1 wei of the theoretical ideals:
     *           tax           = 100 × 5 %          = $5   (exact — from principal, no rounding)
     *           workerPayout  = 100 - 5             = $95  (exact)
     *           excessYield   ≈ 5 - 1 wei           ≈ $4 999 999
     *           workerYield   = excessYield / 2     ≈ $2 499 999
     *           platformYield = excessYield - half  ≈ $2 500 000
     */
    function test_Phase2_YieldSplitWithTax() public {
        uint256 id = _createEscrow(ONE_HUNDRED, TAX_5PCT);

        // Inject $5 yield.
        vm.startPrank(owner);
        token.approve(address(vault), FIVE);
        vault.simulateYield(FIVE);
        vm.stopPrank();

        uint256 workerBefore   = token.balanceOf(worker);
        uint256 regionalVaultBefore = token.balanceOf(regionalVault);
        uint256 serviceVaultBefore  = token.balanceOf(serviceVault);
        uint256 ownerBefore    = token.balanceOf(owner);

        vm.prank(client);
        escrow.releaseMilestone(id);

        uint256 workerGain         = token.balanceOf(worker)        - workerBefore;
        uint256 regionalTaxGain    = token.balanceOf(regionalVault) - regionalVaultBefore;
        uint256 serviceFeeGain     = token.balanceOf(serviceVault)  - serviceVaultBefore;
        uint256 platformGain       = token.balanceOf(owner)         - ownerBefore;

        // Total tax (5% of 100 = 5) split 80/20 -> 4 government, 1 platform service.
        assertEq(regionalTaxGain, 4_000_000, "RegionalVault: $4 tax");
        assertEq(serviceFeeGain,  1_000_000, "ServiceVault: $1 service fee");

        // Worker: $95 principal payout + ~$2.5 yield share ≈ $97.5 (1 wei tol.).
        assertApproxEqAbs(workerGain,  97_500_000, 1, "Worker: 95 + ~2.5");
        // Platform: ~$2.5 yield share (1 wei tolerance).
        assertApproxEqAbs(platformGain, 2_500_000, 1, "Platform owner: ~2.5");
    }

    /**
     * @notice When total assets exactly equals principal (no yield), platform gets nothing.
     */
    function test_Phase2_NoYieldMeansNoYieldSplit() public {
        uint256 id = _createEscrow(ONE_HUNDRED, 0);

        uint256 ownerBefore = token.balanceOf(owner);

        vm.prank(client);
        escrow.releaseMilestone(id);

        // Owner should receive nothing since there was no yield.
        assertEq(token.balanceOf(owner), ownerBefore, "Owner gets nothing with no yield");
        assertEq(token.balanceOf(worker), ONE_HUNDRED, "Worker gets full principal");
    }

    /**
     * @notice Multiple independent milestones can co-exist and are released independently.
     */
    function test_Phase2_MultipleMilestones() public {
        uint256 id0 = _createEscrow(ONE_THOUSAND, TAX_10PCT);
        uint256 id1 = _createEscrow(ONE_HUNDRED,  TAX_5PCT);

        assertEq(id0, 0, "First milestone ID");
        assertEq(id1, 1, "Second milestone ID");

        // Release only the first milestone.
        vm.prank(client);
        escrow.releaseMilestone(id0);

        // Second milestone should still be locked.
        (, , , , bool released, , ) = escrow.milestones(id1);
        assertFalse(released, "Second milestone not yet released");

        // Release the second milestone.
        vm.prank(client);
        escrow.releaseMilestone(id1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Phase 3: HSP Integration & Access Control ────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice HSP can trigger escrow creation on behalf of a client.
     *         Validates the $100 → ~$105 yield scenario through the HSP callback path.
     *         Same 1-wei OZ virtual-offset applies as in the direct escrow yield tests.
     */
    function test_Phase3_HSPTriggerAndYield() public {
        // Client approves HSP to pull tokens.
        vm.prank(client);
        token.approve(address(hsp), ONE_HUNDRED);

        // HSP triggers the payment.
        uint256 id = hsp.triggerPayment(client, worker, ONE_HUNDRED, 0);
        assertEq(id, 0, "First HSP milestone ID");

        // Inject $5 simulated yield.
        vm.startPrank(owner);
        token.approve(address(vault), FIVE);
        vault.simulateYield(FIVE);
        vm.stopPrank();

        uint256 workerBefore  = token.balanceOf(worker);
        uint256 ownerBefore   = token.balanceOf(owner);

        // The `client` field stored in the milestone is the actual client address,
        // so client must release (not the HSP).
        vm.prank(client);
        escrow.releaseMilestone(id);

        uint256 workerGain   = token.balanceOf(worker) - workerBefore;
        uint256 platformGain = token.balanceOf(owner)  - ownerBefore;

        // $100 principal + ~$2.5 yield (1 wei tolerance for OZ virtual shares).
        assertApproxEqAbs(workerGain,   102_500_000, 1, "Worker: principal + ~half yield via HSP");
        assertApproxEqAbs(platformGain,   2_500_000, 1, "Platform: ~half yield via HSP");
    }

    /**
     * @notice Direct call to {receiveHSPPayment} from a non-HSP address must revert.
     */
    function test_Phase3_RevertIf_DirectHSPCallByAttacker() public {
        vm.expectRevert(HashFlowEscrow.NotHSP.selector);
        vm.prank(attacker);
        escrow.receiveHSPPayment(client, worker, ONE_HUNDRED, 0);
    }

    /**
     * @notice Only the owner can update the HSP address.
     */
    function test_Phase3_OnlyOwnerCanSetHSPAddress() public {
        vm.expectRevert();
        vm.prank(attacker);
        escrow.setHSPAddress(attacker);
    }

    /**
     * @notice Owner can successfully update the HSP address.
     */
    function test_Phase3_OwnerUpdatesHSPAddress() public {
        address newHsp = makeAddr("newHsp");
        vm.prank(owner);
        escrow.setHSPAddress(newHsp);
        assertEq(escrow.hspAddress(), newHsp, "HSP address updated");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Gas Benchmarks (informational) ──────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Measures gas for createEscrow (logged via console2).
     */
    function test_Gas_CreateEscrow() public {
        vm.startPrank(client);
        token.approve(address(escrow), ONE_THOUSAND);
        uint256 gasBefore = gasleft();
        escrow.createEscrow(worker, ONE_THOUSAND, TAX_10PCT);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();
        console2.log("createEscrow gas:", gasUsed);
    }

    /**
     * @notice Measures gas for releaseMilestone (logged via console2).
     */
    function test_Gas_ReleaseMilestone() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);
        uint256 gasBefore = gasleft();
        vm.prank(client);
        escrow.releaseMilestone(id);
        uint256 gasUsed = gasBefore - gasleft();
        console2.log("releaseMilestone gas:", gasUsed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Phase 4: ZK-Compliance Gate Tests ────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Escrow creation must revert if the worker is not ZK-verified.
     */
    function test_Phase4_RevertIf_WorkerNotVerified() public {
        address unverifiedWorker = makeAddr("unverified");
        // No need to set anything in zk mock, it's false by default.

        vm.startPrank(client);
        token.approve(address(escrow), ONE_THOUSAND);
        vm.expectRevert(HashFlowEscrow.NotVerified.selector);
        escrow.createEscrow(unverifiedWorker, ONE_THOUSAND, TAX_10PCT);
        vm.stopPrank();
    }

    /**
     * @notice Verified workers can successfully have escrows created for them.
     */
    function test_Phase4_VerifiedWorkerSuccess() public {
        address verifiedWorker = makeAddr("verified");
        zk.setVerificationStatus(verifiedWorker, true);

        vm.startPrank(client);
        token.approve(address(escrow), ONE_THOUSAND);
        uint256 id = escrow.createEscrow(verifiedWorker, ONE_THOUSAND, TAX_10PCT);
        vm.stopPrank();

        (, , address mWorker, , , , ) = escrow.milestones(id);
        assertEq(mWorker, verifiedWorker, "Escrow created for verified worker");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Phase 5: Multi-Jurisdictional Tax Tests ─────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice $1 000 deposit at 10 % tax ($100 tax) → $80 to Gov, $20 to Service.
     */
    function test_Phase5_TaxShreddingSplit() public {
        uint256 id = _createEscrow(ONE_THOUSAND, TAX_10PCT);

        // Expect FundsShredded(id, 100e6, 80e6, 20e6)
        vm.expectEmit(true, true, true, true, address(escrow));
        emit HashFlowEscrow.FundsShredded(id, 100e6, 80e6, 20e6);

        vm.prank(client);
        escrow.releaseMilestone(id);

        assertEq(token.balanceOf(regionalVault), 80e6, "80% to Government");
        assertEq(token.balanceOf(serviceVault),  20e6, "20% to Service Fee");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Phase 6: Merchant Analytics View Tests ──────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Pending yield should reflect (totalAssets - principal).
     */
    function test_Phase6_GetPendingYield() public {
        uint256 id = _createEscrow(ONE_HUNDRED, 0);

        // Inject 5e6 yield.
        vm.startPrank(owner);
        token.approve(address(vault), FIVE);
        vault.simulateYield(FIVE);
        vm.stopPrank();

        uint256 pending = escrow.getPendingYield(id);
        // Recall OZ virtual offset: 5e6 becomes 4_999_999.
        assertApproxEqAbs(pending, 5e6, 1, "Pending yield approx 5e6");
    }

    /**
     * @notice Aggregates tax liability across multiple active escrows.
     */
    function test_Phase6_TotalTaxLiability() public {
        // Milestone 0: 1000 @ 10% = 100 liability.
        _createEscrow(ONE_THOUSAND, TAX_10PCT);
        // Milestone 1: 100 @ 5% = 5 liability.
        _createEscrow(ONE_HUNDRED, TAX_5PCT);

        uint256 liability = escrow.getTotalTaxLiability(client);
        assertEq(liability, 100e6 + 5e6, "Total liability is 105");

        // Release one milestone -> liability should decrease.
        vm.prank(client);
        escrow.releaseMilestone(0);

        assertEq(escrow.getTotalTaxLiability(client), 5e6, "Liability after release");
    }
}
