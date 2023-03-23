//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IPeriodic.sol";
import "@adrastia-oracle/adrastia-core/contracts/interfaces/IUpdateable.sol";

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "./IHistoricalRates.sol";
import "./IRateComputer.sol";
import "../access/Roles.sol";

/// @title RateController
/// @notice A contract that periodically computes and stores rates for tokens.
contract RateController is IHistoricalRates, IRateComputer, IUpdateable, IPeriodic, AccessControlEnumerable {
    using SafeCast for uint256;

    struct BufferMetadata {
        uint8 start;
        uint8 end;
        uint8 size;
        uint8 maxSize;
        bool pauseUpdates;
    }

    struct RateConfig {
        uint64 maxIncrease;
        uint64 maxDecrease;
        uint64 base;
        uint16[] componentWeights; // 10000 = 100%
        IRateComputer[] components;
    }

    /// @notice The period of the rate controller, in seconds. This is the frequency at which rates are updated.
    uint256 public immutable override period;

    /// @notice Maps a token to its metadata.
    mapping(address => BufferMetadata) internal rateBufferMetadata;

    /// @notice Maps a token to its rate configuration.
    mapping(address => RateConfig) internal rateConfigs;

    /// @notice Maps a token to a buffer of rates.
    mapping(address => RateLibrary.Rate[]) internal rateBuffers;

    /// @notice The initial capacity of the rate buffer.
    uint8 internal immutable initialBufferCardinality;

    /// @notice Event emitted when a rate buffer's capacity is increased past the initial capacity.
    /// @dev Buffer initialization does not emit an event.
    /// @param token The token for which the rate buffer's capacity was increased.
    /// @param oldCapacity The previous capacity of the rate buffer.
    /// @param newCapacity The new capacity of the rate buffer.
    event RatesCapacityIncreased(address indexed token, uint256 oldCapacity, uint256 newCapacity);

    /// @notice Event emitted when a rate buffer's capacity is initialized.
    /// @param token The token for which the rate buffer's capacity was initialized.
    /// @param capacity The capacity of the rate buffer.
    event RatesCapacityInitialized(address indexed token, uint256 capacity);

    /// @notice Event emitted when a new rate is pushed to the rate buffer.
    /// @param token The token for which the rate was pushed.
    /// @param target The target rate.
    /// @param current The current rate, which may be different from the target rate if the rate change is capped.
    /// @param timestamp The timestamp at which the rate was pushed.
    event RateUpdated(address indexed token, uint256 target, uint256 current, uint256 timestamp);

    /// @notice An error that is thrown if we try to initialize a rate buffer that has already been initialized.
    /// @param token The token for which we tried to initialize the rate buffer.
    error BufferAlreadyInitialized(address token);

    /// @notice An error that is thrown if we're missing a required role.
    /// @dev A different error is thrown when using the `onlyRole` modifier.
    /// @param requiredRole The role (hash) that we're missing.
    error MissingRole(bytes32 requiredRole);

    /// @notice An error that is thrown if we try to retrieve a rate at an invalid index.
    /// @param token The token for which we tried to retrieve the rate.
    /// @param index The index of the rate that we tried to retrieve.
    /// @param size The size of the rate buffer.
    error InvalidIndex(address token, uint256 index, uint256 size);

    /// @notice An error that is thrown if we try to decrease the capacity of a rate buffer.
    /// @param token The token for which we tried to decrease the capacity of the rate buffer.
    /// @param amount The capacity that we tried to decrease the rate buffer to.
    /// @param currentCapacity The current capacity of the rate buffer.
    error CapacityCannotBeDecreased(address token, uint256 amount, uint256 currentCapacity);

    /// @notice An error that is thrown if we try to increase the capacity of a rate buffer past the maximum capacity.
    /// @param token The token for which we tried to increase the capacity of the rate buffer.
    /// @param amount The capacity that we tried to increase the rate buffer to.
    /// @param maxCapacity The maximum capacity of the rate buffer.
    error CapacityTooLarge(address token, uint256 amount, uint256 maxCapacity);

    /// @notice An error that is thrown if we try to retrieve more rates than are available in the rate buffer.
    /// @param token The token for which we tried to retrieve the rates.
    /// @param size The size of the rate buffer.
    /// @param minSizeRequired The minimum size of the rate buffer that we require.
    error InsufficientData(address token, uint256 size, uint256 minSizeRequired);

    /// @notice An error that is thrown if we try to set a rate configuration with invalid parameters.
    /// @param token The token for which we tried to set the rate configuration.
    error InvalidConfig(address token);

    /// @notice An error that is thrown if we try to initialize a rate buffer without a rate configuration.
    /// @param token The token for which we tried to initialize the rate buffer.
    error MissingConfig(address token);

    /// @notice Creates a new rate controller.
    /// @param period_ The period of the rate controller, in seconds. This is the frequency at which rates are updated.
    /// @param initialBufferCardinality_ The initial capacity of the rate buffer.
    constructor(uint32 period_, uint8 initialBufferCardinality_) {
        initializeRoles();

        period = period_;
        initialBufferCardinality = initialBufferCardinality_;
    }

    /**
     * @notice Modifier to make a function callable only by a certain role. In
     * addition to checking the sender's role, `address(0)` 's role is also
     * considered. Granting a role to `address(0)` is equivalent to enabling
     * this role for everyone.
     */
    modifier onlyRoleOrOpenRole(bytes32 role) {
        if (!hasRole(role, address(0)) && !hasRole(role, msg.sender)) {
            revert MissingRole(role);
        }
        _;
    }

    /// @notice Sets the rate configuration for a token. This can only be called by the rate admin.
    /// @param token The token for which to set the rate configuration.
    /// @param config The rate configuration to set.
    function setConfig(address token, RateConfig calldata config) external virtual onlyRole(Roles.RATE_ADMIN) {
        if (config.components.length != config.componentWeights.length) {
            revert InvalidConfig(token);
        }

        // Ensure that the sum of the component weights less than or equal to 10000 (100%)
        // Notice: It's possible to have the sum of the component weights be less than 10000 (100%). It's also possible
        // to have the component weights be 100% and the base rate be non-zero. This is intentional because we don't
        // have a hard cap on the rate.
        uint256 sum = 0;
        for (uint256 i = 0; i < config.componentWeights.length; ++i) {
            sum += config.componentWeights[i];
        }
        if (sum > 10000) {
            revert InvalidConfig(token);
        }

        // Ensure that the base rate plus the sum of the maximum component rates won't overflow
        if (uint256(config.base) + ((sum * type(uint64).max) / 10000) > type(uint64).max) {
            revert InvalidConfig(token);
        }

        rateConfigs[token] = config;

        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // We require that the buffer is initialized before allowing rate updates to occur
            initializeBuffers(token);
        }
    }

    /// @notice Changes the pause state of rate updates for a token. This can only be called by the update pause admin.
    /// @param token The token for which to change the pause state.
    /// @param paused Whether rate updates should be paused.
    function setUpdatesPaused(address token, bool paused) external virtual onlyRole(Roles.UPDATE_PAUSE_ADMIN) {
        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Uninitialized buffer means that the rate config is missing
            // It doesn't make sense to pause updates if they can't occur in the first place
            // Plus, buffer initialization sets the pause state to false, so setting it beforehand can cause confusion
            revert MissingConfig(token);
        }

        meta.pauseUpdates = paused;
    }

    /// @inheritdoc IRateComputer
    function computeRate(address token) external view virtual override returns (uint64) {
        return computeRateInternal(token);
    }

    /// @inheritdoc IHistoricalRates
    function getRateAt(address token, uint256 index) external view virtual override returns (RateLibrary.Rate memory) {
        BufferMetadata memory meta = rateBufferMetadata[token];

        if (index >= meta.size) {
            revert InvalidIndex(token, index, meta.size);
        }

        uint256 bufferIndex = meta.end < index ? meta.end + meta.size - index : meta.end - index;

        return rateBuffers[token][bufferIndex];
    }

    /// @inheritdoc IHistoricalRates
    function getRates(
        address token,
        uint256 amount
    ) external view virtual override returns (RateLibrary.Rate[] memory) {
        return getRatesInternal(token, amount, 0, 1);
    }

    /// @inheritdoc IHistoricalRates
    function getRates(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view virtual override returns (RateLibrary.Rate[] memory) {
        return getRatesInternal(token, amount, offset, increment);
    }

    /// @inheritdoc IHistoricalRates
    function getRatesCount(address token) external view override returns (uint256) {
        return rateBufferMetadata[token].size;
    }

    /// @inheritdoc IHistoricalRates
    function getRatesCapacity(address token) external view virtual override returns (uint256) {
        uint256 maxSize = rateBufferMetadata[token].maxSize;
        if (maxSize == 0) return initialBufferCardinality;

        return maxSize;
    }

    /// @notice Sets the capacity of the rate buffer for a token. Only callable by the admin because the
    ///   updating logic is O(n) on the capacity. Only callable when the rate config is set.
    /// @param amount The new capacity of rates for the token. Must be greater than the current capacity, but
    ///   less than 256.
    /// @inheritdoc IHistoricalRates
    function setRatesCapacity(address token, uint256 amount) external virtual onlyRole(Roles.ADMIN) {
        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Buffer is not initialized yet
            // Buffer can only be initialized when the rate config is set
            revert MissingConfig(token);
        }

        if (amount < meta.maxSize) revert CapacityCannotBeDecreased(token, amount, meta.maxSize);
        if (amount > type(uint8).max) revert CapacityTooLarge(token, amount, type(uint8).max);

        RateLibrary.Rate[] storage rateBuffer = rateBuffers[token];

        // Add new slots to the buffer
        uint256 capacityToAdd = amount - meta.maxSize;
        for (uint256 i = 0; i < capacityToAdd; ++i) {
            // Push a dummy rate with non-zero values to put most of the gas cost on the caller
            rateBuffer.push(RateLibrary.Rate({target: 1, current: 1, timestamp: 1}));
        }

        if (meta.maxSize != amount) {
            emit RatesCapacityIncreased(token, meta.maxSize, amount);

            // Update the metadata
            meta.maxSize = uint8(amount);
        }
    }

    /// @inheritdoc IPeriodic
    function granularity() external view virtual override returns (uint256) {
        return 1;
    }

    /// @inheritdoc IUpdateable
    function update(
        bytes memory data
    ) public virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool b) {
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
            timeSinceLastUpdate(data) >= period && meta.maxSize > 0 && !meta.pauseUpdates && willAnythingChange(data);
    }

    /// @inheritdoc IUpdateable
    function canUpdate(bytes memory data) public view virtual override returns (bool b) {
        return
            // Can only update if the update is needed
            needsUpdate(data) &&
            // Can only update if the sender is an oracle updater or the oracle updater role is open
            (hasRole(Roles.ORACLE_UPDATER, address(0)) || hasRole(Roles.ORACLE_UPDATER, msg.sender));
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

    function willAnythingChange(bytes memory data) internal view virtual returns (bool) {
        address token = abi.decode(data, (address));

        BufferMetadata memory meta = rateBufferMetadata[token];

        // If the buffer has empty slots, they can be filled
        if (meta.size != meta.maxSize) return true;

        // All current and target rates in the buffer should match the current target rate
        // Otherwise, the rate will change
        uint64 target = computeRateInternal(token);
        RateLibrary.Rate[] memory rates = getRatesInternal(token, meta.size, 0, 1);
        for (uint256 i = 0; i < rates.length; ++i) {
            if (rates[i].target != target || rates[i].current != target) return true;
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

    function getRatesInternal(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) internal view virtual returns (RateLibrary.Rate[] memory) {
        if (amount == 0) return new RateLibrary.Rate[](0);

        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.size <= (amount - 1) * increment + offset)
            revert InsufficientData(token, meta.size, (amount - 1) * increment + offset + 1);

        RateLibrary.Rate[] memory observations = new RateLibrary.Rate[](amount);

        uint256 count = 0;

        for (
            uint256 i = meta.end < offset ? meta.end + meta.size - offset : meta.end - offset;
            count < amount;
            i = (i < increment) ? (i + meta.size) - increment : i - increment
        ) {
            observations[count++] = rateBuffers[token][i];
        }

        return observations;
    }

    function initializeBuffers(address token) internal virtual {
        if (rateBuffers[token].length != 0) {
            revert BufferAlreadyInitialized(token);
        }

        BufferMetadata storage meta = rateBufferMetadata[token];

        // Initialize the buffers
        RateLibrary.Rate[] storage observationBuffer = rateBuffers[token];

        for (uint256 i = 0; i < initialBufferCardinality; ++i) {
            observationBuffer.push();
        }

        // Initialize the metadata
        meta.start = 0;
        meta.end = 0;
        meta.size = 0;
        meta.maxSize = initialBufferCardinality;
        meta.pauseUpdates = false;

        emit RatesCapacityInitialized(token, meta.maxSize);
    }

    function push(address token, RateLibrary.Rate memory rate) internal virtual {
        BufferMetadata storage meta = rateBufferMetadata[token];

        if (meta.size == 0) {
            if (meta.maxSize == 0) {
                // Initialize the buffers
                initializeBuffers(token);
            }
        } else {
            meta.end = (meta.end + 1) % meta.maxSize;
        }

        rateBuffers[token][meta.end] = rate;

        emit RateUpdated(token, rate.target, rate.current, block.timestamp);

        if (meta.size < meta.maxSize && meta.end == meta.size) {
            // We are at the end of the array and we have not yet filled it
            meta.size++;
        } else {
            // start was just overwritten
            meta.start = (meta.start + 1) % meta.size;
        }
    }

    function computeRateInternal(address token) internal view virtual returns (uint64) {
        RateConfig memory config = rateConfigs[token];

        uint64 rate = config.base;

        for (uint256 i = 0; i < config.componentWeights.length; ++i) {
            uint64 componentRate = ((uint256(config.components[i].computeRate(token)) * config.componentWeights[i]) /
                10000).toUint64();

            rate += componentRate;
        }

        return rate;
    }

    function performUpdate(bytes memory data) internal virtual returns (bool) {
        address token = abi.decode(data, (address));

        // Compute the target rate
        uint64 target = computeRateInternal(token);

        uint64 newRate = target;

        RateConfig memory config = rateConfigs[token];
        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.size > 0) {
            // We have a previous rate, so let's make sure we don't change it too much

            uint64 last = rateBuffers[token][meta.end].current;

            if (newRate > last) {
                if (newRate - last > config.maxIncrease) {
                    // The new rate is too high, so we change it by the maximum increase
                    newRate = last + config.maxIncrease;
                }
            } else if (newRate < last) {
                if (last - newRate > config.maxDecrease) {
                    // The new rate is too low, so we change it by the maximum decrease
                    newRate = last - config.maxDecrease;
                }
            }
        }

        // Push the new rate
        push(token, RateLibrary.Rate({target: target, current: newRate, timestamp: uint32(block.timestamp)}));

        return true;
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of RATE_ADMIN as ADMIN
        _setRoleAdmin(Roles.RATE_ADMIN, Roles.ADMIN);

        // Set admin of UPDATE_PAUSE_ADMIN as ADMIN
        _setRoleAdmin(Roles.UPDATE_PAUSE_ADMIN, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER_MANAGER as ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER_MANAGER, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER as ORACLE_UPDATER_MANAGER
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.ORACLE_UPDATER_MANAGER);

        // Hierarchy:
        // ADMIN
        //   - RATE_ADMIN
        //   - ORACLE_UPDATER_MANAGER
        //     - ORACLE_UPDATER
        //   - UPDATE_PAUSE_ADMIN
    }
}
