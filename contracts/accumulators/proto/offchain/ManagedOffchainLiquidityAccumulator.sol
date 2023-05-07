//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/accumulators/proto/offchain/OffchainLiquidityAccumulator.sol";

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../../access/Roles.sol";

contract ManagedOffchainLiquidityAccumulator is AccessControlEnumerable, OffchainLiquidityAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        OffchainLiquidityAccumulator(
            averagingStrategy_,
            quoteToken_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {
        initializeRoles();
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        // Return false if the message sender is missing the required role
        if (!hasRole(Roles.ORACLE_UPDATER, msg.sender)) return false;

        return super.canUpdate(data);
    }

    function update(bytes memory data) public virtual override onlyRole(Roles.ORACLE_UPDATER) returns (bool) {
        return super.update(data);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, LiquidityAccumulator) returns (bool) {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) ||
            LiquidityAccumulator.supportsInterface(interfaceId);
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // UPDATER_ADMIN is managed by ADMIN
        _setRoleAdmin(Roles.UPDATER_ADMIN, Roles.ADMIN);

        // ORACLE_UPDATER is managed by UPDATER_ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.UPDATER_ADMIN);

        // Hierarchy:
        // ADMIN
        //   - UPDATER_ADMIN
        //     - ORACLE_UPDATER
    }
}
