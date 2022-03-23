//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@pythia-oracle/pythia-core/contracts/oracles/PeriodicAccumulationOracle.sol";

import "@openzeppelin-v4/contracts/access/AccessControl.sol";

import "../access/Roles.sol";

contract ManagedPeriodicAccumulationOracle is AccessControl, PeriodicAccumulationOracle {
    constructor(
        address liquidityAccumulator_,
        address priceAccumulator_,
        address quoteToken_,
        uint256 period_
    ) PeriodicAccumulationOracle(liquidityAccumulator_, priceAccumulator_, quoteToken_, period_) {
        initializeRoles();
    }

    /**
     * @notice Modifier to make a function callable only by a certain role. In
     * addition to checking the sender's role, `address(0)` 's role is also
     * considered. Granting a role to `address(0)` is equivalent to enabling
     * this role for everyone.
     */

    modifier onlyRoleOrOpenRole(bytes32 role) {
        if (!hasRole(role, address(0))) {
            require(hasRole(role, msg.sender), "ManagedPeriodicAccumulationOracle: MISSING_ROLE");
        }
        _;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, PeriodicAccumulationOracle)
        returns (bool)
    {
        return
            interfaceId == type(IAccessControl).interfaceId ||
            PeriodicAccumulationOracle.supportsInterface(interfaceId);
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER as ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.ADMIN);
    }

    function _update(address token) internal virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool) {
        return super._update(token);
    }
}
