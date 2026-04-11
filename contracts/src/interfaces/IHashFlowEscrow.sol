// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IZKVerifier
 * @notice Interface for a Zero-Knowledge Identity Registry.
 * @dev Used by HashFlowEscrow to ensure counter-parties are verified
 *      before funds are locked in escrow.
 */
interface IZKVerifier {
    /**
     * @notice Checks if a user has a valid ZK-Identity verification.
     * @param user The address to check.
     * @return bool True if the user is verified.
     */
    function isVerified(address user) external view returns (bool);
}
