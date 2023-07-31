//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AaveRateController.sol";
import "../../../../vendor/aave/IAaveV3ConfigEngine.sol";
import {EngineFlags} from "../../../../vendor/aave/AaveV3EngineFlags.sol";

/**
 * @title AaveCapController
 * @notice A smart contract that extends AaveRateController to implement functionality specific to Aave v3's supply and
 *   borrow cap management.
 * @dev This contract overrides `willAnythingChange` to only check if the next rate changes by more than the configured
 *   threshold. This changes the behavior of the rate queue where old rates do not necessarily relate to the period.
 *   i.e. If the period is a day, the rate at index 1 is not necessarily the rate from the previous day.
 */
contract AaveCapController is AaveRateController {
    uint256 public constant CHANGE_PRECISION = 10 ** 8;

    /// @notice The Aave Config Engine instance.
    IAaveV3ConfigEngine public immutable configEngine;

    /// @notice True if this controller updates supply caps, false if it updates borrow caps.
    bool public immutable forSupplyCaps;

    /**
     * @notice Constructs the AaveCapController contract.
     * @param configEngine_ The Aave Config Engine instance.
     * @param forSupplyCaps_ True if this controller updates supply caps, false if it updates borrow caps.
     * @param aclManager_ The Aave ACL Manager instance.
     * @param period_ The period of the rate controller.
     * @param initialBufferCardinality_ The initial cardinality of the rate buffers.
     * @param updatersMustBeEoa_ Whether or not the updaters must be EOA.
     */
    constructor(
        IAaveV3ConfigEngine configEngine_,
        bool forSupplyCaps_,
        IACLManager aclManager_,
        uint32 period_,
        uint8 initialBufferCardinality_,
        bool updatersMustBeEoa_
    ) AaveRateController(aclManager_, period_, initialBufferCardinality_, updatersMustBeEoa_) {
        configEngine = configEngine_;
        forSupplyCaps = forSupplyCaps_;
    }

    /**
     * @notice Sets the change threshold for the specified token. When the rate changes by more than the threshold, an
     *   update is triggered, assuming the period has been surpassed.
     * @param token The token to set the change threshold for.
     * @param changeThreshold Percent change that allows an update to make place, respresented as the numerator of a
     *   fraction with a denominator of `CHANGE_PRECISION`. Ex: With `CHANGE_PRECISION` of 1e8, a change threshold of
     *   2% would be represented as 2e6 (2000000).
     */
    function setChangeThreshold(address token, uint32 changeThreshold) external virtual {
        checkSetChangeThreshold();

        rateBufferMetadata[token].changeThreshold = changeThreshold;
    }

    /**
     * @notice Gets the change threshold for the specified token.
     * @param token The token to get the change threshold for.
     * @return uint32 Percent change that allows an update to make place, respresented as the numerator of a
     *   fraction with a denominator of `CHANGE_PRECISION`. Ex: With `CHANGE_PRECISION` of 1e8, a change threshold of
     *   2% would be represented as 2e6 (2000000).
     */
    function getChangeThreshold(address token) external view virtual returns (uint32) {
        return rateBufferMetadata[token].changeThreshold;
    }

    /// @notice Checks if the sender has the required role to set the change threshold, namely, the POOL_ADMIN role.
    function checkSetChangeThreshold() internal view virtual {
        if (!aclManager.isPoolAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.POOL_ADMIN_ROLE());
        }
    }

    /// @dev Overridden to push the rate to the Aave Config Engine.
    function push(address token, RateLibrary.Rate memory rate) internal virtual override {
        super.push(token, rate);

        // Push the latest rate to the Aave Config Engine
        pushToConfigEngine(token, rate);
    }

    /**
     * @notice Pushes the rate to the Aave Config Engine.
     * @dev Whether the rate is for supply caps or borrow caps is determined by the `forSupplyCaps` field.
     * @param token The token to push the rate for.
     * @param rate The rate to push.
     */
    function pushToConfigEngine(address token, RateLibrary.Rate memory rate) internal virtual {
        IAaveV3ConfigEngine.CapsUpdate[] memory capsUpdates = new IAaveV3ConfigEngine.CapsUpdate[](1);

        capsUpdates[0] = IAaveV3ConfigEngine.CapsUpdate({
            asset: token,
            supplyCap: forSupplyCaps ? rate.current : EngineFlags.KEEP_CURRENT,
            borrowCap: forSupplyCaps ? EngineFlags.KEEP_CURRENT : rate.current
        });

        IAaveV3ConfigEngine(configEngine).updateCaps(capsUpdates);
    }

    /// @dev Overridden to only check if the the rate changes by at least the desired threshold.
    function willAnythingChange(bytes memory data) internal view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        BufferMetadata memory meta = rateBufferMetadata[token];

        // No rates in the buffer, so the rate will change.
        if (meta.size == 0) return true;

        uint256 lastRate = _getRates(token, 1, 0, 1)[0].current;
        (, uint64 nextRate) = computeRateAndClamp(token);

        return changeThresholdSurpassed(lastRate, nextRate, meta.changeThreshold);
    }

    /// @dev Overridden to allow anyone to extend the capacity of the rate buffers. Since `willAnythingChange` only
    ///   compares the previous rate to the next rate, extending the capacity of the rate buffers does not affect the
    ///   gas consumption of the rate controller (by much).
    function checkSetRatesCapacity() internal view virtual override {
        // Anyone can extend the capacity of the rate buffers.
    }

    /// @dev Taken from adrastia-core/contracts/accumulators/AbstractAccumulator.
    /// @custom:todo Add this to a library upstream.
    function calculateChange(uint256 a, uint256 b) internal view virtual returns (uint256 change, bool isInfinite) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        // a >= b

        if (a == 0) {
            // a == b == 0 (since a >= b), therefore no change
            return (0, false);
        } else if (b == 0) {
            // (a > 0 && b == 0) => change threshold passed
            // Zero to non-zero always returns true
            return (0, true);
        }

        unchecked {
            uint256 delta = a - b; // a >= b, therefore no underflow
            uint256 preciseDelta = delta * CHANGE_PRECISION;

            // If the delta is so large that multiplying by CHANGE_PRECISION overflows, we assume that
            // the change threshold has been surpassed.
            // If our assumption is incorrect, the accumulator will be extra-up-to-date, which won't
            // really break anything, but will cost more gas in keeping this accumulator updated.
            if (preciseDelta < delta) return (0, true);

            change = preciseDelta / b;
            isInfinite = false;
        }
    }

    /// @dev Taken from adrastia-core/contracts/accumulators/AbstractAccumulator.
    /// @custom:todo Add this to a library upstream.
    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 changeThreshold
    ) internal view virtual returns (bool) {
        (uint256 change, bool isInfinite) = calculateChange(a, b);

        return isInfinite || change >= changeThreshold;
    }
}
