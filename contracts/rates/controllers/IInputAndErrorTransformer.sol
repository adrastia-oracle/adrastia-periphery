// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

interface IInputAndErrorTransformer {
    function transformInputAndError(int256 input, int256 error) external view returns (int256 transformedInput, int256 transformedError);
}
