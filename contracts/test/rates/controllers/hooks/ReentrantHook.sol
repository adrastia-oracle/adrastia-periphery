// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {RateController} from "../../../../rates/RateController.sol";
import {IControllerUpdateHook} from "../../../../rates/controllers/hooks/IControllerUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

contract ReentrantHook is IControllerUpdateHook {
    /// @notice True to call update; false to call manuallyPushRate.
    bool public callUpdate;

    constructor(bool callUpdate_) {
        callUpdate = callUpdate_;
    }

    function onPreControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {
        if (callUpdate) {
            // This will cause a reentrant call to the hook
            RateController(msg.sender).update(abi.encode(token));
        } else {
            // This will cause a reentrant call to the hook
            RateController(msg.sender).manuallyPushRate(token, rate.target, rate.current, 1);
        }
    }

    function onPostControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {
        if (callUpdate) {
            // This will cause a reentrant call to the hook
            RateController(msg.sender).update(abi.encode(token));
        } else {
            // This will cause a reentrant call to the hook
            RateController(msg.sender).manuallyPushRate(token, rate.target, rate.current, 1);
        }
    }
}
