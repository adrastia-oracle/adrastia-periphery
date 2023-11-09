// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../rates/computers/MutatedValueComputer.sol";

contract MutatedValueComputerStub is MutatedValueComputer {
    mapping(address => uint256) public values;

    bool public revertOnSetConfig;

    constructor(uint32 defaultOneXScalar_) MutatedValueComputer(defaultOneXScalar_) {
        revertOnSetConfig = false;
    }

    function stubSetValue(address token, uint256 value) public {
        values[token] = value;
    }

    function stubSetRevertOnSetConfig(bool revertOnSetConfig_) public {
        revertOnSetConfig = revertOnSetConfig_;
    }

    function getValue(address token) internal view virtual override returns (uint256) {
        return values[token];
    }

    function checkSetConfig() internal view virtual override {
        if (revertOnSetConfig) revert("revertOnSetConfig");
    }
}
