// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../rates/controllers/ManagedCapController.sol";

contract CapControllerStub is ManagedCapController {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool canComputeNextRateOverridden;
        bool canComputeNextRate;
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

    function overrideCanComputeNextRate(bool overridden, bool canComputeNextRate_) public {
        config.canComputeNextRateOverridden = overridden;
        config.canComputeNextRate = canComputeNextRate_;
    }

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }

    function canComputeNextRate(bytes memory data) public view virtual override returns (bool) {
        if (config.canComputeNextRateOverridden) return config.canComputeNextRate;
        else return super.canComputeNextRate(data);
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
