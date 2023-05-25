// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IPeriodic.sol";
import "@adrastia-oracle/adrastia-core/contracts/interfaces/IUpdateable.sol";

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "../../access/Roles.sol";
import "../IRateComputer.sol";

/**
 * @title MutatedValueComputer
 * @notice Abstract contract for computing mutated values.
 * @dev Extend this contract and implement the getValue function to use it.
 */
abstract contract MutatedValueComputer is IERC165, IRateComputer, AccessControlEnumerable {
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

    /**
     * @notice Constructs a new MutatedValueComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x.
     */
    constructor(uint32 defaultOneXScalar_) {
        defaultOneXScalar = defaultOneXScalar_;

        initializeRoles();
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
     * @dev Callable only by the RATE_ADMIN role.
     * @param token The token address.
     * @param max The maximum value for the token's rate.
     * @param min The minimum value for the token's rate.
     * @param offset The offset to apply to the computed value.
     * @param scalar The scalar value to apply to the computed value.
     */
    function setConfig(
        address token,
        uint64 max,
        uint64 min,
        int64 offset,
        uint32 scalar
    ) external virtual onlyRole(Roles.RATE_ADMIN) {
        Config memory oldConfig = configs[token];
        configs[token] = Config({max: max, min: min, offset: offset, scalar: scalar});
        emit ConfigUpdated(token, oldConfig, configs[token]);
    }

    /// @inheritdoc IRateComputer
    function computeRate(address token) external view virtual override returns (uint64) {
        uint256 value = getValue(token);

        Config memory config = configs[token];

        // Apply the configured parameters
        uint256 scaledValue = (value * config.scalar) / defaultOneXScalar;

        // Check that scaledValue is within the range of int256
        if (scaledValue > uint256(type(int256).max)) {
            scaledValue = uint256(type(int256).max);
        }

        int256 adjustedValue = int256(scaledValue) + config.offset;

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
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, IERC165) returns (bool) {
        return
            interfaceId == type(IRateComputer).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            AccessControlEnumerable.supportsInterface(interfaceId);
    }

    /**
     * @notice Returns the mutated value for a given token.
     * @dev This is an internal virtual function that must be implemented by the derived contract to provide the
     *   specific logic for extracting the mutated value for the token.
     * @param token The token address for which the mutated value should be computed.
     * @return The mutated value for the given token.
     */
    function getValue(address token) internal view virtual returns (uint256);

    /**
     * @notice Initializes the role-based access control hierarchy.
     * @dev This internal virtual function sets up the initial access control roles and their hierarchy. The function
     *   creates the ADMIN and RATE_ADMIN roles and defines their relationships. By default, the msg.sender is assigned
     *   the ADMIN role upon contract deployment.
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
