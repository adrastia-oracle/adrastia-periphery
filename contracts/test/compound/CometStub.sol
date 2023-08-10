// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

interface IComet {
    struct TotalsCollateral {
        uint128 totalSupplyAsset;
        uint128 _reserved;
    }

    function totalsCollateral(address) external view returns (TotalsCollateral memory);

    function totalBorrow() external view returns (uint256);

    function totalSupply() external view returns (uint256);
}

contract CometStub is IComet {
    address public baseToken;

    mapping(address => TotalsCollateral) internal _totalsCollateral;

    uint256 public override totalBorrow;

    uint256 public override totalSupply;

    constructor(address baseToken_) {
        baseToken = baseToken_;
    }

    function totalsCollateral(address token) external view override returns (TotalsCollateral memory) {
        return _totalsCollateral[token];
    }

    function stubSetTotalsCollateral(address token, uint128 tokenTotalSupply) external {
        _totalsCollateral[token].totalSupplyAsset = tokenTotalSupply;
    }

    function stubSetTotalSupply(uint256 totalSupply_) external {
        totalSupply = totalSupply_;
    }

    function stubSetTotalBorrow(uint256 totalBorrow_) external {
        totalBorrow = totalBorrow_;
    }
}
