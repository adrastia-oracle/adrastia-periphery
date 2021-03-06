//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@pythia-oracle/pythia-core/contracts/accumulators/proto/curve/CurvePriceAccumulator.sol";

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../../access/Roles.sol";

contract ManagedCurvePriceAccumulator is AccessControlEnumerable, CurvePriceAccumulator {
    constructor(
        address curvePool_,
        int8 nCoins_,
        address poolQuoteToken_,
        address ourQuoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        CurvePriceAccumulator(
            curvePool_,
            nCoins_,
            poolQuoteToken_,
            ourQuoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {
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
            require(hasRole(role, msg.sender), "ManagedCurvePriceAccumulator: MISSING_ROLE");
        }
        _;
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        // Return false if the message sender is missing the required role
        if (!hasRole(Roles.ORACLE_UPDATER, address(0)) && !hasRole(Roles.ORACLE_UPDATER, msg.sender)) return false;

        return super.canUpdate(data);
    }

    function update(bytes memory data) public virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool) {
        return super.update(data);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlEnumerable, PriceAccumulator)
        returns (bool)
    {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) || PriceAccumulator.supportsInterface(interfaceId);
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER as ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.ADMIN);
    }
}
