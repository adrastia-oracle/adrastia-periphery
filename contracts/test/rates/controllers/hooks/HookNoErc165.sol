// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {RateController} from "../../../../rates/RateController.sol";
import {IControllerPreUpdateHook} from "../../../../rates/controllers/hooks/IControllerPreUpdateHook.sol";
import {IControllerPostUpdateHook} from "../../../../rates/controllers/hooks/IControllerPostUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

/// @notice A hook that doesn't implement ERC165.
contract HookNoErc165 is IControllerPreUpdateHook, IControllerPostUpdateHook {
    constructor() {}

    function onPreControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {}

    function onPostControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {}
}
