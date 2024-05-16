// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../rates/computers/HistoricalRatesComputer.sol";

contract HistoricalRatesComputerStub is HistoricalRatesComputer {
    constructor(
        IHistoricalRates defaultRateProvider,
        uint16 defaultIndex,
        bool defaultHighAvailability
    ) HistoricalRatesComputer(defaultRateProvider, defaultIndex, defaultHighAvailability) {}

    function checkSetConfig(address) internal view virtual override {}
}
