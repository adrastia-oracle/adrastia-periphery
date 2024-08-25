// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../ManagedRateController.sol";
import "../../../../vendor/ionic/IComptroller.sol";
import "../../../../vendor/ionic/ICToken.sol";

contract IonicRateController is ManagedRateController {
    IComptroller public immutable comptroller;

    error CTokenNotFound(address token);

    error FailedToAccrueInterest(address token, address cToken, uint256 errorCode);

    constructor(
        IComptroller comptroller_,
        bool computeAhead_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) ManagedRateController(computeAhead_, period_, initialBufferCardinality_, updatersMustBeEoa_) {
        comptroller = comptroller_;
    }

    /// @dev Overridden to accrue interest for the prior rate before pushing the new rate.
    function push(address token, RateLibrary.Rate memory rate) internal virtual override {
        // Try and accrue interest if we have a prior rate
        if (rateBufferMetadata[token].size > 0) {
            address cToken = comptroller.cTokensByUnderlying(token);
            if (cToken == address(0)) {
                // Note that this check is not applied for the first rate to allow for the initial rate to be set
                // before the cToken is added to the comptroller.
                revert CTokenNotFound(token);
            }

            // Accrue interest for the prior rate before pushing the new rate
            uint256 accrueCode = ICToken(cToken).accrueInterest();
            if (accrueCode != 0) {
                revert FailedToAccrueInterest(token, cToken, accrueCode);
            }
        }

        super.push(token, rate);
    }
}
