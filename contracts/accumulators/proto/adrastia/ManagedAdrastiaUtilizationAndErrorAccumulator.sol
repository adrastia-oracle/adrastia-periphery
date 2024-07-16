// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/accumulators/proto/adrastia/AdrastiaUtilizationAndErrorAccumulator.sol";

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../AccumulatorConfig.sol";
import "../../../access/Roles.sol";

contract ManagedAdrastiaUtilizationAndErrorAccumulator is
    AccessControlEnumerable,
    AdrastiaUtilizationAndErrorAccumulator,
    AccumulatorConfig
{
    struct TargetConfig {
        bool initialized;
        uint112 target;
    }

    mapping(address => TargetConfig) internal targets;

    /// @notice An event emitted when a target is initialized or uninitialized.
    /// @param token The token that is initialized. address(0) is used for the default target.
    /// @param initialized Whether the target is initialized or uninitialized.
    event TargetInitialized(address indexed token, bool initialized);

    /// @notice An event emitted when a target is updated.
    /// @param token The token that is updated.
    /// @param target The new target.
    event TargetUpdated(address indexed token, uint112 target);

    /// @notice An error thrown when attempting to set a new target that is the same as the current target.
    /// @dev This is thrown to make it more noticeable when nothing changes. It's probably a mistake.
    /// @param token The token that is unchanged.
    /// @param target The unchanged target.
    error TargetNotChanged(address token, uint112 target);

    /// @notice An error thrown when attempting to revert to the default target when the target is already using the
    /// default target.
    /// @param token The token that is already using the default target.
    error AlreadyUsingDefaultTarget(address token);

    constructor(
        address sbOracle_,
        bool considerEmptyAs100Percent_,
        uint112 target_,
        IAveragingStrategy averagingStrategy_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AdrastiaUtilizationAndErrorAccumulator(
            sbOracle_,
            considerEmptyAs100Percent_,
            target_,
            averagingStrategy_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
        AccumulatorConfig(uint32(updateTheshold_), uint32(minUpdateDelay_), uint32(maxUpdateDelay_))
    {
        initializeDefaultTarget(target_);
    }

    /// @notice Sets a new target for the given token.
    /// @dev Only accounts with the TARGET_ADMIN role can call this function.
    /// @param token The token to set the target for. address(0) is used for the default target.
    /// @param target The new target.
    function setTarget(address token, uint112 target) external virtual onlyRole(Roles.TARGET_ADMIN) {
        TargetConfig storage targetConfig = targets[token];

        bool initialized = targetConfig.initialized;
        uint112 oldTarget = targetConfig.target;

        if (initialized && oldTarget == target) {
            // Revert to signal that nothing was changed.
            revert TargetNotChanged(token, target);
        }

        targetConfig.initialized = true;
        targetConfig.target = target;

        if (!initialized) {
            emit TargetInitialized(token, true);
        }

        emit TargetUpdated(token, target);
    }

    /// @notice Checks if the given token is using the default target.
    /// @param token The token to check.
    /// @return Whether the token is using the default target.
    function isUsingDefaultTarget(address token) external view virtual returns (bool) {
        if (token == address(0)) {
            // address(0) specifies the default target.
            return true;
        }

        return !targets[token].initialized;
    }

    /// @notice Reverts the target for the given token to the default target.
    /// @dev Only accounts with the TARGET_ADMIN role can call this function.
    /// @param token The token to revert the target for.
    function revertToDefaultTarget(address token) external virtual onlyRole(Roles.TARGET_ADMIN) {
        if (token == address(0)) {
            // Revert to signal that nothing was changed.
            revert AlreadyUsingDefaultTarget(token);
        }

        TargetConfig storage targetConfig = targets[token];

        if (!targetConfig.initialized) {
            // Revert to signal that nothing was changed.
            revert AlreadyUsingDefaultTarget(token);
        }

        targetConfig.initialized = false;

        emit TargetInitialized(token, false);
    }

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
    ) public view virtual override(AccessControlEnumerable, LiquidityAccumulator) returns (bool) {
        return
            AccessControlEnumerable.supportsInterface(interfaceId) ||
            LiquidityAccumulator.supportsInterface(interfaceId);
    }

    function initializeDefaultTarget(uint112 target) internal virtual {
        TargetConfig storage targetConfig = targets[address(0)];

        targetConfig.initialized = true;
        targetConfig.target = target;

        emit TargetInitialized(address(0), true);
        emit TargetUpdated(address(0), target);
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

    function fetchTarget(bytes memory data) internal view virtual override returns (uint112 target) {
        address token = abi.decode(data, (address));

        TargetConfig memory tokenConfig = targets[token];
        if (!tokenConfig.initialized) {
            // If the target is not initialized, use the default target.
            target = targets[address(0)].target;
        } else {
            target = tokenConfig.target;
        }
    }
}
