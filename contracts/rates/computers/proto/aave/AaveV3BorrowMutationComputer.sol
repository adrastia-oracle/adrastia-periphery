// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../Erc20MutationComputer.sol";
import "../../../../vendor/aave/IACLManager.sol";
import "../../../../vendor/aave/IAaveV3LendingPool.sol";

/**
 * @title AaveV3BorrowMutationComputer
 * @notice An Erc20MutationComputer implementation that computes mutated values using the total borrowed amount
 *   across both stable and variable rate markets of Aave v3.
 */
contract AaveV3BorrowMutationComputer is Erc20MutationComputer {
    /// @notice The Aave ACL Manager instance.
    IACLManager public immutable aclManager;

    address public immutable lendingPool;

    /// @notice An error that is thrown if the account is not authorized for the required role.
    /// @param account The account that is not authorized.
    /// @param requiredRole The required role (hash) that the account is missing.
    error NotAuthorized(address account, bytes32 requiredRole);

    /**
     * @notice Constructs a new AaveV3BorrowMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the aToken.
     * @param lendingPool_ The address of the Aave Lending Pool.
     */
    constructor(
        IACLManager aclManager_,
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_,
        address lendingPool_
    ) Erc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {
        aclManager = aclManager_;
        lendingPool = lendingPool_;
    }

    /**
     * @notice Extracts the total borrowed amount across both stable and variable rate markets for the token.
     * @param token The token to extract the total borrowed amount across both stable and variable rate markets from.
     * @return The extracted total borrowed amount across both stable and variable rate markets.
     */
    function extractValueFromToken(address token) internal view virtual override returns (uint256) {
        IAaveV3LendingPool.ReserveData memory reserve = IAaveV3LendingPool(lendingPool).getReserveData(token);

        uint256 stableDebt = IERC20(reserve.stableDebtTokenAddress).totalSupply();
        uint256 variableDebt = IERC20(reserve.variableDebtTokenAddress).totalSupply();

        return stableDebt + variableDebt;
    }

    /**
     * @notice Checks if the sender has the required role to set the config, namely, the POOL_ADMIN role.
     */
    function checkSetConfig() internal view virtual override {
        if (!aclManager.isPoolAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.POOL_ADMIN_ROLE());
        }
    }
}
