// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title MockVault
 * @author HashFlow Protocol
 * @notice A minimal ERC-4626 vault used exclusively in tests and local development.
 *         Simulates yield by allowing the deployer to inject extra tokens (simulated
 *         interest) into the vault, which inflates the share-to-asset exchange rate.
 *
 * @dev    Yield injection via {simulateYield} is intentionally privileged (owner-only)
 *         so that tests can control the exact amount of returns. This contract is
 *         **NOT** suitable for production.
 */
contract MockVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public immutable deploymentTimestamp;
    
    // 0.01% growth per hour (roughly) -> 2777777 wei per asset per second (if asset has 18 decimals)
    // For 6 decimals (USDC), we want it slower but still visible.
    // Let's use a scale of 1e12 for precision.
    uint256 public constant GROWTH_RATE_PER_SECOND_PER_ASSET = 2777; // Roughly 10% APY simulated

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when the owner injects simulated yield into the vault.
     * @param amount      Token amount added as yield.
     * @param totalAssets New total asset balance inside the vault after injection.
     */
    event YieldSimulated(uint256 amount, uint256 totalAssets);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the MockVault wrapping the given ERC-20 asset.
     * @param _asset  ERC-20 token this vault accepts.
     * @param _owner  Owner address allowed to inject simulated yield.
     */
    constructor(address _asset, address _owner)
        ERC4626(IERC20(_asset))
        ERC20("MockVault Shares", "mvSHARE")
        Ownable(_owner)
    {
        deploymentTimestamp = block.timestamp;
    }

    /**
     * @dev Overridden to simulate time-based yield growth.
     */
    function totalAssets() public view override returns (uint256) {
        uint256 baseAssets = IERC20(asset()).balanceOf(address(this));
        if (totalSupply() == 0) return baseAssets;

        uint256 timeElapsed = block.timestamp - deploymentTimestamp;
        // growth = (baseAssets * timeElapsed * rate) / 1e12;
        uint256 growth = (baseAssets * timeElapsed * GROWTH_RATE_PER_SECOND_PER_ASSET) / 1e12;
        
        return baseAssets + growth;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner — Test Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Injects `_amount` of the underlying asset into the vault to simulate yield.
     * @dev    The caller must have pre-approved this contract to spend `_amount` of the
     *         underlying token. After transfer, future {convertToAssets} calls will
     *         reflect the increased asset-per-share ratio.
     * @param _amount  Number of tokens (in token units) to add as simulated yield.
     */
    function simulateYield(uint256 _amount) external onlyOwner {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), _amount);
        emit YieldSimulated(_amount, totalAssets());
    }
}
