// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {ERC165} from "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";

import {IControllerPostUpdateHook} from "../../../../rates/controllers/hooks/IControllerPostUpdateHook.sol";
import {RateLibrary} from "../../../../rates/RateLibrary.sol";

contract ControllerPostUpdateHookStub is IControllerPostUpdateHook, ERC165 {
    uint256 public postUpdateCallCount;

    address public lastPostUpdateToken;

    RateLibrary.Rate public lastPostUpdateRate;

    bool public revertPostUpdate;

    error PostUpdateHookFailed(address token);

    function onPostControllerUpdate(address token, RateLibrary.Rate calldata rate) external override {
        postUpdateCallCount++;
        lastPostUpdateToken = token;
        lastPostUpdateRate = rate;

        if (revertPostUpdate) {
            revert PostUpdateHookFailed(token);
        }
    }

    function stubSetRevertPostUpdate(bool revertPostUpdate_) external {
        revertPostUpdate = revertPostUpdate_;
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IControllerPostUpdateHook).interfaceId || super.supportsInterface(interfaceId);
    }
}
