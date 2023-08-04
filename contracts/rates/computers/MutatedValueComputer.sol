// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IPeriodic.sol";
import "@adrastia-oracle/adrastia-core/contracts/interfaces/IUpdateable.sol";
import "@adrastia-oracle/adrastia-core/contracts/libraries/uniswap-lib/FullMath.sol";

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "../IRateComputer.sol";

/**
 * @title MutatedValueComputer
 * @notice Abstract contract for computing mutated values.
 * @dev Extend this contract and implement the getValue function to use it.
 */
abstract contract MutatedValueComputer is IERC165, IRateComputer {
    using SafeCast for uint256;

    struct Config {
        uint64 max;
        uint64 min;
        int64 offset;
        uint32 scalar;
    }

    /// @notice The default scalar value to represent 1x.
    uint32 public immutable defaultOneXScalar; // Suggested default value: 1,000,000

    /// @notice A mapping of token addresses to their Config structs.
    mapping(address => Config) internal configs;

    /// @notice Emitted when a token's configuration is updated.
    /// @param token The address of the token.
    /// @param oldConfig The old configuration.
    /// @param newConfig The new configuration.
    event ConfigUpdated(address indexed token, Config oldConfig, Config newConfig);

    /// @notice An error thrown when the specified one x scalar is invalid.
    /// @param oneXScalar The invalid one x scalar.
    error InvalidOneXScalar(uint32 oneXScalar);

    /// @notice An error thrown when trying to set a configuration, but the config is invalid.
    /// @param token The token address that the config is for.
    error InvalidConfig(address token);

    /// @notice An error that is thrown if we require a configuration that has not been set.
    /// @param token The token for which we require a configuration.
    error MissingConfig(address token);

    /**
     * @notice Constructs a new MutatedValueComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x.
     */
    constructor(uint32 defaultOneXScalar_) {
        if (defaultOneXScalar_ == 0) revert InvalidOneXScalar(defaultOneXScalar_);

        defaultOneXScalar = defaultOneXScalar_;
    }

    /**
     * @notice Returns the configuration for a token.
     * @param token The token address.
     * @return The token's configuration.
     */
    function getConfig(address token) external view virtual returns (Config memory) {
        return configs[token];
    }

    /**
     * @notice Sets the configuration for a specific token.
     * @dev Override `checkSetConfig` to control the access to this function.
     * @param token The token address.
     * @param max The maximum value for the token's rate.
     * @param min The minimum value for the token's rate.
     * @param offset The offset to apply to the computed value.
     * @param scalar The scalar value to apply to the computed value.
     */
    function setConfig(address token, uint64 max, uint64 min, int64 offset, uint32 scalar) external virtual {
        checkSetConfig();

        // This just doesn't make sense, so we revert
        if (max < min) revert InvalidConfig(token);

        // We use this check to determine if a token has been configured yet. It doesn't make sense to use a scalar of
        // 0 because at that point, the calculated value will always be constant, and a simpler contract can be used.
        if (scalar == 0) revert InvalidConfig(token);

        Config memory oldConfig = configs[token];
        configs[token] = Config({max: max, min: min, offset: offset, scalar: scalar});
        emit ConfigUpdated(token, oldConfig, configs[token]);
    }

    /// @inheritdoc IRateComputer
    function computeRate(address token) external view virtual override returns (uint64) {
        uint256 value = getValue(token);

        Config memory config = configs[token];
        if (config.scalar == 0) revert MissingConfig(token);

        if (value > type(uint224).max) {
            // Overflow is possible at this point and with the smallest scalar and offsets possible, it's impossible
            // for the result to be greater than the configured max value. Therefore, we can just return the max value

            return config.max;
        } else {
            value = (value * config.scalar) / defaultOneXScalar;
        }

        int256 adjustedValue = int256(value) + config.offset;

        // Ensure adjustedValue is not negative
        adjustedValue = adjustedValue < int256(0) ? int256(0) : adjustedValue;

        // Clamp the adjusted total supply between the configured min and max values
        uint64 clampedValue = (adjustedValue > int256(uint256(config.max)))
            ? config.max
            : uint64(uint256(adjustedValue));
        clampedValue = (clampedValue < config.min) ? config.min : clampedValue;

        return clampedValue;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IRateComputer).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /**
     * @notice Returns the mutated value for a given token.
     * @dev This is an internal virtual function that must be implemented by the derived contract to provide the
     *   specific logic for extracting the mutated value for the token.
     * @param token The token address for which the mutated value should be computed.
     * @return The mutated value for the given token.
     */
    function getValue(address token) internal view virtual returns (uint256);

    /// @notice Checks if the caller is authorized to set the configuration.
    /// @dev This function should contain the access control logic for the setConfig function.
    function checkSetConfig() internal view virtual;
}
