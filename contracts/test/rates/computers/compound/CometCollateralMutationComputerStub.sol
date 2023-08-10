// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../../../rates/computers/proto/compound/CometCollateralMutationComputer.sol";

contract CometCollateralMutationComputerStub is CometCollateralMutationComputer {
    constructor(
        address comet_,
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) CometCollateralMutationComputer(comet_, defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {}

    function stubExtractValueFromToken(address token) public view returns (uint256) {
        return extractValueFromToken(token);
    }

    function stubGetValue(address token) public view returns (uint256) {
        return getValue(token);
    }
}
