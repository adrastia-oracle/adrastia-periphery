// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {ERC165} from "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";

import {RateController} from "../../../../rates/RateController.sol";
import {IControllerPreUpdateHook} from "../../../../rates/controllers/hooks/IControllerPreUpdateHook.sol";
import {IControllerPostUpdateHook} from "../../../../rates/controllers/hooks/IControllerPostUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

contract ReentrantHook is IControllerPreUpdateHook, IControllerPostUpdateHook, ERC165 {
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

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IControllerPreUpdateHook).interfaceId ||
            interfaceId == type(IControllerPostUpdateHook).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
