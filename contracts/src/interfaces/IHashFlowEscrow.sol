// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IHashFlowEscrow
 * @notice Interface for HashFlowEscrow contract.
 */
interface IHashFlowEscrow {
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
    ) external returns (uint256 milestoneId);

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
    function releaseMilestone(uint256 _milestoneId) external;

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
    ) external returns (uint256 milestoneId);

    /**
     * @notice Returns the current total value (in tokens) held for a given milestone.
     * @param _milestoneId Milestone to query.
     * @return assets Current redemption value of the milestone's vault shares.
     */
    function milestoneValue(uint256 _milestoneId) external view returns (uint256 assets);

    /**
     * @notice Returns the current unrealized yield for an active escrow.
     * @param _milestoneId Milestone to query.
     * @return yield Current assets minus principal.
     */
    function getPendingYield(uint256 _milestoneId) external view returns (uint256 yield);

    /**
     * @notice Helper for Frontend: Aggregates total potential tax liability for a client.
     * @dev    Iterates over all unreleased milestones. Primarily for off-chain view.
     * @param _client The client address to query.
     * @return totalLiability Total assets currently set aside as tax.
     */
    function getTotalTaxLiability(address _client) external view returns (uint256 totalLiability);
    
    /**
     * @notice Returns all milestone IDs belonging to a specific client.
     */
    function getMyMilestones(address _client) external view returns (uint256[] memory);
}
