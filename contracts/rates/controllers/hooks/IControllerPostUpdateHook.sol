//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "../../RateLibrary.sol";

/**
 * @title IControllerPostUpdateHook
 * @author Tyler Loewen, TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice An interface for a hook that can be called immediately after a controller rate is pushed.
 */
interface IControllerPostUpdateHook {
     /**
     * @notice Called immediately after the controller updates the rate for a token.
     *
     * @param token The address of the token for which the rate has been updated.
     * @param rate The new rate that has been set for the token.
     */
    function onPostControllerUpdate(address token, RateLibrary.Rate calldata rate) external;
}
