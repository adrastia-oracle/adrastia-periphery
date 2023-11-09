// SPDX-License-Identifier: BUSL-1.1
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

        uint256 cash = token.getCash();
        uint256 totalBorrows = token.totalBorrows();
        uint256 totalReserves = token.totalReserves();

        uint256 sum;

        if ((cash > 0) && (totalBorrows > type(uint256).max - cash)) {
            // Overflow will occur if we add cash and total borrows. Let's try subtracting reserves first.
            if (totalReserves <= totalBorrows) {
                // we can safely subtract total reserves from total borrows
                totalBorrows -= totalReserves;
                totalReserves = 0;
            } else if (totalReserves <= cash) {
                // we can safely subtract total reserves from cash
                cash -= totalReserves;
                totalReserves = 0;
            } else {
                // totalReserves > cash
                totalReserves -= cash;
                cash = 0; // this allows us to safely add cash and total borrows
            }

            // Let's check if we can safely add cash and total borrows
            if ((cash > 0) && (totalBorrows > type(uint256).max - cash)) {
                // Still overflows. Just set sum to the max value.
                sum = type(uint256).max;
            } else {
                // No overflow. We can safely add cash and total borrows.
                sum = cash + totalBorrows;
            }
        } else {
            // No overflow will occur if we add cash and total borrows. Let's do it.
            sum = cash + totalBorrows;
        }

        if (sum < totalReserves) {
            // cash + total borrows is less than total reserves. This is an underflow.
            // Return the lowest possible value.
            return 0;
        }

        return sum - totalReserves;
    }
}
