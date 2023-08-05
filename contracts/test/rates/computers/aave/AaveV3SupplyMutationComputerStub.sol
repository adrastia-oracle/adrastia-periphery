// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../../../rates/computers/proto/aave/AaveV3SupplyMutationComputer.sol";

contract AaveV3SupplyMutationComputerStub is AaveV3SupplyMutationComputer {
    constructor(
        IACLManager aclManager_,
        IAaveV3LendingPool lendingPool_,
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) AaveV3SupplyMutationComputer(aclManager_, lendingPool_, defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    function stubExtractValueFromToken(address token) public view returns (uint256) {
        return extractValueFromToken(token);
    }

    function stubGetValue(address token) public view returns (uint256) {
        return getValue(token);
    }
}
