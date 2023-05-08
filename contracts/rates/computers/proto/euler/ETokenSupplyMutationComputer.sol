// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./EulerTokenMutationComputer.sol";

/// @title Euler's eToken interface
interface IEToken {
    function totalSupplyUnderlying() external view returns (uint256);
}

/**
 * @title ETokenSupplyMutationComputer
 * @notice An EulerTokenMutationComputer implementation that computes mutated values using the total supply of the
 *   underlying asset of eTokens.
 */
contract ETokenSupplyMutationComputer is EulerTokenMutationComputer {
    /**
     * @notice Constructs a new ETokenSupplyMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the eToken.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) EulerTokenMutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    /**
     * @notice Extracts the total supply value of the underlying asset from the eToken.
     * @param eToken The eToken to extract the total supply value of the underlying asset from.
     * @return The extracted total supply value of the underlying asset.
     */
    function extractValueFromToken(address eToken) internal view virtual override returns (uint256) {
        return IEToken(eToken).totalSupplyUnderlying();
    }
}
