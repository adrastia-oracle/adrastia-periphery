// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IAloc} from "@adrastia-oracle/adrastia-core/contracts/accumulators/proto/truefi/AlocUtilizationAndErrorAccumulator.sol";
import "../../../rates/IRateComputer.sol";
import "../../../vendor/truefi/IAutomatedLineOfCredit.sol";

contract AlocStub is IAloc, IAutomatedLineOfCredit {
    uint256 public constant BASIS_PRECISION = 1e4;

    uint256 internal _utilization;
    uint256 internal _liquidAssets;
    uint256 internal _interestRate;

    bool internal interestRateReverts;

    event FeesPaid(uint64 rate);

    constructor() {
        interestRateReverts = false;
    }

    function stubSetUtilization(uint256 utilization_) external {
        _utilization = utilization_;
    }

    function stubSetLiquidAssets(uint256 liquidAssets_) external {
        _liquidAssets = liquidAssets_;
    }

    function stubSetInterestRate(uint256 interestRate_) external {
        _interestRate = interestRate_;
    }

    function stubSetInterestRateReverts(bool reverts) external {
        interestRateReverts = reverts;
    }

    function utilization() external view override returns (uint256) {
        return _utilization;
    }

    function liquidAssets() external view override returns (uint256) {
        return _liquidAssets;
    }

    function updateAndPayFee() external override {
        // Extract the rate from the message sender
        uint64 rate = IRateComputer(msg.sender).computeRate(address(this));

        // Emit an event
        emit FeesPaid(rate);
    }

    function interestRate() external view override returns (uint256) {
        if (interestRateReverts) {
            revert("IR Reverts");
        }

        return _interestRate;
    }
}
