// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol";

contract FakeCToken is ERC20 {
    uint8 public immutable _decimals;
    address public immutable _underlying;

    uint256 public cash;
    uint256 public borrows;
    uint256 public reserves;

    constructor(address underlying_, string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _underlying = underlying_;
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function totalBorrows() external view returns (uint256) {
        return borrows;
    }

    function totalReserves() external view returns (uint256) {
        return reserves;
    }

    function getCash() external view returns (uint256) {
        return cash;
    }

    function underlying() external view returns (address) {
        // This is a hack to make the FakeCToken behave like Compound's cEther contract
        if (_underlying == address(0)) revert("underlying not set");

        return _underlying;
    }

    /// @dev These inputs share the same units as the underlying token.
    function setData(uint256 cash_, uint256 totalBorrows_, uint256 totalReserves_) public {
        cash = cash_;
        borrows = totalBorrows_;
        reserves = totalReserves_;
    }
}
