// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./CTokenMutationComputer.sol";

/**
 * @title CTokenBorrowMutationComputer
 * @notice A CTokenMutationComputer implementation that computes mutated values using total borrows from cTokens.
 */
contract CTokenBorrowMutationComputer is CTokenMutationComputer {
    /**
     * @notice Constructs a new CTokenBorrowMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the cToken.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) CTokenMutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    /**
     * @notice Extracts the total borrows value from the cToken.
     * @param cToken The cToken to extract the total borrows value from.
     * @return The extracted total borrows value.
     */
    function extractValueFromToken(address cToken) internal view virtual override returns (uint256) {
        return ICToken(cToken).totalBorrows();
    }
}
