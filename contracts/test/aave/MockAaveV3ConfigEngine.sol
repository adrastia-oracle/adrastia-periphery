// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../vendor/aave/IACLManager.sol";
import "../../vendor/aave/IAaveV3ConfigEngine.sol";

contract MockAaveV3ConfigEngine is IAaveV3ConfigEngine {
    IACLManager public aclManager;

    CapsUpdate public lastUpdate;

    event CapsUpdated(address asset, uint256 supplyCap, uint256 borrowCap);

    constructor(IACLManager aclManager_) {
        aclManager = aclManager_;
    }

    function updateCaps(CapsUpdate[] memory _updates) external override {
        require(aclManager.isRiskAdmin(msg.sender), "Only risk admin can call");

        require(_updates.length == 1, "Only one update allowed");

        lastUpdate = _updates[0];

        emit CapsUpdated(_updates[0].asset, _updates[0].supplyCap, _updates[0].borrowCap);
    }
}
