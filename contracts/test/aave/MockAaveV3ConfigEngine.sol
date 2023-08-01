// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../vendor/aave/IAaveV3ConfigEngine.sol";

contract MockAaveV3ConfigEngine is IAaveV3ConfigEngine {
    CapsUpdate public lastUpdate;

    event CapsUpdated(address asset, uint256 supplyCap, uint256 borrowCap);

    function updateCaps(CapsUpdate[] memory _updates) external override {
        require(_updates.length == 1, "Only one update allowed");

        lastUpdate = _updates[0];

        emit CapsUpdated(_updates[0].asset, _updates[0].supplyCap, _updates[0].borrowCap);
    }
}
