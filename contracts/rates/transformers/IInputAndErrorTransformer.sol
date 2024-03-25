// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/// @title IInputAndErrorTransformer - PID Controller Input and Error Transformer Interface
/// @notice Interface for transforming input and error values in a PID controller.
/// This interface allows for the implementation of custom logic to transform
/// the input signal and the error value as required by the control system.
interface IInputAndErrorTransformer {
    /// @notice Transforms input and error values for a PID controller.
    /// @dev This function should be implemented to include the logic for transforming
    /// the input and error values. The transformation can be linear or non-linear
    /// based on the specific requirements of the control system.
    /// @param input The raw input value to the PID controller.
    /// @param error The current error value in the PID control loop.
    /// @return transformedInput The transformed input value.
    /// @return transformedError The transformed error value.
    function transformInputAndError(
        int256 input,
        int256 error
    ) external view returns (int256 transformedInput, int256 transformedError);
}
