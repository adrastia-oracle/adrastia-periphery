// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../../rates/computers/Erc20MutationComputer.sol";

contract Erc20MutationComputerStub is Erc20MutationComputer {
    mapping(address => uint256) public values;

    bool public revertOnSetConfig;

    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) Erc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {
        revertOnSetConfig = false;
    }

    function stubSetValue(address token, uint256 value) public {
        values[token] = value;
    }

    function stubSetRevertOnSetConfig(bool revertOnSetConfig_) public {
        revertOnSetConfig = revertOnSetConfig_;
    }

    function stubGetValue(address token) public view returns (uint256) {
        return getValue(token);
    }

    function extractValueFromToken(address token) internal view virtual override returns (uint256) {
        return values[token];
    }

    function checkSetConfig() internal view virtual override {
        if (revertOnSetConfig) revert("revertOnSetConfig");
    }
}
