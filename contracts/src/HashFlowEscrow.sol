// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IZKVerifier} from "./interfaces/IZKVerifier.sol";

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
        address taxRecipient;
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
    address public taxVault;

    /// @notice Recipient of the 80% government portion of the tax.
    address public regionalTaxVault;

    /// @notice Recipient of the 20% platform service portion of the tax.
    address public autoServiceFeeVault;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Auto-incrementing milestone counter.
    uint256 public milestoneCount;

    /// @notice Stores all milestones by their ID.
    mapping(uint256 => Milestone) public milestones;

    /// @notice Address authorised to call {receiveHSPPayment} (HashKey Settlement Protocol).
    address public hspAddress;

    /// @notice Address of the ZK-Identity registry for worker verification.
    address public zkVerifier;

    /// @notice Percentage of yield (interest) taken as platform fee (Basis Points).
    uint16 public yieldFeeBP = 5000; // Default 50%

    /// @notice On-chain indexing: Maps merchant addresses to their escrow IDs.
    mapping(address => uint256[]) public clientMilestones;

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
     * @param taxAmount        Total tax amount collected.
     * @param workerYield      Yield portion transferred to the worker.
     * @param platformYield    Yield portion transferred to the platform owner.
     * @param totalYield       Total yield earned.
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
     * @notice Emitted when tax is remitted to the government vault.
     */
    event TaxRemitted(uint256 indexed milestoneId, uint256 amount, address indexed taxRecipient);

    /**
     * @notice Emitted when platform yield fee is collected.
     */
    event YieldFeeCollected(uint256 indexed milestoneId, uint256 amount);

    /**
     * @notice Emitted when a vault address is updated.
     */
    event TaxVaultsUpdated(address regionalTaxVault, address autoServiceFeeVault);

    /**
     * @notice Emitted when the ZK Verifier address is updated.
     * @param oldVerifier Previous verifier.
     * @param newVerifier New verifier.
     */
    event ZKVerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

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

    /// @notice Reverts when the worker is not verified via ZK-Identity.
    error NotVerified();

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
        address _taxRecipient,
        uint256 _amount,
        uint16  _taxRateBP
    ) external nonReentrant returns (uint256 milestoneId) {
        if (_worker   == address(0)) revert ZeroAddress();
        if (_taxRecipient == address(0)) revert ZeroAddress();
        if (_amount   == 0)          revert ZeroAmount();
        if (_taxRateBP >= BP_DENOMINATOR) revert TaxRateTooHigh();

        _checkVerification(_worker);

        milestoneId = milestoneCount++;

        // Pull tokens from client.
        settlementToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Approve vault and deposit to earn yield.
        settlementToken.forceApprove(address(vault), _amount);
        uint256 shares = vault.deposit(_amount, address(this));

        milestones[milestoneId] = Milestone({
            amount:       _amount,
            client:       msg.sender,
            worker:       _worker,
            taxRateBP:    _taxRateBP,
            isReleased:   false,
            startTime:    block.timestamp,
            shares:       shares,
            taxRecipient: _taxRecipient
        });

        clientMilestones[msg.sender].push(milestoneId);

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
     * @notice Institutional Entry Point: Integration with HashKey Settlement Protocol (HSP).
     * @dev    This function allows the HashKey Settlement Protocol to autonomously trigger
     *         escrow creation for high-volume or regulated payment batches.
     *
     *         By routing HSP payments through HashFlow, merchants and banks transform
     *         static settlement capital into dynamic, yield-bearing assets while
     *         ensuring automated tax compliance (the 80/20 shredding logic).
     *
     *         The HSP caller is trusted to have captured the client's intent and
     *         settlement tokens before invocation.
     *
     * @param _client     Address of the client (merchant/institution) on whose behalf the escrow is created.
     * @param _worker     Address of the worker (contractor/entity) to be paid.
     * @param _amount     Principal amount to lock and stake in ERC-4626.
     * @param _taxRateBP  Specific tax rate for this jurisdictional settlement.
     * @return milestoneId Unique tracking ID for the institutional settlement.
     */
    function receiveHSPPayment(
        address _client,
        address _worker,
        address _taxRecipient,
        uint256 _amount,
        uint16  _taxRateBP
    ) external onlyHSP nonReentrant returns (uint256 milestoneId) {
        if (_client   == address(0)) revert ZeroAddress();
        if (_worker   == address(0)) revert ZeroAddress();
        if (_taxRecipient == address(0)) revert ZeroAddress();
        if (_amount   == 0)          revert ZeroAmount();
        if (_taxRateBP >= BP_DENOMINATOR) revert TaxRateTooHigh();

        _checkVerification(_worker);

        milestoneId = milestoneCount++;

        // Pull tokens from the HSP contract (which acts as the client proxy).
        settlementToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Approve vault and deposit.
        settlementToken.forceApprove(address(vault), _amount);
        uint256 shares = vault.deposit(_amount, address(this));

        milestones[milestoneId] = Milestone({
            amount:       _amount,
            client:       _client,
            worker:       _worker,
            taxRateBP:    _taxRateBP,
            isReleased:   false,
            startTime:    block.timestamp,
            shares:       shares,
            taxRecipient: _taxRecipient
        });

        clientMilestones[_client].push(milestoneId);

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

    /**
     * @notice Updates the ZK-Identity verifier address.
     * @param _newVerifier The new verifier address.
     */
    function setZKVerifier(address _newVerifier) external onlyOwner {
        emit ZKVerifierUpdated(zkVerifier, _newVerifier);
        zkVerifier = _newVerifier;
    }

    /**
     * @notice Updates the tax distribution vaults.
     * @param _regionalTaxVault    New government tax vault.
     * @param _autoServiceFeeVault New platform service fee vault.
     */
    function setTaxVaults(address _regionalTaxVault, address _autoServiceFeeVault) external onlyOwner {
        if (_regionalTaxVault == address(0) || _autoServiceFeeVault == address(0)) revert ZeroAddress();
        regionalTaxVault    = _regionalTaxVault;
        autoServiceFeeVault = _autoServiceFeeVault;
        emit TaxVaultsUpdated(_regionalTaxVault, _autoServiceFeeVault);
    }

    /**
     * @notice Updates the platform fee for accrued yield.
     * @param _newFee New fee in basis points (max 10 000).
     */
    function setYieldFee(uint16 _newFee) external onlyOwner {
        if (_newFee > BP_DENOMINATOR) revert TaxRateTooHigh();
        yieldFeeBP = _newFee;
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

    /**
     * @notice Returns the current unrealized yield for an active escrow.
     * @param _milestoneId Milestone to query.
     * @return yield Current assets minus principal.
     */
    function getPendingYield(uint256 _milestoneId) external view returns (uint256 yield) {
        if (_milestoneId >= milestoneCount) revert InvalidMilestoneId();
        Milestone storage m = milestones[_milestoneId];
        uint256 currentAssets = vault.convertToAssets(m.shares);
        yield = currentAssets > m.amount ? currentAssets - m.amount : 0;
    }

    /**
     * @notice Helper for Frontend: Aggregates total potential tax liability for a client.
     * @dev    Iterates over all unreleased milestones. Primarily for off-chain view.
     * @param _client The client address to query.
     * @return totalLiability Total assets currently set aside as tax.
     */
    function getTotalTaxLiability(address _client) external view returns (uint256 totalLiability) {
        for (uint256 i = 0; i < milestoneCount; i++) {
            Milestone storage m = milestones[i];
            if (m.client == _client && !m.isReleased) {
                totalLiability += (m.amount * m.taxRateBP) / BP_DENOMINATOR;
            }
        }
    }

    /**
     * @notice Returns all milestone IDs belonging to a specific client.
     */
    function getMyMilestones(address _client) external view returns (uint256[] memory) {
        return clientMilestones[_client];
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

        // Excess yield calculations.
        uint256 totalYield   = totalAssets > principal ? totalAssets - principal : 0;
        uint256 platformYield = 0;
        uint256 workerYield  = 0;

        if (totalYield > 0) {
            platformYield = (totalYield * yieldFeeBP) / BP_DENOMINATOR;
            workerYield   = totalYield - platformYield;
        }

        // ── Distributions ────────────────────────────────────────────────────
        
        // 1. Government: Sacrosanct 100% Tax remittance to the milestone-specific recipient.
        settlementToken.safeTransfer(m.taxRecipient, tax);
        emit TaxRemitted(_milestoneId, tax, m.taxRecipient);

        // 2. Worker: net principal + share of yield.
        settlementToken.safeTransfer(m.worker, workerPayout + workerYield);

        // 3. Platform: Service fee from yield only.
        if (platformYield > 0) {
            settlementToken.safeTransfer(autoServiceFeeVault, platformYield);
            emit YieldFeeCollected(_milestoneId, platformYield);
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

    /**
     * @dev Internal helper to verify worker ZK-Identity status.
     *      If no zkVerifier is set (address 0), check is skipped.
     * @param _worker Address to verify.
     */
    function _checkVerification(address _worker) internal view {
        if (zkVerifier != address(0)) {
            if (!IZKVerifier(zkVerifier).isVerified(_worker)) {
                revert NotVerified();
            }
        }
    }
}
