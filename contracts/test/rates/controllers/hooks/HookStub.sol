// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {IControllerUpdateHook} from "../../../../rates/controllers/hooks/IControllerUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

contract HookStub is IControllerUpdateHook {
    uint256 public preUpdateCallCount;
    uint256 public postUpdateCallCount;

    address public lastPreUpdateToken;
    address public lastPostUpdateToken;

    RateLibrary.Rate public lastPreUpdateRate;
    RateLibrary.Rate public lastPostUpdateRate;

    bool public revertPreUpdate;
    bool public revertPostUpdate;

    error PreUpdateHookFailed(address token);

    error PostUpdateHookFailed(address token);

    function onPreControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {
        preUpdateCallCount++;
        lastPreUpdateToken = token;
        lastPreUpdateRate = rate;

        if (revertPreUpdate) {
            revert PreUpdateHookFailed(token);
        }
    }

    function onPostControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {
        postUpdateCallCount++;
        lastPostUpdateToken = token;
        lastPostUpdateRate = rate;

        if (revertPostUpdate) {
            revert PostUpdateHookFailed(token);
        }
    }

    function stubSetRevertPreUpdate(bool revertPreUpdate_) external {
        revertPreUpdate = revertPreUpdate_;
    }

    function stubSetRevertPostUpdate(bool revertPostUpdate_) external {
        revertPostUpdate = revertPostUpdate_;
    }
}
