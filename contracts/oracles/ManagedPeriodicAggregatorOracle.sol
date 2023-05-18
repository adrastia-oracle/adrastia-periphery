// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/oracles/PeriodicAggregatorOracle.sol";

import "./bases/ManagedAggregatorOracleBase.sol";

contract ManagedPeriodicAggregatorOracle is PeriodicAggregatorOracle, ManagedAggregatorOracleBase {
    constructor(
        AbstractAggregatorOracleParams memory params,
        uint256 period_,
        uint256 granularity_
    ) PeriodicAggregatorOracle(params, period_, granularity_) ManagedAggregatorOracleBase() {}

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        // Return false if the message sender is missing the required role
        if (!hasRole(Roles.ORACLE_UPDATER, address(0)) && !hasRole(Roles.ORACLE_UPDATER, msg.sender)) return false;

        return super.canUpdate(data);
    }

    function update(bytes memory data) public virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool) {
        return super.update(data);
    }

    function quoteTokenDecimals()
        public
        view
        virtual
        override(AbstractAggregatorOracle, ManagedAggregatorOracleBase)
        returns (uint8)
    {
        return AbstractAggregatorOracle.quoteTokenDecimals();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, PeriodicAggregatorOracle) returns (bool) {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) ||
            PeriodicAggregatorOracle.supportsInterface(interfaceId);
    }

    function _minimumResponses(address token) internal view virtual override returns (uint256) {
        IOracleAggregatorTokenConfig tokenConfig = tokenConfigs[token];
        if (address(tokenConfig) != address(0)) {
            return tokenConfig.minimumResponses();
        }

        return super._minimumResponses(token);
    }

    function _aggregationStrategy(address token) internal view virtual override returns (IAggregationStrategy) {
        IOracleAggregatorTokenConfig tokenConfig = tokenConfigs[token];
        if (address(tokenConfig) != address(0)) {
            return tokenConfig.aggregationStrategy();
        }

        return super._aggregationStrategy(token);
    }

    function _validationStrategy(address token) internal view virtual override returns (IValidationStrategy) {
        IOracleAggregatorTokenConfig tokenConfig = tokenConfigs[token];
        if (address(tokenConfig) != address(0)) {
            return tokenConfig.validationStrategy();
        }

        return super._validationStrategy(token);
    }

    function _getOracles(address token) internal view virtual override returns (Oracle[] memory oracles) {
        IOracleAggregatorTokenConfig tokenConfig = tokenConfigs[token];
        if (address(tokenConfig) != address(0)) {
            return tokenConfig.oracles();
        }

        return super._getOracles(token);
    }
}
