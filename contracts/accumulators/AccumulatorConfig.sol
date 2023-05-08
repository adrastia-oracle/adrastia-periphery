// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";
import "../access/Roles.sol";

/// @title AccumulatorConfig
/// @notice A contract for managing the configuration of an accumulator.
contract AccumulatorConfig is AccessControlEnumerable {
    /// @dev A struct that holds configuration values for the accumulator.
    struct Config {
        uint32 updateThreshold;
        uint32 updateDelay;
        uint32 heartbeat;
    }

    /// @dev Emitted when the configuration is updated.
    event ConfigUpdated(Config oldConfig, Config newConfig);

    /// @dev The current configuration.
    Config internal config;

    /// @dev An error thrown when attempting to set an invalid configuration.
    error InvalidConfig(Config config);

    /// @notice Constructs a new AccumulatorConfig with the given configuration values.
    /// @param updateThreshold_ The initial value for the update threshold.
    /// @param updateDelay_ The initial value for the update delay.
    /// @param heartbeat_ The initial value for the heartbeat.
    constructor(uint32 updateThreshold_, uint32 updateDelay_, uint32 heartbeat_) {
        config.updateThreshold = updateThreshold_;
        config.updateDelay = updateDelay_;
        config.heartbeat = heartbeat_;
    }

    /// @notice Sets a new configuration.
    /// @param newConfig The new configuration values.
    /// @dev Only accounts with the CONFIG_ADMIN role can call this function.
    function setConfig(Config calldata newConfig) external virtual onlyRole(Roles.CONFIG_ADMIN) {
        // Ensure that updateDelay is not greater than heartbeat
        if (newConfig.updateDelay > newConfig.heartbeat) revert InvalidConfig(newConfig);

        // Ensure that updateThreshold is not zero
        if (newConfig.updateThreshold == 0) revert InvalidConfig(newConfig);

        Config memory oldConfig = config;
        config = newConfig;
        emit ConfigUpdated(oldConfig, newConfig);
    }
}