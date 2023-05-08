// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./ATokenMutationComputer.sol";

/**
 * @title ATokenSupplyMutationComputer
 * @notice An ATokenMutationComputer implementation that computes mutated values using the total supply of the
 *   underlying asset of aTokens.
 */
contract ATokenSupplyMutationComputer is ATokenMutationComputer {
    /**
     * @notice Constructs a new ATokenSupplyMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the aToken.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) ATokenMutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    /**
     * @notice Extracts the total supply value of the underlying asset from the aToken.
     * @param aToken The aToken to extract the total supply value of the underlying asset from.
     * @return The extracted total supply value of the underlying asset.
     */
    function extractValueFromToken(address aToken) internal view virtual override returns (uint256) {
        return IAToken(aToken).totalSupply();
    }
}
