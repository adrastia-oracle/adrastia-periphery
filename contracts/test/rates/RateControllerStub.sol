// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../rates/RateController.sol";

contract RateControllerStub is RateController {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
    }

    Config public config;

    constructor(uint32 period_, uint8 initialBufferCardinality_) RateController(period_, initialBufferCardinality_) {}

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

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }
}
