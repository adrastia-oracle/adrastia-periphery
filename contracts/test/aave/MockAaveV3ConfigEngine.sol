// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../vendor/aave/IAaveV3ConfigEngine.sol";

contract MockAaveV3ConfigEngine is IAaveV3ConfigEngine {
    CapsUpdate[] public updates;

    event UpdateCaps(CapsUpdate[] updates);

    function updateCaps(CapsUpdate[] memory _updates) external override {
        updates = _updates;

        emit UpdateCaps(_updates);
    }
}
