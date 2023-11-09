// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../rates/computers/OracleMutationComputer.sol";

contract OracleMutationComputerStub is OracleMutationComputer {
    bool public revertOnSetConfig;

    constructor(
        IOracle oracle_,
        uint256 dataSlot_,
        uint32 defaultOneXScalar_,
        int8 decimalsOffset_
    ) OracleMutationComputer(oracle_, dataSlot_, defaultOneXScalar_, decimalsOffset_) {
        revertOnSetConfig = false;
    }

    function stubSetRevertOnSetConfig(bool revertOnSetConfig_) public {
        revertOnSetConfig = revertOnSetConfig_;
    }

    function stubGetValue(address token) public view returns (uint256) {
        return getValue(token);
    }

    function stubGetTokenDecimalsOrDefault(address token) public view returns (uint8) {
        return getTokenDecimalsOrDefault(token);
    }

    function checkSetConfig() internal view virtual override {
        if (revertOnSetConfig) revert("revertOnSetConfig");
    }
}
