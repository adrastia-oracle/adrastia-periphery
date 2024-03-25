// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ManagedPidController.sol";
import "../../../../vendor/truefi/IAutomatedLineOfCredit.sol";

contract TrueFiAlocPidController is ManagedPidController {
    constructor(
        ILiquidityOracle inputAndErrorOracle_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) ManagedPidController(inputAndErrorOracle_, period_, initialBufferCardinality_, updatersMustBeEoa_) {}

    /// @dev Overridden to accrue interest for the prior rate before pushing the new rate.
    function push(address alocAddress, RateLibrary.Rate memory rate) internal virtual override {
        // Accrue interest for the prior rate before pushing the new rate
        if (rateBufferMetadata[alocAddress].size > 0) {
            // We have a rate to accrue interest for. Let's perform the update.
            IAutomatedLineOfCredit(alocAddress).updateAndPayFee();
        }

        super.push(alocAddress, rate);
    }
}
