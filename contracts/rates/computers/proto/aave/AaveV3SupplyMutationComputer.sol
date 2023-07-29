// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../Erc20MutationComputer.sol";

interface ILendingPool {
    struct ReserveData {
        //stores the reserve configuration
        uint256 configuration;
        //the liquidity index. Expressed in ray
        uint128 liquidityIndex;
        //the current supply rate. Expressed in ray
        uint128 currentLiquidityRate;
        //variable borrow index. Expressed in ray
        uint128 variableBorrowIndex;
        //the current variable borrow rate. Expressed in ray
        uint128 currentVariableBorrowRate;
        //the current stable borrow rate. Expressed in ray
        uint128 currentStableBorrowRate;
        //timestamp of last update
        uint40 lastUpdateTimestamp;
        //the id of the reserve. Represents the position in the list of the active reserves
        uint16 id;
        //aToken address
        address aTokenAddress;
        //stableDebtToken address
        address stableDebtTokenAddress;
        //variableDebtToken address
        address variableDebtTokenAddress;
        //address of the interest rate strategy
        address interestRateStrategyAddress;
        //the current treasury balance, scaled
        uint128 accruedToTreasury;
        //the outstanding unbacked aTokens minted through the bridging feature
        uint128 unbacked;
        //the outstanding debt borrowed against this asset in isolation mode
        uint128 isolationModeTotalDebt;
    }

    function getReserveData(address asset) external view returns (ReserveData memory);
}

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
        ILendingPool.ReserveData memory reserve = ILendingPool(lendingPool).getReserveData(token);

        return IERC20(reserve.aTokenAddress).totalSupply();
    }
}
