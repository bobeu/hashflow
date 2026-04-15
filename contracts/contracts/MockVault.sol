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
    address public funder;
    address public escrow;
    
    // ~10% APY simulated (27 wei per asset per second for 6 decimals)
    uint256 public constant GROWTH_RATE_PER_SECOND_PER_ASSET = 277;
    uint256 public constant GROWTH_PRECISION = 1e10;

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
    constructor(address _asset, address _owner, address _funder)
        ERC4626(IERC20(_asset))
        ERC20("MockVault Shares", "mvSHARE")
        Ownable(_owner)
    {
        deploymentTimestamp = block.timestamp;
        funder = _funder;
    }

    function setEscrow(address _escrow) public onlyOwner {
        require(_escrow != address(0), "Invalid escrow address");
        escrow = _escrow;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Accounting Override (Pull-Based Yield)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the total assets managed by the vault.
     * @dev    Calculates virtual growth based on time elapsed and checks if owner
     *         has sufficient allowance to back the growth. If not, returns actual balance.
     */
    function totalAssets() public view override returns (uint256 balance) {
        balance = IERC20(asset()).balanceOf(address(this));
        if (totalSupply() == 0) return balance;
        
        uint256 timeElapsed = block.timestamp - deploymentTimestamp;
        
        // Calculate expected growth using Math.mulDiv for precision
        uint256 expectedGrowth = Math.mulDiv(
            balance * timeElapsed,
            GROWTH_RATE_PER_SECOND_PER_ASSET,
            GROWTH_PRECISION
        );

        // Check owner's allowance to back the growth
        uint256 allowance = IERC20(asset()).allowance(funder, address(this));

        // If owner has enough allowance, include expected growth in totalAssets
        if (allowance >= expectedGrowth) {
            return balance + expectedGrowth;
        }
    }

    /**
     * @notice Converts shares to assets using the pull-based totalAssets.
     */
    function _convertToAssets(uint256 shares, Math.Rounding round) internal view override returns (uint256) {
        // return shares.mulDiv(totalAssets(), totalSupply(), round);
        if (totalSupply() == 0) return shares;
        uint256 tAssets = totalAssets();
        return shares + (tAssets > 0? tAssets / 5 : 0); 
    }


    // ─────────────────────────────────────────────────────────────────────────
    // Yield Pull on Withdraw/Redeem
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Internal hook that pulls yield from owner before sending assets.
     * @dev    Called by ERC4626's withdraw/redeem logic before transferring assets.
     */
    function _withdraw(
        address caller,
        address receiver,
        address _owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        // Calculate how much yield is due based on shares
        uint256 withdrawable = assets;
        uint256 actualVaultBalance = IERC20(asset()).balanceOf(address(this));
        uint256 diff;
        if(actualVaultBalance < withdrawable) {
            diff = withdrawable - actualVaultBalance;
            uint256 allowance = IERC20(asset()).allowance(funder, address(this));
            if(allowance >= diff) {
                IERC20(asset()).safeTransferFrom(funder, address(this), diff);
            } else {
                withdrawable = actualVaultBalance;
                IERC20(asset()).safeTransferFrom(funder, address(this), allowance);
            }
        }
        require(withdrawable >= shares, "Inconsistent computation");

        super._withdraw(caller, receiver, _owner, withdrawable, shares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner — Admin Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the current yield rate and expected growth.
     */
    function getYieldInfo() external view returns (uint256 timeElapsed, uint256 expectedGrowth, uint256 allowance, uint256 tSupply) {
        timeElapsed = block.timestamp - deploymentTimestamp;
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        tSupply = totalSupply();
        expectedGrowth = tSupply > 0 
            ? Math.mulDiv(balance * timeElapsed, GROWTH_RATE_PER_SECOND_PER_ASSET, GROWTH_PRECISION)
            : 0;
        
        allowance = IERC20(asset()).allowance(funder, address(this));
        if(expectedGrowth > allowance) expectedGrowth = allowance;
    }

    function pullYieldFromOwner() external {
        address sender = _msgSender();
        // Only the Escrow or Owner can trigger the top-up
        require(sender == escrow || sender == funder, "Unauthorized");
        (,uint256 expectedGrowth,,) = this.getYieldInfo();
        IERC20(asset()).safeTransferFrom(funder, address(this), expectedGrowth);
        emit YieldPulled(funder, expectedGrowth);
    }

    function withdrawUnderlyingAsset() public onlyOwner {
        IERC20(asset()).transfer(owner(), IERC20(asset()).balanceOf(address(this)));
    }
}