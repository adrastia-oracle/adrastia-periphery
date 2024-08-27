// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../rates/ManagedRateController.sol";

contract RateControllerStub is ManagedRateController {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool canComputeNextRateOverridden;
        bool canComputeNextRate;
        bool canUpdateOverridden;
        bool canUpdate;
    }

    struct OnPauseCall {
        bool paused;
        uint256 callCount;
    }

    Config public config;

    mapping(address => OnPauseCall) public onPauseCalls;

    constructor(
        bool computeAhead_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) ManagedRateController(computeAhead_, period_, initialBufferCardinality_, updatersMustBeEoa_) {}

    function stubPush(address token, uint64 target, uint64 current, uint32 timestamp) public {
        RateLibrary.Rate memory rate;

        rate.target = target;
        rate.current = current;
        rate.timestamp = timestamp;

        push(token, rate);
    }

    function stubInitializeBuffers(address token) public {
        initializeBuffers(token);
    }

    function stubInitialCardinality() public view returns (uint256) {
        return initialBufferCardinality;
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function overrideCanUpdate(bool overridden, bool canUpdate_) public {
        config.canUpdateOverridden = overridden;
        config.canUpdate = canUpdate_;
    }

    function overrideCanComputeNextRate(bool overridden, bool canComputeNextRate_) public {
        config.canComputeNextRateOverridden = overridden;
        config.canComputeNextRate = canComputeNextRate_;
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.canUpdateOverridden) return config.canUpdate;
        else return super.canUpdate(data);
    }

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }

    function canComputeNextRate(bytes memory data) public view virtual override returns (bool) {
        if (config.canComputeNextRateOverridden) return config.canComputeNextRate;
        else return super.canComputeNextRate(data);
    }

    function onPaused(address token, bool paused) internal virtual override {
        OnPauseCall storage call = onPauseCalls[token];

        call.paused = paused;
        ++call.callCount;
    }
}

contract RateControllerStubCaller {
    RateControllerStub immutable callee;

    constructor(RateControllerStub callee_) {
        callee = callee_;
    }

    function canUpdate(bytes memory data) public view returns (bool) {
        return callee.canUpdate(data);
    }

    function update(bytes memory data) public returns (bool) {
        return callee.update(data);
    }
}
