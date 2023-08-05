// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../vendor/aave/IAaveV3LendingPool.sol";

contract AaveV3LendingPoolStub is IAaveV3LendingPool {
    mapping(address => ReserveData) internal reserves;

    function setCollateralToken(address asset, address token) public {
        reserves[asset].aTokenAddress = token;
    }

    function setStableDebtToken(address asset, address token) public {
        reserves[asset].stableDebtTokenAddress = token;
    }

    function setVariableDebtToken(address asset, address token) public {
        reserves[asset].variableDebtTokenAddress = token;
    }

    function getReserveData(address asset) external view override returns (ReserveData memory) {
        return reserves[asset];
    }
}
