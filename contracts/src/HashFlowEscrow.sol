// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HashFlowEscrow
 * @author HashFlow Protocol
 * @notice Primary settlement engine for the HashFlow Protocol. Manages milestone-based
 *         escrow with ERC-4626 yield generation and HSP (HashKey Settlement Protocol)
 *         integration.
 * @dev Funds deposited into escrow are immediately forwarded into an ERC-4626 vault to
 *      accrue yield. On release the contract performs three distinct distributions:
 *        1. Worker payout  = principal − tax
 *        2. Tax vault      = tax (basis-points of principal)
 *        3. Yield split    = 50 % worker / 50 % platform (owner)
 *
 *      All token movements use OpenZeppelin's {SafeERC20} to guard against non-standard
 *      ERC-20 implementations. Reentrancy is prevented via {ReentrancyGuard}.
 */
contract HashFlowEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Represents a single escrow milestone.
     * @param amount      The principal amount (in token units) locked by the client.
     * @param client      The address that created (and can release) this escrow.
     * @param worker      The address that receives the net payout on release.
     * @param taxRateBP   Tax rate expressed in basis points (100 BP = 1 %).
     * @param isReleased  Whether the milestone has already been settled.
     * @param startTime   Block timestamp at which the escrow was created.
     * @param shares      ERC-4626 vault shares held on behalf of this milestone.
     */
    struct Milestone {
        uint256 amount;
        address client;
        address worker;
        uint16  taxRateBP;
        bool    isReleased;
        uint256 startTime;
        uint256 shares;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Basis-point denominator (10 000 BP = 100 %).
    uint256 public constant BP_DENOMINATOR = 10_000;

    // ─────────────────────────────────────────────────────────────────────────
    // Immutables
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The ERC-20 token used for all settlements.
    IERC20 public immutable settlementToken;

    /// @notice The ERC-4626 vault where idle funds earn yield.
    IERC4626 public immutable vault;

    /// @notice Recipient of the tax portion on each milestone release.
    address public immutable taxVault;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Auto-incrementing milestone counter.
    uint256 public milestoneCount;

    /// @notice Stores all milestones by their ID.
    mapping(uint256 => Milestone) public milestones;

    /// @notice Address authorised to call {receiveHSPPayment} (HashKey Settlement Protocol).
    address public hspAddress;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new escrow milestone is created.
     * @param milestoneId Unique ID of the newly created milestone.
     * @param client      Address that funded the escrow.
     * @param worker      Address that will receive the net payout.
     * @param amount      Principal amount locked.
     * @param taxRateBP   Tax rate in basis points.
     * @param shares      ERC-4626 vault shares minted for this milestone.
     */
    event EscrowCreated(
        uint256 indexed milestoneId,
        address indexed client,
        address indexed worker,
        uint256 amount,
        uint16  taxRateBP,
        uint256 shares
    );

    /**
     * @notice Emitted when a milestone is fully settled and funds distributed.
     * @param milestoneId      The milestone that was released.
     * @param worker           Recipient of the worker payout.
     * @param workerPayout     Principal amount transferred to the worker (after tax).
     * @param taxAmount        Tax amount transferred to the taxVault.
     * @param workerYield      Yield portion transferred to the worker (50 % of excess).
     * @param platformYield    Yield portion transferred to the platform owner (50 % of excess).
     * @param totalYield       Total yield earned (workerYield + platformYield).
     */
    event MilestoneReleased(
        uint256 indexed milestoneId,
        address indexed worker,
        uint256 workerPayout,
        uint256 taxAmount,
        uint256 workerYield,
        uint256 platformYield,
        uint256 totalYield
    );

    /**
     * @notice Emitted when the HSP authorised address is updated.
     * @param oldHsp Previous HSP address.
     * @param newHsp New HSP address.
     */
    event HSPAddressUpdated(address indexed oldHsp, address indexed newHsp);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Reverts when the caller is not the milestone's client.
    error NotClient();

    /// @notice Reverts when the milestone has already been released.
    error AlreadyReleased();

    /// @notice Reverts when the milestone does not exist.
    error InvalidMilestoneId();

    /// @notice Reverts when a zero-value escrow is attempted.
    error ZeroAmount();

    /// @notice Reverts when a zero-address is supplied where one is not allowed.
    error ZeroAddress();

    /// @notice Reverts when the caller is not the registered HSP.
    error NotHSP();

    /// @notice Reverts when tax rate would exceed or equal 100 %.
    error TaxRateTooHigh();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the HashFlowEscrow contract.
     * @param _settlementToken ERC-20 token used for all payments.
     * @param _vault           ERC-4626 compliant vault for yield generation.
     * @param _taxVault        Address that receives the tax on each release.
     * @param _hspAddress      Initial address of the HashKey Settlement Protocol caller.
     * @param _owner           Initial owner (platform address that receives half the yield).
     */
    constructor(
        address _settlementToken,
        address _vault,
        address _taxVault,
        address _hspAddress,
        address _owner
    ) Ownable(_owner) {
        if (_settlementToken == address(0)) revert ZeroAddress();
        if (_vault           == address(0)) revert ZeroAddress();
        if (_taxVault        == address(0)) revert ZeroAddress();
        if (_owner           == address(0)) revert ZeroAddress();

        settlementToken = IERC20(_settlementToken);
        vault           = IERC4626(_vault);
        taxVault        = _taxVault;
        hspAddress      = _hspAddress;  // Zero address disables HSP path
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Restricts function access to the registered HSP address.
    modifier onlyHSP() {
        if (msg.sender != hspAddress) revert NotHSP();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // External — Escrow Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Creates a new milestone escrow and immediately stakes funds in the vault.
     * @dev    The caller (client) must have pre-approved this contract to spend `_amount`
     *         of `settlementToken`. The contract deposits all received tokens into the
     *         ERC-4626 vault and records the shares obtained.
     *
     *         Tax-rate validation ensures `_taxRateBP < 10 000` (i.e. < 100 %).
     *
     * @param _worker     Address of the worker who will receive the payout.
     * @param _amount     Principal amount (in token units) to lock.
     * @param _taxRateBP  Tax rate in basis points (e.g. 1000 = 10 %).
     * @return milestoneId The ID assigned to the newly created milestone.
     */
    function createEscrow(
        address _worker,
        uint256 _amount,
        uint16  _taxRateBP
    ) external nonReentrant returns (uint256 milestoneId) {
        if (_worker   == address(0)) revert ZeroAddress();
        if (_amount   == 0)          revert ZeroAmount();
        if (_taxRateBP >= BP_DENOMINATOR) revert TaxRateTooHigh();

        milestoneId = milestoneCount++;

        // Pull tokens from client.
        settlementToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Approve vault and deposit to earn yield.
        settlementToken.forceApprove(address(vault), _amount);
        uint256 shares = vault.deposit(_amount, address(this));

        milestones[milestoneId] = Milestone({
            amount:     _amount,
            client:     msg.sender,
            worker:     _worker,
            taxRateBP:  _taxRateBP,
            isReleased: false,
            startTime:  block.timestamp,
            shares:     shares
        });

        emit EscrowCreated(milestoneId, msg.sender, _worker, _amount, _taxRateBP, shares);
    }

    /**
     * @notice Releases a milestone, distributing principal and yield to all parties.
     * @dev    Only the milestone's `client` may call this function.
     *
     *         Distribution logic:
     *           totalAssets  = vault.redeem(shares) → all tokens retrieved
     *           tax          = principal × taxRateBP / 10 000
     *           workerPayout = principal − tax
     *           excessYield  = totalAssets − principal  (clamped to zero if negative)
     *           workerYield  = excessYield / 2
     *           platformYield= excessYield − workerYield  (handles odd wei)
     *
     * @param _milestoneId ID of the milestone to release.
     */
    function releaseMilestone(uint256 _milestoneId) external nonReentrant {
        _validateAndMarkReleased(_milestoneId);
        _distribute(_milestoneId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // External — HSP Integration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Entry point for the HashKey Settlement Protocol to trigger escrow creation.
     * @dev    This function mirrors {createEscrow} but is restricted to the registered
     *         `hspAddress`. The HSP is expected to have pre-approved this contract to
     *         spend `_amount` of `settlementToken` on behalf of the actual client.
     *
     * @param _client     Address of the client on whose behalf the escrow is created.
     * @param _worker     Address of the worker.
     * @param _amount     Principal amount to lock.
     * @param _taxRateBP  Tax rate in basis points.
     * @return milestoneId The ID assigned to the newly created milestone.
     */
    function receiveHSPPayment(
        address _client,
        address _worker,
        uint256 _amount,
        uint16  _taxRateBP
    ) external onlyHSP nonReentrant returns (uint256 milestoneId) {
        if (_client   == address(0)) revert ZeroAddress();
        if (_worker   == address(0)) revert ZeroAddress();
        if (_amount   == 0)          revert ZeroAmount();
        if (_taxRateBP >= BP_DENOMINATOR) revert TaxRateTooHigh();

        milestoneId = milestoneCount++;

        // Pull tokens from the HSP contract (which acts as the client proxy).
        settlementToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Approve vault and deposit.
        settlementToken.forceApprove(address(vault), _amount);
        uint256 shares = vault.deposit(_amount, address(this));

        milestones[milestoneId] = Milestone({
            amount:     _amount,
            client:     _client,
            worker:     _worker,
            taxRateBP:  _taxRateBP,
            isReleased: false,
            startTime:  block.timestamp,
            shares:     shares
        });

        emit EscrowCreated(milestoneId, _client, _worker, _amount, _taxRateBP, shares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // External — Owner Administration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Updates the registered HSP address.
     * @dev    Only callable by the contract owner. Setting to `address(0)` effectively
     *         disables the HSP payment path.
     * @param _newHsp The new HSP address.
     */
    function setHSPAddress(address _newHsp) external onlyOwner {
        emit HSPAddressUpdated(hspAddress, _newHsp);
        hspAddress = _newHsp;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public — View Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the current total value (in tokens) held for a given milestone.
     * @param _milestoneId Milestone to query.
     * @return assets Current redemption value of the milestone's vault shares.
     */
    function milestoneValue(uint256 _milestoneId) external view returns (uint256 assets) {
        if (_milestoneId >= milestoneCount) revert InvalidMilestoneId();
        Milestone storage m = milestones[_milestoneId];
        assets = vault.convertToAssets(m.shares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Validates release conditions and marks the milestone as released.
     * @param _milestoneId Milestone to validate.
     */
    function _validateAndMarkReleased(uint256 _milestoneId) internal {
        if (_milestoneId >= milestoneCount) revert InvalidMilestoneId();
        Milestone storage m = milestones[_milestoneId];
        if (msg.sender != m.client) revert NotClient();
        if (m.isReleased)           revert AlreadyReleased();
        m.isReleased = true;
    }

    /**
     * @dev Performs the token redemption from vault and distributes all amounts.
     * @param _milestoneId Milestone whose funds are being distributed.
     */
    function _distribute(uint256 _milestoneId) internal {
        Milestone storage m = milestones[_milestoneId];

        // Redeem all vault shares — receives total assets (principal + yield).
        uint256 totalAssets = vault.redeem(m.shares, address(this), address(this));

        uint256 principal   = m.amount;
        uint256 tax         = (principal * m.taxRateBP) / BP_DENOMINATOR;
        uint256 workerPayout = principal - tax;

        // Excess yield is any value above the original principal.
        uint256 totalYield   = totalAssets > principal ? totalAssets - principal : 0;
        uint256 workerYield  = totalYield / 2;
        uint256 platformYield = totalYield - workerYield; // Captures odd wei for platform.

        // ── Distributions ────────────────────────────────────────────────────
        // 1. Worker: principal minus tax.
        settlementToken.safeTransfer(m.worker, workerPayout);

        // 2. Tax vault: tax portion of principal.
        settlementToken.safeTransfer(taxVault, tax);

        // 3. Worker yield share (50 % of excess).
        if (workerYield > 0) {
            settlementToken.safeTransfer(m.worker, workerYield);
        }

        // 4. Platform yield share (50 % of excess, rounded up on odd wei).
        if (platformYield > 0) {
            settlementToken.safeTransfer(owner(), platformYield);
        }

        emit MilestoneReleased(
            _milestoneId,
            m.worker,
            workerPayout,
            tax,
            workerYield,
            platformYield,
            totalYield
        );
    }
}
