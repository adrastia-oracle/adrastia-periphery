// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../Erc20MutationComputer.sol";
import "../../../../vendor/aave/IAaveV3LendingPool.sol";

/**
 * @title AaveV3SupplyMutationComputer
 * @notice An Erc20MutationComputer implementation that computes mutated values using the total supply of tokens in the
 *   Aave V3 Lending Pool.
 */
contract AaveV3SupplyMutationComputer is Erc20MutationComputer {
    address public immutable lendingPool;

    /**
     * @notice Constructs a new AaveV3SupplyMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the aToken.
     * @param lendingPool_ The address of the Aave Lending Pool.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_,
        address lendingPool_
    ) Erc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {
        lendingPool = lendingPool_;
    }

    /**
     * @notice Extracts the total supply of the token in the Aave V3 Lending Pool.
     * @param token The token to extract the total supply for (the underlying token).
     * @return The extracted total supply, with all decimal points of the token included.
     */
    function extractValueFromToken(address token) internal view virtual override returns (uint256) {
        IAaveV3LendingPool.ReserveData memory reserve = IAaveV3LendingPool(lendingPool).getReserveData(token);

        return IERC20(reserve.aTokenAddress).totalSupply();
    }
}
