// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAaveV3ConfigEngine {
    /**
     * @dev Example (mock):
     * CapsUpdate({
     *   asset: AaveV3EthereumAssets.AAVE_UNDERLYING,
     *   supplyCap: 1_000_000,
     *   borrowCap: EngineFlags.KEEP_CURRENT
     * }
     */
    struct CapsUpdate {
        address asset;
        uint256 supplyCap; // Pass any value, of EngineFlags.KEEP_CURRENT to keep it as it is
        uint256 borrowCap; // Pass any value, of EngineFlags.KEEP_CURRENT to keep it as it is
    }

    /**
     * @notice Performs an update of the caps (supply, borrow) of the assets, in the Aave pool configured in this engine instance
     * @param updates `CapsUpdate[]` list of declarative updates containing the new caps
     *   More information on the documentation of the struct.
     */
    function updateCaps(CapsUpdate[] memory updates) external;
}
