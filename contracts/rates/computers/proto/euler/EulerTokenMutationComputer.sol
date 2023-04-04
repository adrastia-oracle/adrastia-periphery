// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../../Erc20MutationComputer.sol";

/// @title An interface that works for Euler's eTokens and dTokens.
interface IEulerToken {
    function underlyingAsset() external view returns (address);
}

/**
 * @title EulerTokenMutationComputer
 * @notice Abstract contract for computing mutated values from Euler's eTokens and dTokens.
 * @dev Extend this contract and implement the extractValueFromToken function to use it.
 */
abstract contract EulerTokenMutationComputer is Erc20MutationComputer {
    /**
     * @notice Constructs a new EulerTokenMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens.
     * @param decimalsOffset_ The offset to apply when scaling the value from the token.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) Erc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    /**
     * @notice Returns the number of decimals for the underlying token or the default value if decimals cannot be
     *   retrieved.
     * @param eulerToken The Euler token address whose underlying token decimals should be fetched.
     * @return The number of decimals for the underlying token or the default value if decimals cannot be retrieved.
     */
    function getTokenDecimalsOrDefault(address eulerToken) internal view virtual override returns (uint8) {
        uint8 decimals = defaultDecimals;

        (bool success, bytes memory result) = eulerToken.staticcall(
            abi.encodeWithSelector(IEulerToken.underlyingAsset.selector)
        );

        if (success && result.length == 32) {
            address underlyingToken = abi.decode(result, (address));

            (success, result) = underlyingToken.staticcall(abi.encodeWithSelector(IERC20Metadata.decimals.selector));

            if (success && result.length == 32) {
                decimals = abi.decode(result, (uint8));
            }
        }

        return decimals;
    }
}
