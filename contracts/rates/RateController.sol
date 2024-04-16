// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IPeriodic.sol";
import "@adrastia-oracle/adrastia-core/contracts/interfaces/IUpdateable.sol";

import "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin-v4/contracts/utils/introspection/ERC165Checker.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "./HistoricalRates.sol";
import "./IRateComputer.sol";

/// @title RateController
/// @notice A contract that periodically computes and stores rates for tokens.
/// @dev This contract is abstract because it lacks restrictions on sensitive functions. Please override checkSetConfig,
/// checkManuallyPushRate, checkSetUpdatesPaused, checkSetRatesCapacity, and checkUpdate to add restrictions.
abstract contract RateController is ERC165, HistoricalRates, IRateComputer, IUpdateable, IPeriodic {
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

    /// @notice The flag that indicates whether rate updates are paused.
    uint16 internal constant PAUSE_FLAG_MASK = 0x0000000000000001;

    /// @notice The period of the rate controller, in seconds. This is the frequency at which rates are updated.
    uint256 public immutable override period;

    /// @notice True if all rate updaters must be EOA accounts; false otherwise.
    /// @dev This is a security feature to prevent malicious contracts from updating rates.
    bool public immutable updatersMustBeEoa;

    /// @notice Maps a token to its rate configuration.
    mapping(address => RateConfig) internal rateConfigs;

    /// @notice Event emitted when a new rate is manually pushed to the rate buffer.
    /// @param token The token for which the rate was pushed.
    /// @param target The target rate.
    /// @param current The effective rate.
    /// @param timestamp The timestamp at which the rate was pushed.
    /// @param amount The amount of times the rate was pushed.
    event RatePushedManually(address indexed token, uint256 target, uint256 current, uint256 timestamp, uint256 amount);

    /// @notice Event emitted when the pause status of rate updates for a token is changed.
    /// @param token The token for which the pause status of rate updates was changed.
    /// @param areUpdatesPaused Whether rate updates are paused for the token.
    event PauseStatusChanged(address indexed token, bool areUpdatesPaused);

    /// @notice Event emitted when the rate configuration for a token is updated.
    /// @param token The token for which the rate configuration was updated.
    event RateConfigUpdated(address indexed token, RateConfig oldConfig, RateConfig newConfig);

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

    /// @notice Creates a new rate controller.
    /// @param period_ The period of the rate controller, in seconds. This is the frequency at which rates are updated.
    /// @param initialBufferCardinality_ The initial capacity of the rate buffer.
    /// @param updatersMustBeEoa_ True if all rate updaters must be EOA accounts; false otherwise.
    constructor(
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) HistoricalRates(initialBufferCardinality_) {
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

        emit RateConfigUpdated(token, oldConfig, config);

        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // We require that the buffer is initialized before allowing rate updates to occur
            initializeBuffers(token);
        }
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
    function manuallyPushRate(address token, uint64 target, uint64 current, uint256 amount) external {
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
        if (meta.maxSize == 0) {
            // Uninitialized buffer means that the rate config is missing
            // It doesn't make sense to pause updates if they can't occur in the first place
            revert MissingConfig(token);
        }

        uint16 flags = rateBufferMetadata[token].flags;

        bool currentlyPaused = (flags & PAUSE_FLAG_MASK) != 0;
        if (currentlyPaused != paused) {
            if (paused) {
                flags |= PAUSE_FLAG_MASK;
            } else {
                flags &= ~PAUSE_FLAG_MASK;
            }

            rateBufferMetadata[token].flags = flags;

            emit PauseStatusChanged(token, paused);

            onPaused(token, paused);
        } else {
            revert PauseStatusUnchanged(token, paused);
        }
    }

    /// @inheritdoc IRateComputer
    function computeRate(address token) external view virtual override returns (uint64) {
        (, uint64 newRate) = computeRateAndClamp(token);

        return newRate;
    }

    /// @inheritdoc IPeriodic
    function granularity() external view virtual override returns (uint256) {
        return 1;
    }

    /// @inheritdoc IUpdateable
    function update(bytes memory data) public virtual override returns (bool b) {
        checkUpdate();

        if (needsUpdate(data)) return performUpdate(data);

        return false;
    }

    /// @inheritdoc IUpdateable
    function needsUpdate(bytes memory data) public view virtual override returns (bool b) {
        address token = abi.decode(data, (address));

        BufferMetadata memory meta = rateBufferMetadata[token];

        // Requires that:
        //   0. The update period has elapsed.
        //   1. The buffer is initialized. We do this to prevent zero values from being pushed to the buffer.
        //   2. Updates are not paused.
        //   3. Something will change. Otherwise, updating is a waste of gas.
        return
            timeSinceLastUpdate(data) >= period &&
            meta.maxSize > 0 &&
            !_areUpdatesPaused(token) &&
            willAnythingChange(data);
    }

    /// @inheritdoc IUpdateable
    function canUpdate(bytes memory data) public view virtual override returns (bool b) {
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

    /// @notice Determines if any changes will occur in the rate buffer after a new rate is added.
    /// @dev This function is used to reduce the amount of gas used by updaters when the rate is not changing.
    /// @param data A bytes array containing the token address to be decoded.
    /// @return bool A boolean value indicating whether any changes will occur in the rate buffer.
    function willAnythingChange(bytes memory data) internal view virtual returns (bool) {
        address token = abi.decode(data, (address));

        BufferMetadata memory meta = rateBufferMetadata[token];

        // If the buffer has empty slots, they can be filled
        if (meta.size != meta.maxSize) return true;

        // All current rates in the buffer should match the next rate. Otherwise, the rate will change.
        // We don't check target rates because if the rate is capped, the current rate may never reach the target rate.
        (, uint64 nextRate) = computeRateAndClamp(token);
        RateLibrary.Rate[] memory rates = _getRates(token, meta.size, 0, 1);
        for (uint256 i = 0; i < rates.length; ++i) {
            if (rates[i].current != nextRate) return true;
        }

        return false;
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

    /// @notice Computes the rate for the given token.
    /// @dev This function calculates the rate for the specified token by summing its base rate
    /// and the weighted rates of its components. The component rates are computed using the `computeRate`
    /// function of each component and multiplied by the corresponding weight, then divided by 10,000.
    /// @param token The address of the token for which to compute the rate.
    /// @return uint64 The computed rate for the given token.
    function computeRateInternal(address token) internal view virtual returns (uint64) {
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

    function updateAndCompute(address token) internal virtual returns (uint64 target, uint64 newRate) {
        // Compute the new rate and clamp it
        (target, newRate) = computeRateAndClamp(token);
    }

    /// @notice Performs an update of the token's rate based on the provided data.
    /// @dev This function ensures that only EOAs (Externally Owned Accounts) can update the rate
    /// if `updatersMustBeEoa` is set to true. It decodes the token address from the input data, computes
    /// the new clamped rate using `computeRateAndClamp`, and then pushes the new rate to the rate buffer.
    /// @param data The input data, containing the token address to be updated.
    /// @return bool Returns true if the update is successful.
    function performUpdate(bytes memory data) internal virtual returns (bool) {
        if (updatersMustBeEoa && msg.sender != tx.origin) {
            // Only EOA can update
            revert UpdaterMustBeEoa(tx.origin, msg.sender);
        }

        address token = abi.decode(data, (address));

        // Compute the new rates and do any other necessary work
        (uint64 target, uint64 newRate) = updateAndCompute(token);

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
            emit RatePushedManually(token, target, current, block.timestamp, amount);
        }
    }

    /// @notice Called after the pause state is changed.
    /// @param token The token for which the pause state was changed.
    /// @param paused Whether rate updates are paused.
    function onPaused(address token, bool paused) internal virtual {}

    /// @notice Checks if the caller is authorized to set the configuration.
    /// @dev This function should contain the access control logic for the setConfig function.
    function checkSetConfig() internal view virtual;

    /// @notice Checks if the caller is authorized to manually push rates.
    /// @dev This function should contain the access control logic for the manuallyPushRate function.
    /// WARNING: The manuallyPushRate function is very dangerous and should only be used in emergencies. Ensure that
    /// this function is implemented correctly and that the access control logic is sufficient to prevent abuse.
    function checkManuallyPushRate() internal view virtual;

    /// @notice Checks if the caller is authorized to pause or resume updates.
    /// @dev This function should contain the access control logic for the setUpdatesPaused function.
    function checkSetUpdatesPaused() internal view virtual;

    /// @notice Checks if the caller is authorized to set the rates capacity.
    /// @dev This function should contain the access control logic for the setRatesCapacity function.
    function checkSetRatesCapacity() internal view virtual;

    /// @notice Checks if the caller is authorized to perform an update.
    /// @dev This function should contain the access control logic for the update function.
    function checkUpdate() internal view virtual;
}
