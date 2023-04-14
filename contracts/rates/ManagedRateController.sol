//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "./RateController.sol";
import "../access/Roles.sol";

contract ManagedRateController is RateController, AccessControlEnumerable {
    /// @notice An error that is thrown if we're missing a required role.
    /// @dev A different error is thrown when using the `onlyRole` modifier.
    /// @param requiredRole The role (hash) that we're missing.
    error MissingRole(bytes32 requiredRole);

    /**
     * @notice Modifier to make a function callable only by a certain role. In
     * addition to checking the sender's role, `address(0)` 's role is also
     * considered. Granting a role to `address(0)` is equivalent to enabling
     * this role for everyone.
     */
    modifier onlyRoleOrOpenRole(bytes32 role) {
        if (!hasRole(role, address(0)) && !hasRole(role, msg.sender)) {
            revert MissingRole(role);
        }
        _;
    }

    constructor(
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) RateController(period_, initialBufferCardinality_, updatersMustBeEoa_) {
        initializeRoles();
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool b) {
        return
            // Can only update if the sender is an oracle updater or the oracle updater role is open
            (hasRole(Roles.ORACLE_UPDATER, address(0)) || hasRole(Roles.ORACLE_UPDATER, msg.sender)) &&
            super.canUpdate(data);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, RateController) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function checkSetConfig() internal view virtual override onlyRole(Roles.RATE_ADMIN) {}

    function checkSetUpdatesPaused() internal view virtual override onlyRole(Roles.UPDATE_PAUSE_ADMIN) {}

    function checkSetRatesCapacity() internal view virtual override onlyRole(Roles.ADMIN) {}

    function checkUpdate() internal view virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) {}

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of RATE_ADMIN as ADMIN
        _setRoleAdmin(Roles.RATE_ADMIN, Roles.ADMIN);

        // Set admin of UPDATE_PAUSE_ADMIN as ADMIN
        _setRoleAdmin(Roles.UPDATE_PAUSE_ADMIN, Roles.ADMIN);

        // Set admin of UPDATER_ADMIN as ADMIN
        _setRoleAdmin(Roles.UPDATER_ADMIN, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER as UPDATER_ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.UPDATER_ADMIN);

        // Hierarchy:
        // ADMIN
        //   - RATE_ADMIN
        //   - UPDATER_ADMIN
        //     - ORACLE_UPDATER
        //   - UPDATE_PAUSE_ADMIN
    }
}
