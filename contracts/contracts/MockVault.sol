// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { MockERC20 } from "./MockERC20.sol";

/**
 * @title MockVault
 * @author HashFlow Protocol
 * @notice A pull-based ERC-4626 vault where yield is backed by the owner's allowance.
 *         The vault calculates virtual growth but only actualizes it when funds are withdrawn.
 *
 * @dev    This is a "Managed Yield Engine" - yield is on-demand and pulled from the owner's
 *         allowance when beneficiaries redeem their shares.
 */
contract MockVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public immutable deploymentTimestamp;
    
    // ~10% APY simulated (2777 wei per asset per second for 6 decimals)
    uint256 public constant GROWTH_RATE_PER_SECOND_PER_ASSET = 2777;
    uint256 public constant GROWTH_PRECISION = 1e12;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when yield is pulled from owner and distributed.
     * @param owner      Address of the yield provider.
     * @param amount    Amount of yield pulled.
     */
    event YieldPulled(address indexed owner, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the MockVault wrapping the given ERC-20 asset.
     * @param _asset  ERC-20 token this vault accepts.
     * @param _owner  Owner address who provides yield via allowance.
     */
    constructor(address _asset, address _owner)
        ERC4626(IERC20(_asset))
        ERC20("MockVault Shares", "mvSHARE")
        Ownable(_owner)
    {
        deploymentTimestamp = block.timestamp;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Accounting Override (Pull-Based Yield)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the total assets managed by the vault.
     * @dev    Calculates virtual growth based on time elapsed and checks if owner
     *         has sufficient allowance to back the growth. If not, returns actual balance.
     */
    function totalAssets() public view override returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        
        if (totalSupply() == 0) return balance;

        uint256 timeElapsed = block.timestamp - deploymentTimestamp;
        
        // Calculate expected growth using Math.mulDiv for precision
        uint256 expectedGrowth = Math.mulDiv(
            balance * timeElapsed,
            GROWTH_RATE_PER_SECOND_PER_ASSET,
            GROWTH_PRECISION
        );

        // Check owner's allowance to back the growth
        uint256 allowance = IERC20(asset()).allowance(owner(), address(this));

        // If owner has enough allowance, include expected growth in totalAssets
        if (allowance >= expectedGrowth) {
            return balance + expectedGrowth;
        }

        // Otherwise, return only actual balance (no yield)
        return balance;
    }

    /**
     * @notice Converts shares to assets using the pull-based totalAssets.
     */
    function convertToAssets(uint256 shares) public view override returns (uint256) {
        if (totalSupply() == 0) return shares;
        return Math.mulDiv(shares, totalAssets(), totalSupply());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Yield Pull on Withdraw/Redeem
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Internal hook that pulls yield from owner before sending assets.
     * @dev    Called by ERC4626's withdraw/redeem logic before transferring assets.
     */
    function _withdraw(
        address assets,
        address receiver,
        address _owner,
        uint256 shares,
        uint256 assetsNeeded
    ) internal override {
        // Calculate how much yield is due based on shares
        uint256 currentTotalAssets = totalAssets();
        uint256 userAssetsBefore = Math.mulDiv(shares, currentTotalAssets, totalSupply());
        
        // If user is withdrawing less than their share of total assets, they get yield
        if (assetsNeeded < userAssetsBefore && assetsNeeded > 0) {
            uint256 yieldDue = userAssetsBefore - assetsNeeded;
            
            // Pull yield from owner if available
            uint256 allowance = IERC20(asset()).allowance(owner(), address(this));
            if (allowance >= yieldDue) {
                IERC20(asset()).safeTransferFrom(owner(), address(this), yieldDue);
                emit YieldPulled(owner(), yieldDue);
            }
        }

        super._withdraw(assets, receiver, _owner, shares, assetsNeeded);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner — Admin Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the current yield rate and expected growth.
     */
    function getYieldInfo() external view returns (uint256 timeElapsed, uint256 expectedGrowth, uint256 allowance) {
        timeElapsed = block.timestamp - deploymentTimestamp;
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        
        expectedGrowth = totalSupply() > 0 
            ? Math.mulDiv(balance * timeElapsed, GROWTH_RATE_PER_SECOND_PER_ASSET, GROWTH_PRECISION)
            : 0;
        
        allowance = IERC20(asset()).allowance(owner(), address(this));
    }
}