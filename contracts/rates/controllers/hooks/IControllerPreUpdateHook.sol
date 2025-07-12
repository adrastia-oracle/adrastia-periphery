//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "../../RateLibrary.sol";

/**
 * @title IControllerPreUpdateHook
 * @author Tyler Loewen, TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice An interface for a hook that can be called immediately before a controller rate is pushed.
 */
interface IControllerPreUpdateHook {
    /**
     * @notice Called immediately before the controller updates the rate for a token.
     *
     * @param token The address of the token for which the rate is being updated.
     * @param rate The new rate being set for the token.
     */
    function onPreControllerUpdate(address token, RateLibrary.Rate calldata rate) external;
}
