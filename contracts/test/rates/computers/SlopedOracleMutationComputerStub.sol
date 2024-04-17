// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../rates/computers/SlopedOracleMutationComputer.sol";

contract SlopedOracleMutationComputerStub is SlopedOracleMutationComputer {
    bool public revertOnSetConfig;
    bool public revertOnSetSlopeConfig;

    bool public _sanitizeInput;
    uint256 public _sanitizedInput;

    constructor(
        IOracle oracle_,
        uint256 dataSlot_,
        uint32 defaultOneXScalar_,
        int8 decimalsOffset_
    ) SlopedOracleMutationComputer(oracle_, dataSlot_, defaultOneXScalar_, decimalsOffset_) {
        revertOnSetConfig = false;
        revertOnSetSlopeConfig = false;
    }

    function stubSetRevertOnSetConfig(bool revertOnSetConfig_) public {
        revertOnSetConfig = revertOnSetConfig_;
    }

    function stubSetRevertOnSetSlopeConfig(bool revertOnSetSlopeConfig_) public {
        revertOnSetSlopeConfig = revertOnSetSlopeConfig_;
    }

    function stubSetSanitizeInput(bool sanitizeInput_, uint256 sanitizedInput_) public {
        _sanitizeInput = sanitizeInput_;
        _sanitizedInput = sanitizedInput_;
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

    function checkSetSlopeConfig() internal view virtual override {
        if (revertOnSetSlopeConfig) revert("revertOnSetSlopeConfig");
    }

    function sanitizeInput(address token, uint256 input) internal view virtual override returns (uint256) {
        if (_sanitizeInput) return _sanitizedInput;

        return super.sanitizeInput(token, input);
    }
}
