// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IZKVerifier} from "./interfaces/IZKVerifier.sol";

/**
 * @title MockZKVerifier
 * @notice Simple mock implementation of the ZK-Identity registry for testing.
 * @dev Allows manual toggling of verification status by the administrator.
 */
contract MockZKVerifier is IZKVerifier {
    mapping(address => bool) private verifiedUsers;

    /**
     * @notice Checks if a user is verified.
     */
    function isVerified(address user) external view override returns (bool) {
        return verifiedUsers[user];
    }

    /**
     * @notice Manually sets the verification status of a user.
     * @dev Used for testing different compliance scenarios.
     * @param user   Address to update.
     * @param status New verification status.
     */
    function setVerificationStatus(address user, bool status) external returns(bool) {
        verifiedUsers[user] = status;
        return true;
    }
}
