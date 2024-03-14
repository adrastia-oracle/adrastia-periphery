// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/accumulators/proto/adrastia/AdrastiaPriceAccumulator.sol";

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../AccumulatorConfig.sol";
import "../../../access/Roles.sol";

contract ManagedAdrastiaPriceAccumulator is AccessControlEnumerable, AdrastiaPriceAccumulator, AccumulatorConfig {
    constructor(
        bool validationDisabled_,
        IAveragingStrategy averagingStrategy_,
        address adrastiaOracle_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AdrastiaPriceAccumulator(
            validationDisabled_,
            averagingStrategy_,
            adrastiaOracle_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
        AccumulatorConfig(uint32(updateTheshold_), uint32(minUpdateDelay_), uint32(maxUpdateDelay_))
    {}

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        // Return false if the message sender is missing the required role
        if (!hasRole(Roles.ORACLE_UPDATER, address(0)) && !hasRole(Roles.ORACLE_UPDATER, msg.sender)) return false;

        return super.canUpdate(data);
    }

    function update(bytes memory data) public virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool) {
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
}
