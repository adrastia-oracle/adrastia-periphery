// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./MutatedValueComputer.sol";

/**
 * @title Erc20MutationComputer
 * @notice Abstract contract for computing mutated values from tokens, with decimal trimming and scaling.
 * @dev Extend this contract and implement the extractValueFromToken function to use it.
 */
abstract contract Erc20MutationComputer is MutatedValueComputer {
    /// @notice Default number of decimals for the tokens.
    uint8 public immutable defaultDecimals;

    /// @notice The offset to apply when scaling the value from the token.
    int8 public immutable decimalsOffset;

    /// @notice An error thrown when the token address is invalid.
    /// @param token The invalid token address.
    error InvalidInput(address token);

    /**
     * @notice Constructs a new CTokenMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the tokens.
     * @param decimalsOffset_ The decimal offset to apply when scaling the value from the token. Positive values scale
     *   up, negative values scale down. Measured in numbers of decimals places (powers of 10).
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) MutatedValueComputer(defaultOneXScalar_) {
        defaultDecimals = defaultDecimals_;
        decimalsOffset = decimalsOffset_;
    }

    /**
     * @notice Returns the mutated value for the given token address.
     * @dev This function calls the abstract function extractValueFromToken to obtain the uint256 value from the token.
     * @param token The address of the token to compute the mutated value for.
     * @return The mutated value.
     */
    function getValue(address token) internal view virtual override returns (uint256) {
        if (token == address(0)) revert InvalidInput(token);

        uint256 value = extractValueFromToken(token);

        // Scale value by decimalsOffset
        if (decimalsOffset >= 0) {
            // Overflow is possible, let's take some extra steps to prevent this
            uint256 scaledValue;
            unchecked {
                scaledValue = value * (10 ** uint256(int256(decimalsOffset)));
            }
            if (scaledValue < value) {
                // Overflow occured. Let's first scale down the value by token decimals
                value = scaleValueByTokenDecimals(token, value);
                // Then scale up by decimalsOffset
                unchecked {
                    scaledValue = value * (10 ** uint256(int256(decimalsOffset)));
                }
                if (scaledValue < value) {
                    // Overflow occurred again. Return max value
                    return type(uint256).max;
                } else {
                    // No overflow occured, so let's return the scaled value
                    return scaledValue;
                }
            } else {
                // No overflow occured, let's continue
                value = scaledValue;
            }
        } else {
            value = value / (10 ** uint256(int256(-decimalsOffset)));
        }

        // Scale value by token decimals
        value = scaleValueByTokenDecimals(token, value);

        return value;
    }

    /**
     * @notice Returns the number of decimals for the token or the default value if decimals cannot be retrieved.
     * @param token The token address whose decimals should be fetched.
     * @return The number of decimals for the token or the default value if decimals cannot be retrieved.
     */
    function getTokenDecimalsOrDefault(address token) internal view virtual returns (uint8) {
        uint8 decimals = defaultDecimals;

        (bool success, bytes memory result) = token.staticcall(
            abi.encodeWithSelector(IERC20Metadata.decimals.selector)
        );
        if (success && result.length == 32) {
            decimals = abi.decode(result, (uint8));
        }

        return decimals;
    }

    /**
     * @notice Scales the value by the token decimals.
     * @param token The token address.
     * @param value The value to be scaled.
     * @return The scaled value.
     */
    function scaleValueByTokenDecimals(address token, uint256 value) internal view virtual returns (uint256) {
        uint8 decimals = getTokenDecimalsOrDefault(token);

        uint256 wholeUnitsValue = value / (10 ** decimals);

        return wholeUnitsValue;
    }

    /**
     * @notice Abstract function to extract a uint256 value from the token.
     * @dev Extend this contract and implement this function to extract the desired value (e.g., totalSupply,
     *   totalBorrows, etc.) from the token. This function will be called by the getValue function.
     * @param token The token to extract the value from.
     * @return The extracted value.
     */
    function extractValueFromToken(address token) internal view virtual returns (uint256);
}
