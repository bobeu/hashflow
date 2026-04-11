// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @author HashFlow Protocol
 * @notice A minimal ERC-20 token used exclusively in tests.
 *         Includes a public {mint} function so test harnesses can supply tokens
 *         to any address without complex setup.
 * @dev    **NOT** suitable for production deployment.
 */
contract MockERC20 is ERC20 {
    /// @notice Number of decimals. Defaults to 6 to mimic USDC/USDT.
    uint8 private immutable _decimals;

    /**
     * @param name_     Token name.
     * @param symbol_   Token symbol.
     * @param decimals_ Number of decimal places.
     */
    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mints `amount` tokens to `to`.
     * @dev    Unrestricted; callable by anyone in tests.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
