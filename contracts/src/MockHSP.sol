// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IHashFlowEscrow {
    function receiveHSPPayment(
        address _client,
        address _worker,
        uint256 _amount,
        uint16  _taxRateBP
    ) external returns (uint256 milestoneId);
}

/**
 * @title MockHSP
 * @author HashFlow Protocol
 * @notice Simulates the HashKey Settlement Protocol (HSP) trigger in a test environment.
 *         Acts as the authorised caller of {HashFlowEscrow.receiveHSPPayment}, forwarding
 *         client funds to the escrow contract.
 *
 * @dev    The HSP holds pre-approved token allowances from clients and calls
 *         {receiveHSPPayment} on the escrow. In production this contract would be
 *         replaced by the official HSP contract on HashKey Chain.
 */
contract MockHSP {
    using SafeERC20 for IERC20;

    /// @notice The settlement token used by the attached escrow.
    IERC20 public immutable token;

    /// @notice The escrow contract this HSP interacts with.
    IHashFlowEscrow public immutable escrow;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted each time the HSP triggers an escrow creation.
     * @param milestoneId The milestone ID created in {HashFlowEscrow}.
     * @param client      Address of the client on whose behalf funds were escrowed.
     * @param worker      Address of the worker.
     * @param amount      Token amount forwarded.
     */
    event HSPPaymentTriggered(
        uint256 indexed milestoneId,
        address indexed client,
        address indexed worker,
        uint256 amount
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _token  ERC-20 settlement token.
     * @param _escrow Address of the deployed {HashFlowEscrow}.
     */
    constructor(address _token, address _escrow) {
        token  = IERC20(_token);
        escrow = IHashFlowEscrow(_escrow);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // External
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Pulls `_amount` tokens from `_client` and forwards them to the escrow
     *         via {receiveHSPPayment}.
     * @dev    Requires `_client` to have approved this contract for at least `_amount`.
     *         This contract then approves the escrow to spend the tokens.
     *
     * @param _client     Client whose funds are being escrowed.
     * @param _worker     Worker who will receive the net payout.
     * @param _amount     Token amount to lock.
     * @param _taxRateBP  Tax rate in basis points.
     * @return milestoneId The milestone ID returned by the escrow.
     */
    function triggerPayment(
        address _client,
        address _worker,
        uint256 _amount,
        uint16  _taxRateBP
    ) external returns (uint256 milestoneId) {
        // Pull from client → HSP.
        token.safeTransferFrom(_client, address(this), _amount);

        // Approve escrow to pull from HSP.
        token.forceApprove(address(escrow), _amount);

        // Forward payment through HSP callback.
        milestoneId = escrow.receiveHSPPayment(_client, _worker, _amount, _taxRateBP);

        emit HSPPaymentTriggered(milestoneId, _client, _worker, _amount);
    }
}
