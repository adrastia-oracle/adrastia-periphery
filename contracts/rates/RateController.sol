// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IPeriodic.sol";
import "@adrastia-oracle/adrastia-core/contracts/interfaces/IUpdateable.sol";

import "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin-v4/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/security/ReentrancyGuard.sol";

import "./HistoricalRates.sol";
import "./IRateComputer.sol";
import "./controllers/hooks/IControllerPreUpdateHook.sol";
import "./controllers/hooks/IControllerPostUpdateHook.sol";

/// @title RateController
/// @notice A contract that periodically computes and stores rates for tokens.
/// @dev This contract is abstract because it lacks restrictions on sensitive functions. Please override checkSetConfig,
/// checkManuallyPushRate, checkSetUpdatesPaused, checkSetRatesCapacity, and checkUpdate to add restrictions.
abstract contract RateController is ERC165, HistoricalRates, IRateComputer, IUpdateable, IPeriodic, ReentrancyGuard {
    using SafeCast for uint256;

    struct RateConfig {
        uint64 max;
        uint64 min;
        uint64 maxIncrease;
        uint64 maxDecrease;
        uint32 maxPercentIncrease; // 10000 = 100%
        uint16 maxPercentDecrease; // 10000 = 100%
        uint64 base;
        uint16[] componentWeights; // 10000 = 100%
        IRateComputer[] components;
    }

    struct Hook {
        /**
         * @notice A flag indicating whether the hook is allowed to fail. If true, the hook can fail without reverting
         * the transaction.
         */
        bool allowHookFailure;
        /**
         * @notice The gas limit for the hook. This is used to ensure that the hook does not consume too much gas and
         * cause the transaction unintentially to fail.
         *
         * @dev This is a uint64 to save on storage costs, as the gas limit is typically a small number.
         */
        uint64 hookGasLimit;
        /**
         * @notice The address of the hook. The zero address indicates that no post-update hook is set.
         */
        address hookAddress;
    }

    enum HookType {
        PreUpdate, // preControllerUpdate is called immediately before pushing a new rate to the buffer
        PostUpdate // postControllerUpdate is called immediately after pushing a new rate to the buffer
    }

    /// @notice The precision used for change calculations. This is used to represent percentages as integers.
    uint256 public constant CHANGE_PRECISION = 10 ** 8;

    /// @notice The flag that indicates whether rate updates are paused.
    uint16 internal constant PAUSE_FLAG_MASK = 0x0000000000000001;

    /// @notice The period of the rate controller, in seconds. This is the frequency at which rates are updated.
    uint256 public immutable override period;

    /// @notice True if all rate updaters must be EOA accounts; false otherwise.
    /// @dev This is a security feature to prevent malicious contracts from updating rates.
    bool public immutable updatersMustBeEoa;

    /// @notice True if the rates returned by computeRate should be computed on-the-fly with clamping; false if the
    /// returned rates should be the same as the last pushed rates (from the buffer).
    bool public immutable computeAhead;

    /**
     * @notice Maps a hook type to its hook configuration.
     */
    mapping(uint256 => Hook) internal hooks;

    /**
     * @notice A bitfield of active hook types.
     */
    uint256 internal activeHookTypes;

    /// @notice Maps a token to its rate configuration.
    mapping(address => RateConfig) internal rateConfigs;

    /// @notice Event emitted when a new rate is manually pushed to the rate buffer.
    /// @param token The token for which the rate was pushed.
    /// @param target The target rate.
    /// @param current The effective rate.
    /// @param amount The amount of times the rate was pushed.
    /// @param timestamp The timestamp at which the rate was pushed.
    event RatePushedManually(address indexed token, uint256 target, uint256 current, uint256 amount, uint256 timestamp);

    /// @notice Event emitted when the pause status of rate updates for a token is changed.
    /// @param token The token for which the pause status of rate updates was changed.
    /// @param areUpdatesPaused Whether rate updates are paused for the token.
    /// @param timestamp The timestamp at which the pause status was changed, in seconds since the Unix epoch.
    event PauseStatusChanged(address indexed token, bool areUpdatesPaused, uint256 timestamp);

    /// @notice Event emitted when the rate configuration for a token is updated.
    /// @param token The token for which the rate configuration was updated.
    /// @param oldConfig The old rate configuration.
    /// @param newConfig The new rate configuration.
    /// @param timestamp The block timestamp at which the rate configuration was updated, in seconds since the Unix epoch.
    event RateConfigUpdated(address indexed token, RateConfig oldConfig, RateConfig newConfig, uint256 timestamp);

    /**
     * @notice An event emitted when a hook reverts, but the failure is allowed.
     *
     * @param hookType The type of the hook that failed.
     * @param hook The address of the hook that failed.
     * @param token The address of the token for which the hook failed.
     * @param reason The reason for the failure, encoded as bytes.
     * @param timestamp The block timestamp at which the hook failed, in seconds since the Unix epoch.
     */
    event HookFailed(
        uint256 indexed hookType,
        address indexed hook,
        address indexed token,
        bytes reason,
        uint256 timestamp
    );

    /**
     * @notice An event emitted when a hook is changed.
     *
     * @param caller The address of the account that changed the hook.
     * @param hookType The type of the hook that was changed.
     * @param oldHook The old hook config.
     * @param newHook The new hook config.
     * @param timestamp The block timestamp at which the hook was changed, in seconds since the Unix epoch.
     */
    event HookConfigUpdated(
        address indexed caller,
        uint256 indexed hookType,
        Hook oldHook,
        Hook newHook,
        uint256 timestamp
    );

    /**
     * @notice An event emitted when the change threshold for a token is updated.
     * @param token The token whose change threshold was updated.
     * @param oldChangeThreshold The old change threshold.
     * @param newChangeThreshold The new change threshold.
     * @param timestamp The block timestamp at which the change threshold was updated, in seconds since the Unix epoch.
     */
    event ChangeThresholdUpdated(
        address indexed token,
        uint256 oldChangeThreshold,
        uint256 newChangeThreshold,
        uint256 timestamp
    );

    /**
     * @notice An error thrown when a hook fails to execute.
     *
     * @param hookType The type of the hook that failed.
     * @param hookAddress The address of the hook that failed.
     * @param token The address of the token for which the hook failed.
     * @param reason The reason for the failure, encoded as bytes.
     */
    error HookFailedError(uint256 hookType, address hookAddress, address token, bytes reason);

    /// @notice An error that is thrown if we try to set a rate configuration with invalid parameters.
    /// @param token The token for which we tried to set the rate configuration.
    error InvalidConfig(address token);

    /// @notice An error that is thrown if we require a rate configuration that has not been set.
    /// @param token The token for which we require a rate configuration.
    error MissingConfig(address token);

    /// @notice An error that is thrown if we require that all rate updaters be EOA accounts, but the updater is not.
    /// @param txOrigin The address of the transaction origin.
    /// @param updater The address of the rate updater.
    error UpdaterMustBeEoa(address txOrigin, address updater);

    /// @notice An error that is thrown when we try to change the pause state for a token, but the current pause state
    /// is the same as the new pause state.
    /// @dev This error is thrown to make it easier to notice when we try to change the pause state but nothing changes.
    /// This is useful in preventing human error, in the case that we expect a change when there is none.
    /// @param token The token for which we tried to change the pause state.
    /// @param paused The pause state we tried to set.
    error PauseStatusUnchanged(address token, bool paused);

    /**
     * @notice An error thrown when attempting to set a hook, but the hook did not change.
     *
     * @param hookType The type of the hook that was not changed.
     */
    error HookConfigUnchanged(uint256 hookType);

    /**
     * @notice An error thrown when the hook configuration is invalid.
     */
    error InvalidHookConfig(uint256 hookType);

    /**
     * @notice An error thrown when a hook does not support the expected interface.
     *
     * @param hookType The type of the hook that does not support the interface.
     * @param hookAddress The address of the hook that does not support the interface.
     * @param interfaceId The interface ID that the hook is expected to support.
     */
    error HookDoesntSupportInterface(uint256 hookType, address hookAddress, bytes4 interfaceId);

    /**
     * @notice An error thrown when an invalid hook type is provided.
     */
    error InvalidHookType(uint256 hookType);

    /// @notice Creates a new rate controller.
    /// @param computeAhead_ True if the rates returned by computeRate should be computed on-the-fly with clamping;
    /// false if the returned rates should be the same as the last pushed rates (from the buffer).
    /// @param period_ The period of the rate controller, in seconds. This is the frequency at which rates are updated.
    /// @param initialBufferCardinality_ The initial capacity of the rate buffer.
    /// @param updatersMustBeEoa_ True if all rate updaters must be EOA accounts; false otherwise.
    constructor(
        bool computeAhead_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) HistoricalRates(initialBufferCardinality_) {
        computeAhead = computeAhead_;
        period = period_;
        updatersMustBeEoa = updatersMustBeEoa_;
    }

    /// @notice Returns the rate configuration for a token.
    /// @param token The token for which to get the rate configuration.
    /// @return The rate configuration for the token.
    function getConfig(address token) external view virtual returns (RateConfig memory) {
        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            revert MissingConfig(token);
        }

        return rateConfigs[token];
    }

    /// @notice Sets the rate configuration for a token. This can only be called by the rate admin.
    /// @param token The token for which to set the rate configuration.
    /// @param config The rate configuration to set.
    function setConfig(address token, RateConfig calldata config) external virtual {
        checkSetConfig();

        if (config.components.length != config.componentWeights.length) {
            revert InvalidConfig(token);
        }

        if (config.maxPercentDecrease > 10000) {
            // The maximum percent decrease must be less than or equal to 100%.
            revert InvalidConfig(token);
        }

        if (config.max < config.min) {
            // The maximum rate must be greater than or equal to the minimum rate.
            revert InvalidConfig(token);
        }

        // Check for invalid or duplicate components
        for (uint256 i = 0; i < config.componentWeights.length; ++i) {
            if (
                address(config.components[i]) == address(0) ||
                !ERC165Checker.supportsInterface(address(config.components[i]), type(IRateComputer).interfaceId)
            ) {
                revert InvalidConfig(token);
            }

            if (config.componentWeights[i] == 0) {
                // The component weight cannot be zero. Such a scenario would be a waste of gas and likely to be a
                // human error in setting the config.
                revert InvalidConfig(token);
            }

            // Check for duplicate components
            for (uint256 j = i + 1; j < config.componentWeights.length; ++j) {
                if (config.components[i] == config.components[j]) {
                    // The same component cannot be used more than once.
                    revert InvalidConfig(token);
                }
            }
        }

        RateConfig memory oldConfig = rateConfigs[token];

        rateConfigs[token] = config;

        emit RateConfigUpdated(token, oldConfig, config, block.timestamp);

        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // We require that the buffer is initialized before allowing rate updates to occur
            initializeBuffers(token);
        }
    }

    /**
     * @notice Gets the hook configuration for a specific hook type.
     *
     * @param hookType The type of the hook to retrieve the configuration for.
     *
     * @return The configuration of the hook, including whether it allows failure, the gas limit for the hook, and the
     * address of the hook.
     */
    function getHookConfig(uint8 hookType) external view virtual returns (Hook memory) {
        return hooks[hookType];
    }

    /**
     * @notice Sets the hook configuration for a specific hook type.
     *
     * @dev To uninstall a hook, all fields of the hook config must be set to zero/false.
     *
     * @param hookType The type of the hook to set the configuration for.
     * @param hookConfig The configuration of the hook to set, including whether it allows failure, the gas limit for
     * the hook, and the address of the hook.
     */
    function setHookConfig(uint8 hookType, Hook calldata hookConfig) external virtual {
        checkSetHookConfig();

        if (!_isHookTypeValid(hookType)) {
            // The hook type is invalid. Revert to help the user be aware of this.
            revert InvalidHookType(hookType);
        }

        if (address(hookConfig.hookAddress) == address(0)) {
            // hookGasLimit must be 0 and allowHookFailure must be false if the hookAddress is zero
            // This is to prevent accidental misconfiguration
            if (hookConfig.hookGasLimit != 0 || hookConfig.allowHookFailure) {
                revert InvalidHookConfig(hookType);
            }
        } else {
            // We have an update hook. Ensure that hookGasLimit is not zero. If so, it's likely a misconfiguration.
            if (hookConfig.hookGasLimit == 0) {
                revert InvalidHookConfig(hookType);
            }
        }

        Hook memory oldHook = _getHook(hookType);

        if (
            oldHook.allowHookFailure == hookConfig.allowHookFailure &&
            oldHook.hookGasLimit == hookConfig.hookGasLimit &&
            oldHook.hookAddress == hookConfig.hookAddress
        ) {
            // The hook did not change. Revert to help the user be aware of this.
            revert HookConfigUnchanged(hookType);
        }

        if (address(hookConfig.hookAddress) != address(0)) {
            // Ensure that the hook supports the expected interface
            bytes4 expectedInterfaceId = _getHookInterfaceId(hookType);
            if (!ERC165Checker.supportsInterface(hookConfig.hookAddress, expectedInterfaceId)) {
                revert HookDoesntSupportInterface(hookType, hookConfig.hookAddress, expectedInterfaceId);
            }
        }

        if (address(hookConfig.hookAddress) != address(0)) {
            // We are setting a new hook, so we need to add it to the active hook types
            activeHookTypes |= (uint256(1) << hookType);
        } else {
            // We are removing a hook, so we need to remove it from the active hook types
            activeHookTypes &= ~(uint256(1) << hookType);
        }

        hooks[hookType] = hookConfig;

        emit HookConfigUpdated(hookType, msg.sender, oldHook, hookConfig, block.timestamp);
    }

    /// @notice Manually pushes new rates for a token, bypassing the update logic, clamp logic, pause logic, and
    /// other restrictions.
    /// @dev WARNING: This function is very powerful and should only be used in emergencies. It is intended to be used
    /// to manually push rates when the rate controller is in a bad state. It should not be used to push rates
    /// regularly. Make sure to lock it down with the highest level of security.
    /// @param token The token for which to push rates.
    /// @param target The target rate to push.
    /// @param current The current rate to push.
    /// @param amount The number of times to push the rate.
    function manuallyPushRate(address token, uint64 target, uint64 current, uint256 amount) external nonReentrant {
        checkManuallyPushRate();

        _manuallyPushRate(token, target, current, amount);
    }

    /// @notice Determines whether rate updates are paused for a token.
    /// @param token The token for which to determine whether rate updates are paused.
    /// @return Whether rate updates are paused for the given token.
    function areUpdatesPaused(address token) external view virtual returns (bool) {
        return _areUpdatesPaused(token);
    }

    /// @notice Changes the pause state of rate updates for a token. This can only be called by the update pause admin.
    /// @param token The token for which to change the pause state.
    /// @param paused Whether rate updates should be paused.
    function setUpdatesPaused(address token, bool paused) external virtual {
        checkSetUpdatesPaused();

        BufferMetadata storage meta = rateBufferMetadata[token];

        uint16 flags = meta.flags;

        bool currentlyPaused = (flags & PAUSE_FLAG_MASK) != 0;
        if (currentlyPaused != paused) {
            if (paused) {
                flags |= PAUSE_FLAG_MASK;
            } else {
                flags &= ~PAUSE_FLAG_MASK;
            }

            meta.flags = flags;

            emit PauseStatusChanged(token, paused, block.timestamp);

            onPaused(token, paused);
        } else {
            revert PauseStatusUnchanged(token, paused);
        }
    }

    /**
     * @notice Sets the change threshold for the specified token. When the rate changes by more than the threshold, an
     *   update is triggered, assuming the period has been surpassed.
     * @param token The token to set the change threshold for.
     * @param changeThreshold Percent change that allows an update to make place, respresented as the numerator of a
     *   fraction with a denominator of `CHANGE_PRECISION`. Ex: With `CHANGE_PRECISION` of 1e8, a change threshold of
     *   2% would be represented as 2e6 (2000000).
     */
    function setChangeThreshold(address token, uint32 changeThreshold) external virtual {
        checkSetChangeThreshold();

        BufferMetadata storage metadata = rateBufferMetadata[token];

        uint256 oldChangeThreshold = metadata.changeThreshold;

        if (oldChangeThreshold != changeThreshold) {
            metadata.changeThreshold = changeThreshold;

            emit ChangeThresholdUpdated(token, oldChangeThreshold, changeThreshold, block.timestamp);
        }
    }

    /**
     * @notice Gets the change threshold for the specified token.
     * @param token The token to get the change threshold for.
     * @return uint32 Percent change that allows an update to make place, respresented as the numerator of a
     *   fraction with a denominator of `CHANGE_PRECISION`. Ex: With `CHANGE_PRECISION` of 1e8, a change threshold of
     *   2% would be represented as 2e6 (2000000).
     */
    function getChangeThreshold(address token) external view virtual returns (uint32) {
        return rateBufferMetadata[token].changeThreshold;
    }

    /// @notice Computes the rate for a token. If computeAhead is true, the rate is computed on-the-fly with clamping;
    /// otherwise, the rate is the same as the last pushed rate (from the buffer).
    /// @param token The address of the token to compute the rate for.
    /// @return rate The rate for the token.
    function computeRate(address token) external view virtual override returns (uint64) {
        if (computeAhead) {
            (, uint64 newRate) = computeRateAndClamp(token);

            return newRate;
        } else {
            BufferMetadata storage meta = rateBufferMetadata[token];
            if (meta.size == 0) {
                // We've never computed a rate, so revert.
                revert InsufficientData(token, 0, 1);
            }

            return getLatestRate(token).current;
        }
    }

    /// @inheritdoc IPeriodic
    function granularity() external view virtual override returns (uint256) {
        return 1;
    }

    /// @inheritdoc IUpdateable
    function update(bytes memory data) public virtual override nonReentrant returns (bool b) {
        checkUpdate();

        (bool needsUpdate_, bool nextRateComputed, uint64 targetRate, uint64 nextRate) = _needsUpdate(data);
        if (needsUpdate_) {
            return performUpdate(data, nextRateComputed, targetRate, nextRate);
        }

        return false;
    }

    /// @inheritdoc IUpdateable
    function needsUpdate(bytes memory data) public view virtual override returns (bool b) {
        (b, , , ) = _needsUpdate(data);
    }

    function _needsUpdate(
        bytes memory data
    ) internal view virtual returns (bool b, bool nextRateComputed, uint64 targetRate, uint64 nextRate) {
        address token = abi.decode(data, (address));

        BufferMetadata memory meta = rateBufferMetadata[token];

        // Requires that:
        //   0. The update period has elapsed.
        //   1. The buffer is initialized. We do this to prevent zero values from being pushed to the buffer.
        //   2. Updates are not paused.
        //   3. Something will change. Otherwise, updating is a waste of gas.

        if (!(timeSinceLastUpdate(data) >= period) || !(meta.maxSize > 0) || _areUpdatesPaused(token)) {
            // If the update period has not elapsed, the buffer is not initialized, or updates are paused, we cannot
            // update.
            return (false, false, 0, 0);
        }

        // Now we check if anything will change
        (b, nextRateComputed, targetRate, nextRate) = willAnythingChange(data);
    }

    /**
     * @notice Determines if the next rate can be computed for a token. A revert indicates that the next rate cannot be
     * computed.
     * @param data The update data, containing the token address.
     * @return True if the next rate can be computed; false otherwise.
     */
    function canComputeNextRate(bytes memory data) public view virtual returns (bool) {
        address token = abi.decode(data, (address));

        computeRateInternal(token);

        return true;
    }

    /// @inheritdoc IUpdateable
    function canUpdate(bytes memory data) public view virtual override returns (bool b) {
        (bool callSuccess, bytes memory callReturn) = address(this).staticcall(
            abi.encodeWithSelector(this.canComputeNextRate.selector, data)
        );
        if (!callSuccess) {
            // Call reverted. We can't compute the next rate.
            return false;
        } else {
            // Call succeeded. Let's check the return value
            bool result = abi.decode(callReturn, (bool));
            if (!result) {
                // We can't compute the next rate.
                return false;
            }
        }

        return
            // Can only update if the update is needed
            needsUpdate(data) &&
            // Can only update if the sender is an EOA or the contract allows EOA updates
            (!updatersMustBeEoa || msg.sender == tx.origin);
    }

    /// @inheritdoc IUpdateable
    function lastUpdateTime(bytes memory data) public view virtual override returns (uint256) {
        address token = abi.decode(data, (address));

        return getLatestRate(token).timestamp;
    }

    /// @inheritdoc IUpdateable
    function timeSinceLastUpdate(bytes memory data) public view virtual override returns (uint256) {
        return block.timestamp - lastUpdateTime(data);
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IHistoricalRates).interfaceId ||
            interfaceId == type(IRateComputer).interfaceId ||
            interfaceId == type(IUpdateable).interfaceId ||
            interfaceId == type(IPeriodic).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev Internal function to set the capacity of the rate buffer for a token. Only callable by the admin because the
     * updating logic is O(n) on the capacity. Only callable when the rate config is set.
     * @param token The token for which to set the new capacity.
     * @param amount The new capacity of rates for the token. Must be greater than the current capacity, but
     * less than 256.
     */
    function _setRatesCapacity(address token, uint256 amount) internal virtual override {
        checkSetRatesCapacity();

        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Buffer is not initialized yet
            // Buffer can only be initialized when the rate config is set
            revert MissingConfig(token);
        }

        super._setRatesCapacity(token, amount);
    }

    /// @notice Determines if rate updates are paused for a token.
    /// @return bool A boolean value indicating whether rate updates are paused for the given token.
    function _areUpdatesPaused(address token) internal view virtual returns (bool) {
        return (rateBufferMetadata[token].flags & PAUSE_FLAG_MASK) != 0;
    }

    /// @notice Determines if there's enough of a change in the rate to trigger an update.
    /// @param data A bytes array containing the token address to be decoded.
    /// @return willChange A boolean value indicating whether there's enough of a change in the rate to trigger an update.
    /// @return nextRateComputed A boolean value indicating whether the next rate was computed.
    /// @return targetRate The target rate for the token, if it was computed.
    /// @return nextRate The next rate for the token, if it was computed.
    function willAnythingChange(
        bytes memory data
    ) internal view virtual returns (bool willChange, bool nextRateComputed, uint64 targetRate, uint64 nextRate) {
        address token = abi.decode(data, (address));

        BufferMetadata memory meta = rateBufferMetadata[token];

        // No rates in the buffer, so the rate will change.
        if (meta.size == 0) return (true, false, 0, 0);

        if (meta.changeThreshold == 0) {
            // If the change threshold is zero, we always signal something will change.
            return (true, false, 0, 0);
        }

        uint256 lastRate = _getRates(token, 1, 0, 1)[0].current;
        (targetRate, nextRate) = computeRateAndClamp(token);

        nextRateComputed = true;

        willChange = changeThresholdSurpassed(lastRate, nextRate, meta.changeThreshold);
    }

    /// @notice Gets the latest rate for a token. If the buffer is empty, returns a zero rate.
    /// @param token The token to get the latest rate for.
    /// @return The latest rate for the token, or a zero rate if the buffer is empty.
    function getLatestRate(address token) internal view virtual returns (RateLibrary.Rate memory) {
        BufferMetadata storage meta = rateBufferMetadata[token];

        if (meta.size == 0) {
            // If the buffer is empty, return the default (zero) rate
            return RateLibrary.Rate({target: 0, current: 0, timestamp: 0});
        }

        return rateBuffers[token][meta.end];
    }

    /// @notice Computes the target rate for the given token (without clamping).
    /// @dev This function calculates the rate for the specified token by summing its base rate
    /// and the weighted rates of its components. The component rates are computed using the `computeRate`
    /// function of each component and multiplied by the corresponding weight, then divided by 10,000.
    /// @param token The address of the token for which to compute the rate.
    /// @return uint64 The computed rate for the given token.
    function computeRateInternal(address token) internal view virtual returns (uint64) {
        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Uninitialized buffer means that the rate config is missing. Don't return a rate if the config is missing.
            revert MissingConfig(token);
        }

        RateConfig memory config = rateConfigs[token];

        uint256 componentRateNumerator;

        for (uint256 i = 0; i < config.componentWeights.length; ++i) {
            componentRateNumerator += uint256(config.components[i].computeRate(token)) * config.componentWeights[i];
        }

        uint256 computedRate = uint256(config.base) + (componentRateNumerator / 10000);
        if (computedRate > type(uint64).max) {
            // The computed rate is higher than the maximum uint64 value, so we return the maximum value
            // It's okay to return the maximum value because the rate will be clamped later and the max possible rate is
            // the maximum uint64 value.
            return type(uint64).max;
        }

        return uint64(computedRate); // Safe cast because we checked that the computed rate is less than the maximum
    }

    /// @notice Computes the target rate and clamps it based on the specified token's rate configuration.
    /// @dev This function calculates the target rate by calling `computeRateInternal`. It then clamps the new rate
    /// to ensure it is within the specified bounds for maximum constant and percentage increases or decreases.
    /// This helps to prevent sudden or extreme rate fluctuations.
    /// @param token The address of the token for which to compute the clamped rate.
    /// @return target The computed target rate for the given token.
    /// @return newRate The clamped rate for the given token, taking into account the maximum increase and decrease
    /// constraints.
    function computeRateAndClamp(address token) internal view virtual returns (uint64 target, uint64 newRate) {
        // Compute the target rate
        target = computeRateInternal(token);
        // Clamp it
        newRate = clamp(token, target);
    }

    /// @notice Clamps a rate based on the specified token's rate configuration, with respect to the provided last rate
    ///   if clampChange is true.
    /// @dev Clamps the new rate to ensure it is within the specified bounds for maximum constant and percentage
    /// increases or decreases. This helps to prevent sudden or extreme rate fluctuations.
    /// @param token The address of the token for which to compute the clamped rate.
    /// @param target The computed target rate for the given token.
    /// @param clampChange Whether to clamp the rate change. If false, only min and max are used.
    /// @param last The last rate for the given token. Ignored if clampChange is false.
    /// @return newRate The clamped rate for the given token, taking into account the maximum increase and decrease
    /// constraints.
    function clampWrtLast(
        address token,
        uint64 target,
        bool clampChange,
        uint64 last
    ) internal view virtual returns (uint64 newRate) {
        newRate = target;

        RateConfig memory config = rateConfigs[token];

        // Clamp the rate to the minimum and maximum rates
        // We do this before clamping the rate to the maximum constant and percentage increases or decreases because
        // we don't want a change in the minimum or maximum rate to cause a sudden change in the rate.
        if (newRate < config.min) {
            // The new rate is too low, so we change it to the minimum rate
            newRate = config.min;
        } else if (newRate > config.max) {
            // The new rate is too high, so we change it to the maximum rate
            newRate = config.max;
        }

        if (clampChange) {
            // We have a previous rate, so let's make sure we don't change it too much
            if (newRate > last) {
                // Clamp the rate to the maximum constant increase
                if (newRate - last > config.maxIncrease) {
                    // The new rate is too high, so we change it by the maximum increase
                    newRate = last + config.maxIncrease;
                }

                if (last == 0 && config.maxPercentIncrease > 0) {
                    // If the last rate was zero, we don't want to clamp the rate to the maximum percentage increase
                    // because that would prevent the rate from ever increasing. Instead, we clamp it to the maximum
                    // constant increase, without taking into account the maximum percentage increase.
                    return newRate;
                }
                // Clamp the rate to the maximum percentage increase
                uint256 maxIncreaseAbsolute = (uint256(last) * config.maxPercentIncrease) / 10000;
                if (newRate - last > maxIncreaseAbsolute) {
                    // The new rate is too high, so we change it by the maximum percentage increase
                    newRate = last + uint64(maxIncreaseAbsolute);
                }
            } else if (newRate < last) {
                // Clamp the rate to the maximum constant decrease
                if (last - newRate > config.maxDecrease) {
                    // The new rate is too low, so we change it by the maximum decrease
                    newRate = last - config.maxDecrease;
                }

                // Clamp the rate to the maximum percentage decrease
                uint256 maxDecreaseAbsolute = (uint256(last) * config.maxPercentDecrease) / 10000;
                if (last - newRate > maxDecreaseAbsolute) {
                    // The new rate is too low, so we change it by the maximum percentage decrease
                    newRate = last - uint64(maxDecreaseAbsolute);
                }
            }
        }
    }

    /// @notice Clamps a rate based on the specified token's rate configuration.
    /// @dev Clamps the new rate to ensure it is within the specified bounds for maximum constant and percentage
    /// increases or decreases. This helps to prevent sudden or extreme rate fluctuations.
    /// @param token The address of the token for which to compute the clamped rate.
    /// @param target The computed target rate for the given token.
    /// @return newRate The clamped rate for the given token, taking into account the maximum increase and decrease
    /// constraints.
    function clamp(address token, uint64 target) internal view virtual returns (uint64 newRate) {
        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.size > 0) {
            // We have a previous rate, so let's make sure we don't change it too much
            uint64 last = rateBuffers[token][meta.end].current;

            return clampWrtLast(token, target, true, last);
        } else {
            // We don't have a previous rate, so we don't need to clamp the rate change
            return clampWrtLast(token, target, false, 0);
        }
    }

    function updateAndCompute(
        address token,
        bool nextRateComputed,
        uint64 targetRate,
        uint64 nextRate
    ) internal virtual returns (uint64 target, uint64 newRate) {
        if (nextRateComputed) {
            // The target and new rate was already computed, so we can just return it
            target = targetRate;
            newRate = nextRate;
        } else {
            // Compute the new rate and clamp it
            (target, newRate) = computeRateAndClamp(token);
        }
    }

    /// @notice Performs an update of the token's rate based on the provided data.
    /// @dev This function ensures that only EOAs (Externally Owned Accounts) can update the rate
    /// if `updatersMustBeEoa` is set to true. It decodes the token address from the input data, computes
    /// the new clamped rate using `computeRateAndClamp`, and then pushes the new rate to the rate buffer.
    /// @param data The input data, containing the token address to be updated.
    /// @param nextRateComputed A boolean indicating whether the next rate was computed.
    /// @param nextRate The next rate that was computed for the token.
    /// @return bool Returns true if the update is successful.
    function performUpdate(
        bytes memory data,
        bool nextRateComputed,
        uint64 targetRate,
        uint64 nextRate
    ) internal virtual returns (bool) {
        if (updatersMustBeEoa && msg.sender != tx.origin) {
            // Only EOA can update
            revert UpdaterMustBeEoa(tx.origin, msg.sender);
        }

        address token = abi.decode(data, (address));

        // Compute the new rates and do any other necessary work
        (uint64 target, uint64 newRate) = updateAndCompute(token, nextRateComputed, targetRate, nextRate);

        // Push the new rate
        push(token, RateLibrary.Rate({target: target, current: newRate, timestamp: uint32(block.timestamp)}));

        return true;
    }

    function _manuallyPushRate(address token, uint64 target, uint64 current, uint256 amount) internal virtual {
        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Uninitialized buffer means that the rate config is missing
            revert MissingConfig(token);
        }

        // Note: We don't check the pause status here because we want to allow rate updates to be manually pushed even
        // if rate updates are paused.

        RateLibrary.Rate memory rate = RateLibrary.Rate({
            target: target,
            current: current,
            timestamp: uint32(block.timestamp)
        });

        for (uint256 i = 0; i < amount; ++i) {
            push(token, rate);
        }

        if (amount > 0) {
            emit RatePushedManually(token, target, current, amount, block.timestamp);
        }
    }

    function _isHookTypeValid(uint256 hookType) internal pure virtual returns (bool) {
        return hookType == uint256(HookType.PreUpdate) || hookType == uint256(HookType.PostUpdate);
    }

    function _getHookInterfaceId(uint256 hookType) internal pure virtual returns (bytes4) {
        if (hookType == uint256(HookType.PreUpdate)) {
            return type(IControllerPreUpdateHook).interfaceId;
        } else if (hookType == uint256(HookType.PostUpdate)) {
            return type(IControllerPostUpdateHook).interfaceId;
        } else {
            revert InvalidHookType(hookType);
        }
    }

    function _isHookSet(uint256 activeHooks, uint256 hookType) internal view virtual returns (bool) {
        return (activeHooks & (uint256(1) << hookType)) != 0;
    }

    function _getHook(uint256 hookType) internal view virtual returns (Hook memory) {
        return hooks[hookType];
    }

    function push(address token, RateLibrary.Rate memory rate) internal virtual override {
        uint256 activeHooks = activeHookTypes;

        if (_isHookSet(activeHooks, uint256(HookType.PreUpdate))) {
            Hook memory preUpdateHook = _getHook(uint256(HookType.PreUpdate));

            (bool success, bytes memory returnData) = preUpdateHook.hookAddress.call{gas: preUpdateHook.hookGasLimit}(
                abi.encodeWithSelector(IControllerPreUpdateHook.onPreControllerUpdate.selector, token, rate)
            );

            if (!success) {
                if (preUpdateHook.allowHookFailure) {
                    // The hook failed, but we allow it to fail
                    emit HookFailed(
                        uint256(HookType.PreUpdate),
                        preUpdateHook.hookAddress,
                        token,
                        returnData,
                        block.timestamp
                    );
                } else {
                    // The hook failed, and we do not allow it to fail
                    revert HookFailedError(uint256(HookType.PreUpdate), preUpdateHook.hookAddress, token, returnData);
                }
            }
        }

        super.push(token, rate);

        if (_isHookSet(activeHooks, uint256(HookType.PostUpdate))) {
            Hook memory postUpdateHook = _getHook(uint256(HookType.PostUpdate));

            (bool success, bytes memory returnData) = postUpdateHook.hookAddress.call{gas: postUpdateHook.hookGasLimit}(
                abi.encodeWithSelector(IControllerPostUpdateHook.onPostControllerUpdate.selector, token, rate)
            );

            if (!success) {
                if (postUpdateHook.allowHookFailure) {
                    // The hook failed, but we allow it to fail
                    emit HookFailed(
                        uint256(HookType.PostUpdate),
                        postUpdateHook.hookAddress,
                        token,
                        returnData,
                        block.timestamp
                    );
                } else {
                    // The hook failed, and we do not allow it to fail
                    revert HookFailedError(uint256(HookType.PostUpdate), postUpdateHook.hookAddress, token, returnData);
                }
            }
        }
    }

    /// @dev Taken from adrastia-core/contracts/accumulators/AbstractAccumulator.
    /// @custom:todo Add this to a library upstream.
    function calculateChange(uint256 a, uint256 b) internal view virtual returns (uint256 change, bool isInfinite) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        // a >= b

        if (a == 0) {
            // a == b == 0 (since a >= b), therefore no change
            return (0, false);
        } else if (b == 0) {
            // (a > 0 && b == 0) => change threshold passed
            // Zero to non-zero always returns true
            return (0, true);
        }

        unchecked {
            uint256 delta = a - b; // a >= b, therefore no underflow
            uint256 preciseDelta = delta * CHANGE_PRECISION;

            // If the delta is so large that multiplying by CHANGE_PRECISION overflows, we assume that
            // the change threshold has been surpassed.
            // If our assumption is incorrect, the accumulator will be extra-up-to-date, which won't
            // really break anything, but will cost more gas in keeping this accumulator updated.
            if (preciseDelta < delta) return (0, true);

            change = preciseDelta / b;
            isInfinite = false;
        }
    }

    /// @dev Taken from adrastia-core/contracts/accumulators/AbstractAccumulator.
    /// @custom:todo Add this to a library upstream.
    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 changeThreshold
    ) internal view virtual returns (bool) {
        (uint256 change, bool isInfinite) = calculateChange(a, b);

        return isInfinite || change >= changeThreshold;
    }

    /// @notice Called after the pause state is changed.
    /// @param token The token for which the pause state was changed.
    /// @param paused Whether rate updates are paused.
    function onPaused(address token, bool paused) internal virtual {}

    /// @notice Checks if the caller is authorized to set the configuration.
    /// @dev This function should contain the access control logic for the setConfig function.
    function checkSetConfig() internal view virtual;

    /// @notice Checks if the caller is authorized to set the hook configuration.
    /// @dev This function should contain the access control logic for the setHookConfig function.
    function checkSetHookConfig() internal view virtual;

    /// @notice Checks if the caller is authorized to manually push rates.
    /// @dev This function should contain the access control logic for the manuallyPushRate function.
    /// WARNING: The manuallyPushRate function is very dangerous and should only be used in emergencies. Ensure that
    /// this function is implemented correctly and that the access control logic is sufficient to prevent abuse.
    function checkManuallyPushRate() internal view virtual;

    /// @notice Checks if the caller is authorized to pause or resume updates.
    /// @dev This function should contain the access control logic for the setUpdatesPaused function.
    function checkSetUpdatesPaused() internal view virtual;

    /// @notice Checks if the sender has the required role to set the change threshold.
    /// @dev This function should contain the access control logic for the setChangeThreshold function.
    function checkSetChangeThreshold() internal view virtual;

    /// @notice Checks if the caller is authorized to set the rates capacity.
    /// @dev This function should contain the access control logic for the setRatesCapacity function.
    function checkSetRatesCapacity() internal view virtual;

    /// @notice Checks if the caller is authorized to perform an update.
    /// @dev This function should contain the access control logic for the update function.
    function checkUpdate() internal view virtual;
}
