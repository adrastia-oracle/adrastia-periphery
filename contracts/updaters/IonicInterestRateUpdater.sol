// License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IUpdateable} from "@adrastia-oracle/adrastia-core/contracts/interfaces/IUpdateable.sol";
import {RateController} from "../rates/RateController.sol";
import "../vendor/ionic/IComptroller.sol";
import "../vendor/ionic/ICToken.sol";

/**
 * @title IonicInterestRateUpdater
 * @notice A contract that accrues interest to Ionic cTokens before updating interest rates.
 */
contract IonicInterestRateUpdater is IUpdateable {
    /**
     * @notice The comptroller contract.
     */
    IComptroller public immutable comptroller;

    /**
     * @notice The rate controller contract.
     */
    RateController public immutable rateController;

    /**
     * An error thrown when the cToken for a token is not found.
     * @param token The token address.
     */
    error CTokenNotFound(address token);

    /**
     * An error thrown when failing to accrue interest for a token.
     * @param token The token address.
     * @param cToken The cToken address.
     * @param errorCode The error code returned by the cToken.
     */
    error FailedToAccrueInterest(address token, address cToken, uint256 errorCode);

    /**
     * @notice Constructs a new IonicInterestRateUpdater instance.
     * @param comptroller_ The address of the comptroller contract.
     * @param rateController_ The address of the rate controller contract.
     */
    constructor(IComptroller comptroller_, RateController rateController_) {
        comptroller = comptroller_;
        rateController = rateController_;
    }

    /// @inheritdoc IUpdateable
    function canUpdate(bytes memory data) public view virtual override returns (bool b) {
        return rateController.canUpdate(data);
    }

    /// @inheritdoc IUpdateable
    function needsUpdate(bytes memory data) public view virtual override returns (bool b) {
        return rateController.needsUpdate(data);
    }

    /// @inheritdoc IUpdateable
    function lastUpdateTime(bytes memory data) public view virtual override returns (uint256) {
        return rateController.lastUpdateTime(data);
    }

    /// @inheritdoc IUpdateable
    function timeSinceLastUpdate(bytes memory data) public view virtual override returns (uint256) {
        return rateController.timeSinceLastUpdate(data);
    }

    /// @inheritdoc IUpdateable
    function update(bytes memory data) public virtual override returns (bool b) {
        address token = abi.decode(data, (address));
        accrueInterest(token);

        return rateController.update(data);
    }

    /**
     * @notice Accrues interest for a token, if the rate controller has a prior rate for the token.
     * @dev Reverts if we're unable to accrue interest for the token.
     * @param token The token address.
     */
    function accrueInterest(address token) internal {
        // Try and accrue interest if we have a prior rate
        // This allows us to create new cTokens and set the initial rate before the cToken is added to the comptroller.
        // Otherwise, the cToken will be bricked
        if (rateController.getRatesCount(token) > 0) {
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
    }
}
