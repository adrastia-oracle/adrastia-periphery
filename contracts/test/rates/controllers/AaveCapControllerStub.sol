// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../../rates/controllers/proto/aave/AaveCapController.sol";

contract AaveCapControllerStub is AaveCapController {
    constructor(
        IAaveV3ConfigEngine configEngine_,
        bool forSupplyCaps_,
        IACLManager aclManager_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    )
        AaveCapController(
            configEngine_,
            forSupplyCaps_,
            aclManager_,
            period_,
            initialBufferCardinality_,
            updatersMustBeEoa_
        )
    {}

    function stubPush(address token, uint64 target, uint64 current, uint32 timestamp) public {
        RateLibrary.Rate memory rate;

        rate.target = target;
        rate.current = current;
        rate.timestamp = timestamp;

        push(token, rate);
    }

    function stubWillAnythingChange(bytes memory data) public view returns (bool) {
        return willAnythingChange(data);
    }

    function stubChangeThresholdSurpassed(uint256 a, uint256 b, uint256 changeThreshold) public view returns (bool) {
        return changeThresholdSurpassed(a, b, changeThreshold);
    }
}
