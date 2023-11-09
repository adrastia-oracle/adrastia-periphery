// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../../rates/computers/proto/aave/AaveV3BorrowMutationComputer.sol";

contract AaveV3BorrowMutationComputerStub is AaveV3BorrowMutationComputer {
    constructor(
        IACLManager aclManager_,
        IAaveV3LendingPool lendingPool_,
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) AaveV3BorrowMutationComputer(aclManager_, lendingPool_, defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    function stubExtractValueFromToken(address token) public view returns (uint256) {
        return extractValueFromToken(token);
    }

    function stubGetValue(address token) public view returns (uint256) {
        return getValue(token);
    }
}
