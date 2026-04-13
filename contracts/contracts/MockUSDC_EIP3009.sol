// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MockUSDC_EIP3009 is ERC20, EIP712 {
    uint8 private immutable _decimals;

    // keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = 0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267;

    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    constructor() 
        ERC20("Mock USDC", "USDC") 
        EIP712("Mock USDC", "1") 
    {
        _decimals = 6;
        _mint(msg.sender, 500000 * 10**6);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp >= validAfter, "authorization not yet valid");
        require(block.timestamp <= validBefore, "authorization expired");
        require(!_authorizationStates[from][nonce], "authorization already used");

        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        
        address signer = ECDSA.recover(hash, v, r, s);
        require(signer == from, "invalid signature");

        _authorizationStates[from][nonce] = true;
        _transfer(from, to, value);

        // Emit an event to note it was used (optional, keeping minimal as per MockERC20)
    }
}
