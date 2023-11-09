// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "./OracleMutationComputer.sol";
import "../../access/Roles.sol";

/**
 * @title ManagedOracleMutationComputer
 * @notice A contract that computes mutated values from an Adrastia oracle contract with access control enforced by the
 * OpenZeppelin AccessControlEnumerable contract.
 * @dev Inherits from OracleMutationComputer and AccessControlEnumerable. The contract enforces the RATE_ADMIN role for
 * setting config.
 */
contract ManagedOracleMutationComputer is OracleMutationComputer, AccessControlEnumerable {
    /**
     * @notice Constructs a new ManagedOracleMutationComputer instance.
     * @dev Initializes the roles hierarchy with the message sender as the initial admin.
     * @param oracle_ The address of the oracle contract.
     * @param dataSlot_  The data slot to use when consulting the oracle. See the DATA_SLOT_* constants.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param decimalsOffset_ The decimal offset to apply when scaling the value from the token. Positive values scale
     *   up, negative values scale down. Measured in numbers of decimals places (powers of 10).
     */
    constructor(
        IOracle oracle_,
        uint256 dataSlot_,
        uint32 defaultOneXScalar_,
        int8 decimalsOffset_
    ) OracleMutationComputer(oracle_, dataSlot_, defaultOneXScalar_, decimalsOffset_) {
        initializeRoles();
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, MutatedValueComputer) returns (bool) {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) ||
            MutatedValueComputer.supportsInterface(interfaceId);
    }

    /**
     * @notice Checks if the sender has the required role to set the config, namely, the POOL_ADMIN role.
     */
    function checkSetConfig() internal view virtual override onlyRole(Roles.RATE_ADMIN) {}

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
