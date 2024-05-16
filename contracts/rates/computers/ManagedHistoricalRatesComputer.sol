// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "./HistoricalRatesComputer.sol";
import "../../access/Roles.sol";

/**
 * @title ManagedHistoricalRatesComputer
 * @notice A ManagedHistoricalRatesComputer that uses AccessControlEnumerable to manage roles.
 *
 * The roles hierarchy is as follows:
 *  - ADMIN
 *   - RATE_ADMIN
 */
contract ManagedHistoricalRatesComputer is AccessControlEnumerable, HistoricalRatesComputer {
    constructor(
        IHistoricalRates defaultRateProvider,
        uint16 defaultIndex,
        bool defaultHighAvailability
    ) HistoricalRatesComputer(defaultRateProvider, defaultIndex, defaultHighAvailability) {
        initializeRoles();
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, HistoricalRatesComputer) returns (bool) {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) ||
            HistoricalRatesComputer.supportsInterface(interfaceId);
    }

    /**
     * @notice Checks if the sender has the required role to set the config, namely, the RATE_ADMIN role.
     * @param token The token address that the config is for.
     */
    function checkSetConfig(address token) internal view virtual override onlyRole(Roles.RATE_ADMIN) {
        token; // Silence the unused variable warning
    }

    /**
     * @notice Initializes the roles hierarchy.
     * @dev Sets up the roles and their hierarchy:
     *          ADMIN
     *            |
     *        RATE_ADMIN
     * @dev The ADMIN role is set up with msg.sender as the initial admin.
     */
    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of RATE_ADMIN as ADMIN
        _setRoleAdmin(Roles.RATE_ADMIN, Roles.ADMIN);

        // Hierarchy:
        // ADMIN
        //   - RATE_ADMIN
    }
}
