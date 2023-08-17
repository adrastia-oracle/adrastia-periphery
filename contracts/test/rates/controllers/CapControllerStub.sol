// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../../rates/controllers/ManagedCapController.sol";

contract CapControllerStub is ManagedCapController {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
    }

    Config public config;

    constructor(
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) ManagedCapController(period_, initialBufferCardinality_, updatersMustBeEoa_) {}

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }

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
