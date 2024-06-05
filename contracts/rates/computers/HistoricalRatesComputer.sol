// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";

import "../IHistoricalRates.sol";
import "../IRateComputer.sol";
import "../IHistoricalRates.sol";

/**
 * @title HistoricalRatesComputer
 * @notice A IRateComputer implementation that computes rates using historical rates.
 *
 * The rate is computed using the rate provider and the index specified in the config.
 * If highAvailability is set to true, the rate at the specified index is used if available. If the rate is not
 * available, the last available rate is used.
 * If highAvailability is set to false, the rate at the specified index is used. If the rate is not available, the
 * computation reverts.
 *
 * The default config is used when the token does not have a specific config. The default config is set during
 * construction, if provided, or with setConfig using address(0) as the token. The default config can be disabled by
 * setting the rate provider to address(0).
 */
abstract contract HistoricalRatesComputer is ERC165, IRateComputer, IHistoricalRates {
    struct Config {
        IHistoricalRates rateProvider;
        uint16 index;
        bool highAvailability;
    }

    mapping(address => Config) internal configs;

    /// @notice An event emitted when a config is initialized or uninitialized.
    /// @param token The token that is initialized. address(0) is used for the default config.
    /// @param initialized Whether the config is initialized or uninitialized.
    event ConfigInitialized(address indexed token, bool initialized);

    /**
     * @notice Emitted when a new config is set for a token.
     * @param token The token that the config is for.
     * @param config The new config.
     */
    event ConfigUpdated(address indexed token, Config config);

    /**
     * @notice An error thrown when attempting to set a new config that is the same as the current config.
     * @param token The token that the config is for.
     */
    error ConfigNotChanged(address token);

    /**
     * @notice An error thrown when trying to set a configuration, but the config is invalid.
     * @param token The token address that the config is for.
     */
    error InvalidConfig(address token);

    /**
     * @notice An error thrown when trying to compute a rate for a token that does not have a config.
     * @param token The token that does not have a config.
     */
    error MissingConfig(address token);

    /**
     * @notice An error thrown when trying to compute the rate of an invalid token.
     * @param token The token that is invalid.
     */
    error InvalidInput(address token);

    /**
     * @notice An error that is thrown when trying to revert to the default config when the token is already using the
     * default config.
     * @param token The token that is already using the default config.
     */
    error AlreadyUsingDefaultConfig(address token);

    /**
     * @notice An error thrown when a rate is not available for a token.
     * @param token The token that the rate is not available for.
     */
    error RateNotAvailable(address token);

    /**
     * @notice Constructs a new HistoricalRatesComputer instance.
     * @param defaultRateProvider The default rate provider. Use address(0) to disable the default config.
     * @param defaultIndex The default index, with 0 being the first index (newest rate).
     * @param defaultHighAvailability The default high availability setting.
     */
    constructor(IHistoricalRates defaultRateProvider, uint16 defaultIndex, bool defaultHighAvailability) {
        if (defaultRateProvider != IHistoricalRates(address(0))) {
            configs[address(0)] = Config({
                rateProvider: defaultRateProvider,
                index: defaultIndex,
                highAvailability: defaultHighAvailability
            });

            emit ConfigInitialized(address(0), true);
            emit ConfigUpdated(address(0), configs[address(0)]);
        }
    }

    /**
     * @notice Computes the rate for a token using the rate provider and index specified in the config. If the config
     * has not been set for the token, the default config is used if set. If the rate is not available, the computation
     * reverts.
     * @param token The token address.
     */
    function computeRate(address token) external view virtual override returns (uint64) {
        if (token == address(0)) {
            revert InvalidInput(token);
        }

        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        if (!config.highAvailability) {
            // We want the rate at the specific index. This will revert if the rate is not available.
            return config.rateProvider.getRateAt(token, config.index).current;
        }

        uint256 ratesCount = config.rateProvider.getRatesCount(token);
        if (ratesCount == 0) {
            // No rates available
            revert RateNotAvailable(token);
        }

        uint256 useIndex = config.index;
        if (useIndex >= ratesCount) {
            // The rate at the specific index is not available. Use the last available rate.
            useIndex = ratesCount - 1;
        }

        return config.rateProvider.getRateAt(token, useIndex).current;
    }

    /**
     * @notice Sets a new config for a token.
     * @dev Calls checkSetConfig to enforce access control.
     * @param token The token to set the config for. Use address(0) to set the default config.
     * @param newConfig The new config.
     */
    function setConfig(address token, Config calldata newConfig) external virtual {
        checkSetConfig(token);

        Config storage config = configs[token];

        if (newConfig.rateProvider == IHistoricalRates(address(0))) {
            // No rate provider specified.
            // We allow this only for the default config so that we can disable defaulting functionality.
            if (token != address(0)) {
                revert InvalidConfig(token);
            }

            if (newConfig.index != 0 || newConfig.highAvailability) {
                // Unsetting the default config, but non-zero index or high availability is set.
                revert InvalidConfig(token);
            }
        }

        if (
            config.rateProvider == newConfig.rateProvider &&
            config.index == newConfig.index &&
            config.highAvailability == newConfig.highAvailability
        ) {
            revert ConfigNotChanged(token);
        }

        if (config.rateProvider == IHistoricalRates(address(0))) {
            // Old config is unset. New config is set.
            emit ConfigInitialized(token, true);
        } else if (newConfig.rateProvider == IHistoricalRates(address(0))) {
            // Old config is set. New config is unset.
            emit ConfigInitialized(token, false);
        }

        configs[token] = newConfig;

        emit ConfigUpdated(token, newConfig);
    }

    /**
     * @notice Checks if the token is using the default config.
     * @param token The token to check.
     */
    function isUsingDefaultConfig(address token) external view virtual returns (bool) {
        if (token == address(0)) {
            // address(0) specifies the default config
            return true;
        }

        return configs[token].rateProvider == IHistoricalRates(address(0));
    }

    /**
     * @notice Reverts the config for a token to the default config.
     * @param token The token to revert the config for.
     */
    function revertToDefaultConfig(address token) external virtual {
        checkSetConfig(token);

        if (token == address(0)) {
            // Cannot revert to the default config for the default config
            revert AlreadyUsingDefaultConfig(token);
        }

        Config storage config = configs[token];
        if (config.rateProvider == IHistoricalRates(address(0))) {
            // Already using the default config
            revert AlreadyUsingDefaultConfig(token);
        }

        emit ConfigInitialized(token, false);

        configs[token] = Config({rateProvider: IHistoricalRates(address(0)), index: 0, highAvailability: false});

        emit ConfigUpdated(token, configs[token]);
    }

    /**
     * @notice Returns the config for a token, using the default config if the token does not have a specific config.
     * Reverts if the token does not have a config.
     * @param token The token address.
     */
    function getConfig(address token) external view virtual returns (Config memory config) {
        config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }
    }

    /// @inheritdoc IHistoricalRates
    function getRateAt(address token, uint256 index) external view override returns (RateLibrary.Rate memory) {
        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        return config.rateProvider.getRateAt(token, index);
    }

    /// @inheritdoc IHistoricalRates
    function getRates(address token, uint256 amount) external view override returns (RateLibrary.Rate[] memory) {
        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        return config.rateProvider.getRates(token, amount);
    }

    /// @inheritdoc IHistoricalRates
    function getRates(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view override returns (RateLibrary.Rate[] memory) {
        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        return config.rateProvider.getRates(token, amount, offset, increment);
    }

    /// @inheritdoc IHistoricalRates
    function getRatesCount(address token) external view override returns (uint256) {
        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        return config.rateProvider.getRatesCount(token);
    }

    /// @inheritdoc IHistoricalRates
    function getRatesCapacity(address token) external view override returns (uint256) {
        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        return config.rateProvider.getRatesCapacity(token);
    }

    /// @inheritdoc IHistoricalRates
    function setRatesCapacity(address token, uint256 amount) external override {
        Config memory config = getConfigOrDefault(token);
        if (config.rateProvider == IHistoricalRates(address(0))) {
            revert MissingConfig(token);
        }

        config.rateProvider.setRatesCapacity(token, amount);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IRateComputer).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function getConfigOrDefault(address token) internal view virtual returns (Config memory) {
        Config memory config = configs[token];
        if (config.rateProvider == IHistoricalRates(address(0))) {
            return configs[address(0)];
        }

        return config;
    }

    /**
     *  @notice Checks if the caller is allowed to set a new config.
     * @param token The token address.
     */
    function checkSetConfig(address token) internal view virtual;
}
