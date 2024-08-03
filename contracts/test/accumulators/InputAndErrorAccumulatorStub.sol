// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/ILiquidityOracle.sol";

contract InputAndErrorAccumulatorStub is ILiquidityOracle {
    struct InputAndError {
        uint112 input;
        uint112 target;
    }

    uint112 internal constant ERROR_ZERO_ = 1e18;

    mapping(address => InputAndError) public values;

    function setInput(address token, uint112 input) external {
        values[token].input = input;
    }

    function setTarget(address token, uint112 target) external {
        values[token].target = target;
    }

    function consultLiquidity(address token) public view virtual override returns (uint112 input, uint112 err) {
        InputAndError memory value = values[token];

        input = value.input;
        if (value.target >= value.input) {
            err = (ERROR_ZERO_ + (value.target - value.input));
        } else {
            err = (ERROR_ZERO_ - (value.input - value.target));
        }
    }

    function consultLiquidity(
        address token,
        uint256
    ) public view virtual override returns (uint112 input, uint112 err) {
        // We ignore maxAge in this stub
        return consultLiquidity(token);
    }

    function update(bytes memory) public virtual override returns (bool b) {
        return false;
    }

    function needsUpdate(bytes memory) public view virtual override returns (bool b) {
        return false;
    }

    function canUpdate(bytes memory) public view virtual override returns (bool b) {
        return false;
    }

    function lastUpdateTime(bytes memory) public view virtual override returns (uint256) {
        return block.timestamp;
    }

    function timeSinceLastUpdate(bytes memory) public view virtual override returns (uint256) {
        return 0;
    }

    function quoteTokenName() public view virtual override returns (string memory) {
        return "";
    }

    function quoteTokenAddress() public view virtual override returns (address) {
        return address(0);
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        return "";
    }

    function quoteTokenDecimals() public view virtual override returns (uint8) {
        return 8;
    }
}
