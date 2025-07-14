// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {ERC165} from "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";

import {IControllerPreUpdateHook} from "../../../../rates/controllers/hooks/IControllerPreUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

contract ControllerPreUpdateHookStub is IControllerPreUpdateHook, ERC165 {
    uint256 public preUpdateCallCount;

    address public lastPreUpdateToken;

    RateLibrary.Rate public lastPreUpdateRate;

    bool public revertPreUpdate;

    error PreUpdateHookFailed(address token);

    function onPreControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {
        preUpdateCallCount++;
        lastPreUpdateToken = token;
        lastPreUpdateRate = rate;

        if (revertPreUpdate) {
            revert PreUpdateHookFailed(token);
        }
    }

    function stubSetRevertPreUpdate(bool revertPreUpdate_) external {
        revertPreUpdate = revertPreUpdate_;
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IControllerPreUpdateHook).interfaceId || super.supportsInterface(interfaceId);
    }
}
