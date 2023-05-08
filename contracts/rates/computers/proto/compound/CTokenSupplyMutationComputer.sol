// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./CTokenMutationComputer.sol";

/**
 * @title CTokenSupplyMutationComputer
 * @notice A CTokenMutationComputer implementation that computes mutated values using the total supply of the underlying
 *   asset of cTokens.
 */
contract CTokenSupplyMutationComputer is CTokenMutationComputer {
    /**
     * @notice Constructs a new CTokenSupplyMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the cToken.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) CTokenMutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    /**
     * @notice Extracts the total supply value of the underlying asset from the cToken.
     * @param cToken The cToken to extract the total supply value of the underlying asset from.
     * @return The extracted total supply value of the underlying asset.
     */
    function extractValueFromToken(address cToken) internal view virtual override returns (uint256) {
        ICToken token = ICToken(cToken);

        return token.getCash() + token.totalBorrows() - token.totalReserves();
    }
}
