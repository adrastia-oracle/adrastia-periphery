// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {ERC165} from "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";

import {IControllerPreUpdateHook} from "../../../../rates/controllers/hooks/IControllerPreUpdateHook.sol";
import {IControllerPostUpdateHook} from "../../../../rates/controllers/hooks/IControllerPostUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

contract HookStub is IControllerPreUpdateHook, IControllerPostUpdateHook, ERC165 {
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

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IControllerPreUpdateHook).interfaceId ||
            interfaceId == type(IControllerPostUpdateHook).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
