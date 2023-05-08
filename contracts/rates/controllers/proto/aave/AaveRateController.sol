//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../../RateController.sol";
import "../../../../vendor/aave/IACLManager.sol";

/**
 * @title AaveRateController
 * @notice A smart contract that extends RateController to implement access control based on Aave's ACL Manager.
 */
contract AaveRateController is RateController {
    /// @notice The Aave ACL Manager instance.
    IACLManager public immutable aclManager;

    /// @notice An error that is thrown if the account is not authorized for the required role.
    /// @param account The account that is not authorized.
    /// @param requiredRole The required role (hash) that the account is missing.
    error NotAuthorized(address account, bytes32 requiredRole);

    /**
     * @notice Constructs the AaveRateController contract.
     * @param aclManager_ The Aave ACL Manager instance.
     * @param period_ The period of the rate controller.
     * @param initialBufferCardinality_ The initial cardinality of the rate buffers.
     * @param updatersMustBeEoa_ Whether or not the updaters must be EOA.
     */
    constructor(
        IACLManager aclManager_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) RateController(period_, initialBufferCardinality_, updatersMustBeEoa_) {
        aclManager = aclManager_;
    }

    /**
     * @notice Checks if the sender has the required role to set the rate, namely, the POOL_ADMIN role.
     */
    function checkSetConfig() internal view virtual override {
        if (!aclManager.isPoolAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.POOL_ADMIN_ROLE());
        }
    }

    /**
     * @notice Checks if the sender has the required role to manually push rates, namely, the POOL_ADMIN role.
     */
    function checkManuallyPushRate() internal view virtual override {
        if (!aclManager.isPoolAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.POOL_ADMIN_ROLE());
        }
    }

    /**
     * @notice Checks if the sender has the required role to [un]pause updates, namely, the EMERGENCY_ADMIN role.
     */
    function checkSetUpdatesPaused() internal view virtual override {
        if (!aclManager.isEmergencyAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.EMERGENCY_ADMIN_ROLE());
        }
    }

    /**
     * @notice Checks if the sender has the required role change the rate buffer capacity, namely, the POOL_ADMIN role.
     */
    function checkSetRatesCapacity() internal view virtual override {
        if (!aclManager.isPoolAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.POOL_ADMIN_ROLE());
        }
    }

    /**
     * @notice Checks if the sender has the required role to poke rate updates, which is anyone.
     */
    function checkUpdate() internal view virtual override {
        // Anyone can poke updates (provided they are not paused)
    }
}
