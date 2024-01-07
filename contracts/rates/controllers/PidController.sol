// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/ILiquidityOracle.sol";

import "../transformers/IInputAndErrorTransformer.sol";
import "../RateController.sol";

import "hardhat/console.sol";

abstract contract PidController is RateController {
    struct PidConfig {
        int32 kPNumerator;
        uint32 kPDenominator;
        int32 kINumerator;
        uint32 kIDenominator;
        int32 kDNumerator;
        uint32 kDDenominator;
        IInputAndErrorTransformer transformer;
    }

    struct PidState {
        int256 iTerm;
        int256 lastInput;
    }

    struct PidData {
        PidConfig config;
        PidState state;
    }

    uint112 public constant ERROR_ZERO = 1e18;

    ILiquidityOracle public immutable inputAndErrorOracle;

    mapping(address => PidData) public pidData;

    /// @notice Event emitted when the PID configuration for a token is updated.
    /// @param token The token for which the PID configuration was updated.
    event PidConfigUpdated(address indexed token, PidConfig oldConfig, PidConfig newConfig);

    /// @notice Emitted when the period is invalid.
    /// @param period The invalid period.
    error InvalidPeriod(uint256 period);

    constructor(
        ILiquidityOracle inputAndErrorOracle_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) RateController(period_, initialBufferCardinality_, updatersMustBeEoa_) {
        if (period_ == 0) revert InvalidPeriod(period_);

        inputAndErrorOracle = inputAndErrorOracle_;
    }

    function setPidConfig(address token, PidConfig memory pidConfig) external {
        checkSetPidConfig();

        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.maxSize == 0) {
            // This means that the rate config has not been set yet. We require it to be set before the PID config.
            revert MissingConfig(token);
        }

        if (pidConfig.kPDenominator == 0 || pidConfig.kIDenominator == 0 || pidConfig.kDDenominator == 0) {
            revert InvalidConfig(token);
        }

        PidConfig memory oldConfig = pidData[token].config;

        pidData[token].config = pidConfig;

        emit PidConfigUpdated(token, oldConfig, pidConfig);

        if (oldConfig.kPDenominator == 0) {
            // If the old config was uninitialized, initialize the PID controller.
            initializePid(token);
        }
    }

    function computeRate(address token) external view virtual override returns (uint64) {
        BufferMetadata storage meta = rateBufferMetadata[token];
        if (meta.size == 0) {
            // We've never computed a rate, so revert.
            revert InsufficientData(token, 0, 1);
        }

        return getLatestRate(token).current;
    }

    function needsUpdate(bytes memory data) public view virtual override returns (bool b) {
        address token = abi.decode(data, (address));

        if (pidData[token].config.kPDenominator == 0) {
            // We're missing a PID config, so no update is needed.
            return false;
        } else return super.needsUpdate(data);
    }

    function onPaused(address token, bool paused) internal virtual override {
        if (!paused) {
            // Being unpaused. Reinitialize the PID controller.
            initializePid(token);
        }
    }

    /// @dev Returned values have not been transformed.
    function getInputAndError(address token) internal view virtual returns (uint112, uint112) {
        return _inputAndErrorOracle(token).consultLiquidity(token);
    }

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

    /// @dev Returned values have been transformed as per the token's config.
    function getSignedInputAndError(address token) internal view virtual returns (int256 input, int256 err) {
        (uint112 uInput, uint112 uErr) = getInputAndError(token);

        input = int256(uint256(uInput));
        err = int256(uint256(uErr)) - int256(uint256(ERROR_ZERO));

        (input, err) = transformSignedInputAndError(token, input, err);
    }

    function initializePid(address token) internal virtual {
        PidState storage pidState = pidData[token].state;
        BufferMetadata storage meta = rateBufferMetadata[token];

        (int256 input, ) = getSignedInputAndError(token);

        pidState.lastInput = input;
        if (meta.size > 0) {
            // We have a past rate, so set the iTerm to it to avoid a large jump.
            // We don't need to clamp this because the last rate was already clamped.
            pidState.iTerm = int256(uint256(getLatestRate(token).current));
        }
    }

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

    function updateAndCompute(address token) internal virtual override returns (uint64 target, uint64 current) {
        PidData storage pid = pidData[token];
        PidState storage pidState = pid.state;
        PidConfig memory pidConfig = pid.config;
        BufferMetadata storage meta = rateBufferMetadata[token];

        int256 deltaTime = int256(uint256(period));

        (int256 input, int256 err) = getSignedInputAndError(token);

        // Compute proportional
        int256 pTerm = (int256(pidConfig.kPNumerator) * err) / int256(uint256(pidConfig.kPDenominator));

        // Compute integral
        int256 previousITerm = pidState.iTerm;
        pidState.iTerm += (int256(pidConfig.kINumerator) * err) / int256(uint256(pidConfig.kIDenominator));
        pidState.iTerm = clampBigSignedRate(token, pidState.iTerm, false, meta.size > 0, previousITerm);

        // Compute derivative
        int256 deltaInput = input - pidState.lastInput;
        int256 dTerm = (int256(pidConfig.kDNumerator) * deltaInput) /
            (int256(uint256(pidConfig.kDDenominator)) * deltaTime);

        // Compute output
        int256 output = pTerm + pidState.iTerm - dTerm;
        pidState.lastInput = input;
        target = uint64(uint256(output));
        output = clampBigSignedRate(token, output, true, false, 0);
        current = uint64(uint256(output));
    }

    function willAnythingChange(bytes memory) internal view virtual override returns (bool) {
        return true;
    }

    function _inputAndErrorOracle(address) internal view virtual returns (ILiquidityOracle) {
        return inputAndErrorOracle;
    }

    /// @notice Checks if the caller is authorized to set the PID configuration.
    /// @dev This function should contain the access control logic for the setPidConfig function.
    function checkSetPidConfig() internal view virtual {
        checkSetConfig();
    }
}
