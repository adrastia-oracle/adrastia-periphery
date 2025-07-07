// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../RateLibrary.sol";

/**
 * @title IControllerUpdateHook
 * @author Tyler Loewen, TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice An interface for hooks that can be called during the controller's update process.
 */
interface IControllerUpdateHook {
    /**
     * @notice Called immediately before the controller updates the rate for a token.
     *
     * @param token The address of the token for which the rate is being updated.
     * @param rate The new rate being set for the token.
     */
    function onPreControllerUpdate(address token, RateLibrary.Rate calldata rate) external;

    /**
     * @notice Called immediately after the controller updates the rate for a token.
     *
     * @param token The address of the token for which the rate has been updated.
     * @param rate The new rate that has been set for the token.
     */
    function onPostControllerUpdate(address token, RateLibrary.Rate calldata rate) external;
}
