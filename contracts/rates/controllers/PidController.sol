// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/ILiquidityOracle.sol";

import "../transformers/IInputAndErrorTransformer.sol";
import "../RateController.sol";

/// @title PidController - PID Controller
/// @notice A RateController implementation that uses a PID controller to compute rates.
/// This is an opinionated implementation that has the following characteristics:
/// - Proportional on either measurement or error
/// - Integral on error
/// - Derivative on either measurement or error
/// - The input and error values can be transformed before being used in the PID controller.
/// - The I term and changes to it are clamped with the same logic as the output rate (that is also clamped).
/// - The output rates are limited to the range [0, 2^64). Rebase if you need to handle negative rates.
/// - Windup prevention (used when rate limited)
/// - Unpausing kickback prevention (reinitializes the PID controller to avoid a large jump in the output rate)
/// - Manually pushing a rate reinitializes the PID controller to avoid a large jump in the output rate
/// - Updates occur continuously on a fixed period
///
/// This controller may struggle to achieve stability with near-zero rates. The user can mitigate this by rebasing.
/// (i.e. considering a positive rate as zero and adjusting the output rates accordingly.)
/// This same rebasing can be used to handle negative rates.
/// @dev This contract is abstract because it lacks restrictions on sensitive functions. Please override checkSetConfig,
/// checkManuallyPushRate, checkSetUpdatesPaused, checkSetRatesCapacity, checkSetDefaultInputAndErrorOracle, and
/// checkUpdate to add restrictions.
abstract contract PidController is RateController {
    /// @notice Struct to hold PID configuration.
    struct PidConfig {
        // Slot 1
        ILiquidityOracle inputAndErrorOracle;
        int32 kPNumerator;
        uint32 kPDenominator;
        int32 kINumerator;
        // Slot 2
        uint32 kIDenominator;
        int32 kDNumerator;
        uint32 kDDenominator;
        IInputAndErrorTransformer transformer;
        // Slot 3
        bool proportionalOnMeasurement; // If true, the proportional term is computed on the input instead of the error.
        bool derivativeOnMeasurement; // If true, the derivative term is computed on the input instead of the error.
    }

    /// @notice Struct to hold PID state.
    struct PidState {
        int256 iTerm;
        int256 lastInput;
        int256 lastError;
    }

    /// @notice Struct to hold both PID configuration and state.
    struct PidData {
        PidConfig config;
        PidState state;
    }

    /// @notice A constant representing the error offset.
    uint112 public constant ERROR_ZERO = 1e18;

    /// @notice Default oracle to provide input and error values for the PID controller.
    ILiquidityOracle public defaultInputAndErrorOracle;

    /// @notice Mapping to store PID data for different tokens.
    mapping(address => PidData) public pidData;

    /// @notice Event emitted when the PID configuration for a token is updated.
    /// @param token The token for which the PID configuration was updated.
    event PidConfigUpdated(address indexed token, PidConfig oldConfig, PidConfig newConfig);

    /// @notice Event emitted when the default input and error oracle is set or changed.
    event DefaultInputAndErrorOracleUpdated(ILiquidityOracle indexed oldOracle, ILiquidityOracle indexed newOracle);

    /// @notice Emitted when attempting to update the default input and error oracle to the same value.
    /// @param oracle The oracle that was attempted to be set.
    error DefaultInputAndErrorOracleUnchanged(ILiquidityOracle oracle);

    /// @notice Emitted when the period is invalid.
    /// @param period The invalid period.
    error InvalidPeriod(uint256 period);

    /// @notice Emitted when attempting to set an invalid input and error oracle.
    /// @param oracle The invalid oracle.
    error InvalidInputAndErrorOracle(ILiquidityOracle oracle);

    /// @notice An error that is thrown if we require a PID configuration that has not been set.
    /// @param token The token for which we require a PID configuration.
    error MissingPidConfig(address token);

    /// @notice Constructs the PidController.
    /// @param inputAndErrorOracle_ Default oracle to provide input and error values.
    /// @param period_ The period for the rate controller.
    /// @param initialBufferCardinality_ Initial size of the buffer for rate storage.
    /// @param updatersMustBeEoa_ Flag to determine if updaters must be externally owned accounts.
    constructor(
        ILiquidityOracle inputAndErrorOracle_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) RateController(period_, initialBufferCardinality_, updatersMustBeEoa_) {
        if (period_ == 0) revert InvalidPeriod(period_);

        validateInputAndErrorOracle(inputAndErrorOracle_, true);

        defaultInputAndErrorOracle = inputAndErrorOracle_;
    }

    /**
     * @notice Gets the input and error oracle for a given token.
     * @param token The token for which to get the input and error oracle.
     */
    function getInputAndErrorOracle(address token) external view virtual returns (ILiquidityOracle) {
        return _inputAndErrorOracle(token);
    }

    /**
     * @notice Sets the default input and error oracle.
     * @param inputAndErrorOracle_ The new default input and error oracle.
     */
    function setDefaultInputAndErrorOracle(ILiquidityOracle inputAndErrorOracle_) external virtual {
        checkSetDefaultInputAndErrorOracle();

        validateInputAndErrorOracle(inputAndErrorOracle_, true);

        ILiquidityOracle oldOracle = defaultInputAndErrorOracle;

        if (oldOracle != inputAndErrorOracle_) {
            defaultInputAndErrorOracle = inputAndErrorOracle_;

            emit DefaultInputAndErrorOracleUpdated(oldOracle, inputAndErrorOracle_);
        } else {
            revert DefaultInputAndErrorOracleUnchanged(inputAndErrorOracle_);
        }
    }

    /// @notice Sets the PID configuration for a specific token.
    /// @param token The address of the token for which to set the configuration.
    /// @param pidConfig The PID configuration to set.
    function setPidConfig(address token, PidConfig memory pidConfig) external virtual {
        checkSetPidConfig();

        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // This means that the rate config has not been set yet. We require it to be set before the PID config.
            revert MissingConfig(token);
        }

        if (pidConfig.kPDenominator == 0 || pidConfig.kIDenominator == 0 || pidConfig.kDDenominator == 0) {
            revert InvalidConfig(token);
        }

        validateInputAndErrorOracle(pidConfig.inputAndErrorOracle, false);

        PidConfig memory oldConfig = pidData[token].config;

        pidData[token].config = pidConfig;

        emit PidConfigUpdated(token, oldConfig, pidConfig);

        if (oldConfig.kPDenominator == 0) {
            // If the old config was uninitialized, initialize the PID controller.
            initializePid(token);
        }
    }

    /// @inheritdoc RateController
    /// @dev Returns the current rate (latest stored) for the token, reverting if the rate has never been computed.
    function computeRate(address token) external view virtual override returns (uint64) {
        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.size == 0) {
            // We've never computed a rate, so revert.
            revert InsufficientData(token, 0, 1);
        }

        return getLatestRate(token).current;
    }

    /// @inheritdoc RateController
    /// @dev Updates are not needed if the PID config is uninitialized.
    function needsUpdate(bytes memory data) public view virtual override returns (bool b) {
        address token = abi.decode(data, (address));

        if (pidData[token].config.kPDenominator == 0) {
            // We're missing a PID config, so no update is needed.
            return false;
        } else return super.needsUpdate(data);
    }

    /// @inheritdoc RateController
    /// @dev Reinitializes the PID controller when unpausing to avoid a large jump in the output rate.
    function onPaused(address token, bool paused) internal virtual override {
        if (!paused) {
            // Being unpaused. Reinitialize the PID controller.
            initializePid(token);
        }
    }

    function _manuallyPushRate(address token, uint64 target, uint64 current, uint256 amount) internal virtual override {
        if (pidData[token].config.kPDenominator == 0) {
            // We're missing a PID config, so we can't manually push a rate.
            // We require the PID config to be set so that we can protect against large jumps in the output rate.
            revert MissingPidConfig(token);
        }

        super._manuallyPushRate(token, target, current, amount);

        // Reinitialize the PID controller to avoid a large jump in the output rate with the next update.
        initializePid(token);
    }

    /// @notice Retrieves the raw input and error values from the oracle for a given token.
    /// @dev Returned values have not been transformed.
    /// @param token The address of the token for which to get input and error.
    /// @return The raw input and error values.
    function getInputAndError(address token) internal view virtual returns (uint112, uint112) {
        return _inputAndErrorOracle(token).consultLiquidity(token);
    }

    /// @notice Transforms the input and error values based on the token's configuration.
    /// @param token The address of the token for which to transform input and error.
    /// @param input The raw input value.
    /// @param err The raw error value.
    /// @return transformedInput The transformed input value.
    /// @return transformedError The transformed error value.
    function transformSignedInputAndError(
        address token,
        int256 input,
        int256 err
    ) internal view virtual returns (int256 transformedInput, int256 transformedError) {
        PidConfig memory config = pidData[token].config;
        if (address(config.transformer) != address(0)) {
            (transformedInput, transformedError) = config.transformer.transformInputAndError(input, err);
        } else {
            transformedInput = input;
            transformedError = err;
        }
    }

    /// @notice Retrieves and transforms the input and error values for a given token.
    /// @dev Returned values have been transformed as per the token's config.
    /// @param token The address of the token for which to get and transform input and error.
    /// @return input The transformed input value.
    /// @return err The transformed error value.
    function getSignedInputAndError(address token) internal view virtual returns (int256 input, int256 err) {
        (uint112 uInput, uint112 uErr) = getInputAndError(token);

        input = int256(uint256(uInput));
        err = int256(uint256(uErr)) - int256(uint256(ERROR_ZERO));

        (input, err) = transformSignedInputAndError(token, input, err);
    }

    /// @dev Initializes the PID controller state for a given token.
    /// @param token The address of the token for which to initialize the PID controller.
    function initializePid(address token) internal virtual {
        PidData storage pid = pidData[token];
        PidState storage pidState = pid.state;
        BufferMetadata storage meta = rateBufferMetadata[token];

        (int256 input, int256 err) = getSignedInputAndError(token);

        pidState.lastInput = input;
        pidState.lastError = err;
        if (meta.size > 0) {
            // We have a past rate, so set the iTerm to it to avoid a large jump.
            // We don't need to clamp this because the last rate was already clamped.

            // Calculate the pTerm, if the PID config is set
            PidConfig memory pidConfig = pid.config;
            int256 pTerm = pidConfig.kPDenominator == 0
                ? int256(0)
                : calculatePTerm(
                    input,
                    err,
                    pidConfig.kPNumerator,
                    pidConfig.kPDenominator,
                    pidConfig.proportionalOnMeasurement
                );

            // Subtract the pTerm from the output rate to get the iTerm. We subtract the pTerm to prevent a large jump
            // in the output rate with the next update (as something close to it will likely be added to the iTerm with
            // the next update to calculate the next rate).
            pidState.iTerm = int256(uint256(getLatestRate(token).current)) - pTerm;
        }
    }

    /// @notice Clamps a big signed rate as per the token's configuration.
    /// @param token The address of the token for which to clamp the rate.
    /// @param value The value to clamp.
    /// @param isOutput Flag to indicate if the value is an output rate.
    /// @param clampChange Flag to indicate if the change should be clamped. Only relevant if isOutput is false.
    /// @param last The last value for comparison. Only relevant if isOutput is false.
    /// @return The clamped value.
    function clampBigSignedRate(
        address token,
        int256 value,
        bool isOutput,
        bool clampChange,
        int256 last
    ) internal view virtual returns (int256) {
        uint64 valueAsUint;
        if (value >= int256(uint256(type(uint64).max))) {
            valueAsUint = type(uint64).max;
        } else if (value < int256(0)) {
            valueAsUint = 0;
        } else {
            valueAsUint = uint64(uint256(value));
        }

        uint64 clamped;

        if (isOutput) {
            clamped = clamp(token, valueAsUint); // clamp wrt. last output rate
        } else {
            uint64 lastAsUint;
            if (last <= int256(0)) {
                lastAsUint = uint64(0);
            } else if (last >= int256(uint256(type(uint64).max))) {
                lastAsUint = type(uint64).max;
            } else {
                lastAsUint = uint64(uint256(last));
            }

            clamped = clampWrtLast(token, valueAsUint, clampChange, lastAsUint);
        }

        return int256(uint256(clamped));
    }

    function calculatePTerm(
        int256 input,
        int256 err,
        int32 kPNumerator,
        uint32 kPDenominator,
        bool proportionalOnMeasurement
    ) internal pure virtual returns (int256) {
        if (proportionalOnMeasurement) {
            return -(int256(kPNumerator) * input) / int256(uint256(kPDenominator));
        } else {
            return (int256(kPNumerator) * err) / int256(uint256(kPDenominator));
        }
    }

    function computeNextPidRate(
        address token
    ) internal view virtual returns (uint64 target, uint64 current, PidState memory newPidState) {
        BufferMetadata memory meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // This means that the rate config has not been set yet. We can't compute a rate without a config.
            revert MissingConfig(token);
        }

        PidData memory pid = pidData[token];
        PidState memory pidState = pid.state;
        PidConfig memory pidConfig = pid.config;
        if (pidConfig.kPDenominator == 0) {
            // This means that the PID config has not been set yet. We can't compute a rate without a config.
            revert MissingPidConfig(token);
        }

        int256 deltaTime;
        if (meta.size > 0) {
            // We have a past rate, so compute deltaTime.
            uint256 lastUpdateTime = lastUpdateTime(abi.encode(token));
            deltaTime = int256(block.timestamp - lastUpdateTime);
        } else {
            // We don't have a past rate, so deltaTime is 0.
            deltaTime = 0;
        }

        (int256 input, int256 err) = getSignedInputAndError(token);

        // Compute proportional
        int256 pTerm = calculatePTerm(
            input,
            err,
            pidConfig.kPNumerator,
            pidConfig.kPDenominator,
            pidConfig.proportionalOnMeasurement
        );

        // Compute integral
        int256 previousITerm = pidState.iTerm;
        // Note: We assume that deltaTime is mostly constant. Otherwise, we should multiply the integral term by
        // deltaTime and adjust the gain accordingly.
        pidState.iTerm += (int256(pidConfig.kINumerator) * err) / int256(uint256(pidConfig.kIDenominator));
        pidState.iTerm = clampBigSignedRate(token, pidState.iTerm, false, meta.size > 0, previousITerm);
        // Note: Clamping the I term is done over non-negative values which can make it hard for the controller
        // to achieve stability with near-zero rates. The user can mitigate this by rebasing.
        // (i.e. considering a positive rate as zero and adjusting the other rates accordingly.)

        // Compute derivative
        int256 dTerm;
        if (deltaTime > 0) {
            if (pidConfig.derivativeOnMeasurement) {
                int256 deltaInput = input - pidState.lastInput;
                dTerm =
                    (int256(pidConfig.kDNumerator) * deltaInput) /
                    (int256(uint256(pidConfig.kDDenominator)) * deltaTime);
            } else {
                int256 deltaError = err - pidState.lastError;
                dTerm =
                    -(int256(pidConfig.kDNumerator) * deltaError) /
                    (int256(uint256(pidConfig.kDDenominator)) * deltaTime);
            }
        }

        // Compute output
        int256 output = pTerm + pidState.iTerm - dTerm;
        pidState.lastInput = input;
        pidState.lastError = err;
        if (output < int256(0)) {
            target = 0;
        } else if (output >= int256(uint256(type(uint64).max))) {
            target = type(uint64).max;
        } else {
            target = uint64(uint256(output));
        }
        output = clampBigSignedRate(token, output, true, false, 0);
        // Clamping the output returns a value in the range [0, 2^64), so we can safely cast it to uint64.
        current = uint64(uint256(output));
        newPidState = pidState;
    }

    function computeRateInternal(address token) internal view virtual override returns (uint64) {
        (uint64 target, , ) = computeNextPidRate(token);

        return target;
    }

    /// @inheritdoc RateController
    function updateAndCompute(address token) internal virtual override returns (uint64 target, uint64 current) {
        PidState memory newPidState;
        (target, current, newPidState) = computeNextPidRate(token);

        pidData[token].state = newPidState;

        return (target, current);
    }

    /// @inheritdoc RateController
    /// @dev Always returns true to ensure continuous updates.
    function willAnythingChange(bytes memory) internal view virtual override returns (bool) {
        return true;
    }

    function _inputAndErrorOracle(address token) internal view virtual returns (ILiquidityOracle) {
        PidData memory pid = pidData[token];
        if (address(pid.config.inputAndErrorOracle) == address(0)) {
            return defaultInputAndErrorOracle;
        } else {
            return pid.config.inputAndErrorOracle;
        }
    }

    /// @notice Checks if the caller is authorized to set the PID configuration.
    /// @dev This function should contain the access control logic for the setPidConfig function.
    function checkSetPidConfig() internal view virtual {
        checkSetConfig();
    }

    /// @notice Checks if the caller is authorized to set the default input and error oracle.
    /// @dev This function should contain the access control logic for the setDefaultInputAndErrorOracle function.
    function checkSetDefaultInputAndErrorOracle() internal view virtual {
        checkSetConfig();
    }

    function validateInputAndErrorOracle(ILiquidityOracle oracle, bool isDefault) internal view virtual {
        if (!isDefault) {
            if (address(oracle) == address(0)) {
                // A token-specific oracle can be set to the zero address to use the default oracle.
                return;
            }
        }

        if (address(oracle) == address(0)) revert InvalidInputAndErrorOracle(oracle);
    }
}
