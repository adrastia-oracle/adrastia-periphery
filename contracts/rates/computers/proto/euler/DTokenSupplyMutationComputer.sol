// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./EulerTokenMutationComputer.sol";

/// @title Euler's dToken interface
interface IDToken {
    function totalSupply() external view returns (uint256);
}

/**
 * @title DTokenSupplyMutationComputer
 * @notice An EulerTokenMutationComputer implementation that computes mutated values using the total supply of the
 *   underlying asset of dTokens.
 */
contract DTokenSupplyMutationComputer is EulerTokenMutationComputer {
    /**
     * @notice Constructs a new DTokenSupplyMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the dToken.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) EulerTokenMutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    /**
     * @notice Extracts the total supply value of the underlying asset from the dToken.
     * @param dToken The dToken to extract the total supply value of the underlying asset from.
     * @return The extracted total supply value of the underlying asset.
     */
    function extractValueFromToken(address dToken) internal view virtual override returns (uint256) {
        return IDToken(dToken).totalSupply();
    }
}
