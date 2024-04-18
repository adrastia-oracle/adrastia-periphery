// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./OracleMutationComputer.sol";

/**
 * @title SlopedOracleMutationComputer
 * @notice An OracleMutationComputer that applies a two-part slope function to the value returned by the oracle.
 * The slope function is defined by two slopes and a kink point. The slope function is defined as follows:
 * - With x as the unsigned input value from the oracle, scaled by the OracleMutationComputer's decimal offset
 * - With base as the signed base rate (y-intercept)
 * - With baseSlope as the signed slope of the base rate
 * - With kink as the unsigned kink point (x-coordinate)
 * - With kinkSlope as the signed additive slope of the kink point
 * - For x <= kink, the slope is baseSlope (from zero).
 * - For x > kink, the slope is baseSlope (from zero) + kinkSlope (from kink).
 * - The base rate is the y-intercept of the function.
 * - The kink point is the x-coordinate where the slope changes.
 * - The kink slope is the additive slope of the kink point.
 * - The final formula is `base + x * baseSlope + max(x - kink, 0) * kinkSlope`
 *
 * The input value can be sanitized before applying the slope function. Override the `sanitizeInput` function to apply
 * custom sanitization logic.
 *
 * The slope configuration can be set for each token. The configuration is stored in a mapping and can be updated by
 * calling the `setSlopeConfig` function. The slope configuration can be retrieved by calling the `getSlopeConfig`
 * function. The `setSlopeConfig` can be access controlled by overriding the `checkSetSlopeConfig` function.
 *
 * The final f(x) value is clamped to a minimum of 0. The value is then returned as per the specifications of
 * MutatedValueComputer.
 */
abstract contract SlopedOracleMutationComputer is OracleMutationComputer {
    struct SlopeConfig {
        // Slot 1
        int128 base; // The base rate (y-intercept)
        int64 baseSlope; // The slope of the base rate
        int64 kinkSlope; // The additive slope of the kink point
        // Slot 2
        uint128 kink; // The kink point (x-coordinate)
    }

    mapping(address => SlopeConfig) internal slopeConfigs;

    uint256 internal constant MAX_INPUT = (2 ** 255) - 1;

    /**
     * @notice Emitted when a token's slope configuration is updated.
     * @param token The address of the token.
     * @param oldConfig The old configuration.
     * @param newConfig The new configuration.
     */
    event SlopeConfigUpdated(address indexed token, SlopeConfig oldConfig, SlopeConfig newConfig);

    /**
     * @notice An error thrown when the input value is too large.
     * @param input The invalid input value.
     */
    error InputValueTooLarge(uint256 input);

    /**
     * @notice An error thrown when the slope configuration is missing.
     * @param token The token that's missing the slope configuration.
     */
    error MissingSlopeConfig(address token);

    /**
     * @notice An error thrown when the slope configuration is invalid.
     * @param token The token that has the invalid slope configuration.
     */
    error InvalidSlopeConfig(address token);

    /**
     * @notice An error thrown when the slope configuration is not changed.
     * @param token The token that has the unchanged slope configuration.
     */
    error SlopeConfigNotChanged(address token);

    /**
     * @notice Constructs a new SlopedOracleMutationComputer instance.
     * @param oracle_ The address of the oracle contract.
     * @param dataSlot_  The data slot to use when consulting the oracle. See the DATA_SLOT_* constants.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param decimalsOffset_ The decimal offset to apply when scaling the value from the token. Positive values scale
     *   up, negative values scale down. Measured in numbers of decimals places (powers of 10).
     */
    constructor(
        IOracle oracle_,
        uint256 dataSlot_,
        uint32 defaultOneXScalar_,
        int8 decimalsOffset_
    ) OracleMutationComputer(oracle_, dataSlot_, defaultOneXScalar_, decimalsOffset_) {}

    /**
     * @notice Returns the slope configuration for a token.
     * @param token The token address.
     * @return The token's slope configuration.
     */
    function getSlopeConfig(address token) external view virtual returns (SlopeConfig memory) {
        return slopeConfigs[token];
    }

    /**
     * @notice Sets the slope configuration for a specific token.
     * @dev Override `checkSetSlopeConfig` to control the access to this function.
     * @param token The token address.
     * @param base The base rate (y-intercept).
     * @param baseSlope The slope of the base rate.
     * @param kink The kink point (x-coordinate).
     * @param kinkSlope The additive slope of the kink point.
     */
    function setSlopeConfig(
        address token,
        int128 base,
        int64 baseSlope,
        uint128 kink,
        int64 kinkSlope
    ) external virtual {
        checkSetSlopeConfig();

        if (baseSlope == 0 && kinkSlope == 0) {
            // No slope => invalid configuration
            revert InvalidSlopeConfig(token);
        }

        SlopeConfig memory oldConfig = slopeConfigs[token];

        if (
            oldConfig.base == base &&
            oldConfig.baseSlope == baseSlope &&
            oldConfig.kink == kink &&
            oldConfig.kinkSlope == kinkSlope
        ) {
            // No change in configuration
            revert SlopeConfigNotChanged(token);
        }

        slopeConfigs[token] = SlopeConfig({base: base, baseSlope: baseSlope, kink: kink, kinkSlope: kinkSlope});
        emit SlopeConfigUpdated(token, oldConfig, slopeConfigs[token]);
    }

    /**
     * @notice Sanitizes the input value before using it in the slope calculation.
     * @dev Override this function to apply custom sanitization logic.
     * @param token The token address.
     * @param input The input value, coming from OracleMutationComputer#getValue.
     */
    function sanitizeInput(address token, uint256 input) internal view virtual returns (uint256) {
        token; // Silence unused variable warning

        return input;
    }

    function getValue(address token) internal view virtual override returns (uint256) {
        SlopeConfig memory config = slopeConfigs[token];
        if (config.baseSlope == 0 && config.kinkSlope == 0) {
            // No slope => configuration not set
            revert MissingSlopeConfig(token);
        }

        // Get the current value from the oracle
        // This value is scaled by OracleMutationComputer's decimal offset
        // The mutations specified in MutatedValueComputer have not been applied yet
        uint256 input = sanitizeInput(token, super.getValue(token));
        if (input > MAX_INPUT) {
            // Revert if the input is too large to convert to int256. Realistically should never happen.
            revert InputValueTooLarge(input);
        }

        int256 value = config.base + int256(input) * config.baseSlope;
        if (input > config.kink) {
            // Calculate the difference between the input and the kink point
            // We can safely convert this value to int256 because we know it is less than or equal to the input, which
            // has already been checked to be less or equal to than type(int256).max
            uint256 diff = input - config.kink;

            value += int256(diff) * config.kinkSlope;
        }

        if (value < 0) {
            // Negative values are not supported, so we return the minimum value
            return 0;
        }

        return uint256(value);
    }

    /// @notice Checks if the caller is authorized to set the slope configuration.
    /// @dev This function should contain the access control logic for the setSlopeConfig function.
    function checkSetSlopeConfig() internal view virtual;
}
