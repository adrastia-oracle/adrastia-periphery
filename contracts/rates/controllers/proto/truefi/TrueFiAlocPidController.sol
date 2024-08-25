// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ManagedPidController.sol";
import "../../../../vendor/truefi/IAutomatedLineOfCredit.sol";

contract TrueFiAlocPidController is ManagedPidController {
    constructor(
        ILiquidityOracle inputAndErrorOracle_,
        bool computeAhead_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    )
        ManagedPidController(
            inputAndErrorOracle_,
            computeAhead_,
            period_,
            initialBufferCardinality_,
            updatersMustBeEoa_
        )
    {}

    /// @dev Overridden to accrue interest for the prior rate before pushing the new rate.
    function push(address alocAddress, RateLibrary.Rate memory rate) internal virtual override {
        // Accrue interest for the prior rate before pushing the new rate
        if (rateBufferMetadata[alocAddress].size > 0) {
            // Check if the aloc has an interest rate to accrue. This check is useful for complex ALOCs that may not be
            // able to calculate the rate soly based on this controller.
            (bool success, ) = alocAddress.staticcall(
                abi.encodeWithSelector(IAutomatedLineOfCredit.interestRate.selector)
            );
            if (success) {
                // We have a rate to accrue interest for. Let's perform the update.
                IAutomatedLineOfCredit(alocAddress).updateAndPayFee();
            }
        }

        super.push(alocAddress, rate);
    }
}
