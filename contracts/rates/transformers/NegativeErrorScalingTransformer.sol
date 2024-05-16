// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./IInputAndErrorTransformer.sol";

/// @title NegativeErrorScalingTransformer - Negative Error Scaling Transformer
/// @notice Implements the IInputAndErrorTransformer interface to scale negative error values.
/// This contract provides a specific transformation logic where negative errors are scaled
/// by a factor determined at contract deployment. The input value remains unchanged.
contract NegativeErrorScalingTransformer is IInputAndErrorTransformer {
    /// @notice The numerator part of the scaling factor for negative errors.
    int256 public immutable errorScalingFactorNumerator;

    /// @notice The denominator part of the scaling factor for negative errors.
    int256 public immutable errorScalingFactorDenominator;

    /// @notice Custom error for invalid scaling factors.
    /// @param scalingFactorNumerator The numerator part of the provided scaling factor.
    /// @param scalingFactorDenominator The denominator part of the provided scaling factor.
    error InvalidScalingFactor(int256 scalingFactorNumerator, int256 scalingFactorDenominator);

    /// @notice Constructs the NegativeErrorScalingTransformer.
    /// @dev Sets the scaling factor for transforming negative errors.
    /// Reverts if either part of the scaling factor is non-positive.
    /// @param errorScalingFactorNumerator_ The numerator for the error scaling factor.
    /// @param errorScalingFactorDenominator_ The denominator for the error scaling factor.
    constructor(int256 errorScalingFactorNumerator_, int256 errorScalingFactorDenominator_) {
        if (errorScalingFactorNumerator_ <= 0 || errorScalingFactorDenominator_ <= 0) {
            revert InvalidScalingFactor(errorScalingFactorNumerator_, errorScalingFactorDenominator_);
        }

        errorScalingFactorNumerator = errorScalingFactorNumerator_;
        errorScalingFactorDenominator = errorScalingFactorDenominator_;
    }

    /// @notice Transforms the input and error values as per the scaling factor.
    /// @dev The input value is not transformed, but the error value is scaled if negative.
    /// The scaling is done by multiplying the error with the numerator and dividing by the denominator.
    /// @param input The raw input value to the PID controller.
    /// @param error The current error value in the PID control loop.
    /// @return transformedInput The unchanged input value.
    /// @return transformedError The transformed error value, scaled if it's negative.
    function transformInputAndError(
        int256 input,
        int256 error
    ) external view returns (int256 transformedInput, int256 transformedError) {
        transformedInput = input;
        transformedError = error;
        if (transformedError < 0) {
            transformedError *= errorScalingFactorNumerator;
            transformedError /= errorScalingFactorDenominator;
        }
    }
}
