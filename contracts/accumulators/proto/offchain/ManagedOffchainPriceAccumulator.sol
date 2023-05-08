//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/accumulators/proto/offchain/OffchainPriceAccumulator.sol";

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../AccumulatorConfig.sol";
import "../../../access/Roles.sol";

contract ManagedOffchainPriceAccumulator is AccessControlEnumerable, OffchainPriceAccumulator, AccumulatorConfig {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        OffchainPriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_)
        AccumulatorConfig(uint32(updateTheshold_), uint32(minUpdateDelay_), uint32(maxUpdateDelay_))
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
    ) public view virtual override(AccessControlEnumerable, PriceAccumulator) returns (bool) {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) || PriceAccumulator.supportsInterface(interfaceId);
    }

    function _updateDelay() internal view virtual override returns (uint256) {
        return config.updateDelay;
    }

    function _heartbeat() internal view virtual override returns (uint256) {
        return config.heartbeat;
    }

    function _updateThreshold() internal view virtual override returns (uint256) {
        return config.updateThreshold;
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // CONFIG_ADMIN is managed by ADMIN
        _setRoleAdmin(Roles.CONFIG_ADMIN, Roles.ADMIN);

        // UPDATER_ADMIN is managed by ADMIN
        _setRoleAdmin(Roles.UPDATER_ADMIN, Roles.ADMIN);

        // ORACLE_UPDATER is managed by UPDATER_ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.UPDATER_ADMIN);

        // Hierarchy:
        // ADMIN
        //   - CONFIG_ADMIN
        //   - UPDATER_ADMIN
        //     - ORACLE_UPDATER
    }
}
