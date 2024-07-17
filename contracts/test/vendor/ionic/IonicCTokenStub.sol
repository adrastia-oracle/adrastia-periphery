// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {ICToken} from "../../../vendor/ionic/ICToken.sol";
import {IRateComputer} from "../../../rates/IRateComputer.sol";

contract IonicCTokenStub is ICToken {
    uint256 public _totalUnderlyingSupplied;
    address public _underlying;

    uint256 public _totalBorrows;
    uint256 public _totalReserves;
    uint256 public _cash;
    uint256 public _badDebt;

    bool internal _isCEther;

    uint256 internal _accrueInterestReturnCode;

    event InterestAccrued(uint64 rate);

    constructor(address underlying_) {
        _underlying = underlying_;
    }

    function stubSetTotalUnderlyingSupplied(uint256 totalUnderlyingSupplied) external {
        _totalUnderlyingSupplied = totalUnderlyingSupplied;
    }

    function stubSetTotalBorrows(uint256 totalBorrows_) external {
        _totalBorrows = totalBorrows_;
    }

    function stubSetTotalReserves(uint256 totalReserves_) external {
        _totalReserves = totalReserves_;
    }

    function stubSetCash(uint256 cash_) external {
        _cash = cash_;
    }

    function stubSetIsCEther(bool isCEther_) external {
        _isCEther = isCEther_;
    }

    function stubSetBadDebt(uint256 badDebt_) external {
        _badDebt = badDebt_;
    }

    function stubSetAccrueInterestReturnCode(uint256 accrueInterestReturnCode_) external {
        _accrueInterestReturnCode = accrueInterestReturnCode_;
    }

    function getTotalUnderlyingSupplied() external view override returns (uint256) {
        return _totalUnderlyingSupplied;
    }

    function underlying() external view override returns (address) {
        if (_isCEther) {
            revert();
        }

        return _underlying;
    }

    function totalBorrows() external view override returns (uint256) {
        return _totalBorrows;
    }

    function totalReserves() external view override returns (uint256) {
        return _totalReserves;
    }

    function getCash() external view override returns (uint256) {
        return _cash;
    }

    function badDebt() external view returns (uint256) {
        return _badDebt;
    }

    function accrueInterest() external override returns (uint256) {
        // Extract the rate from the message sender
        uint64 rate = IRateComputer(msg.sender).computeRate(_underlying);

        // Emit an event
        emit InterestAccrued(rate);

        return _accrueInterestReturnCode;
    }
}
