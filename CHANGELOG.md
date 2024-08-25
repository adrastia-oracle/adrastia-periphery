# Changelog

## 4.10.0
### Prudentia
#### Controllers
- Add flag to enable or disable compute ahead logic: If enabled, the controller's computeRate function will calculate the rate on-the-fly with clamping. Otherwise, it will return the last stored rate.
- Add IonicRateController: A RateController that computes rates for Ionic tokens, accruing interest on the underlying tokens before pushing new rates.

## v4.9.1
### Prudentia
#### Controllers
- Allow pausing updates for a token without a configuration: This allows us to manually push rates (which requires a config) before any updates occur.
- Add another kickback prevention to PidController#manuallyPushRate and PidController unpausing.

## v4.9.0
### Dependencies
- Upgrade adrastia-core to v4.9.0.
- Upgrade OpenZeppelin Contracts to v4.9.6

### Accumulators
- Add ManagedSAVPriceAccumulator: A managed accumulator that tracks ERC4626 vault share prices.

## v4.8.1
### Prudentia
#### Controllers
- Adjust role hierarchy to make UPDATER_ADMIN self-managed.
- Add IonicPidController: A PidController that accrues interest on Ionic tokens.

## v4.8.0
### Dependencies
- Upgrade adrastia-core to v4.8.0.

### Accumulators
- Add ManagedAdrastiaUtilizationAndErrorAccumulator: An AdrastiaUtilizationAndErrorAccumulator that implements standard management functions.

## v4.7.4
### Prudentia
#### Computers
- Update HistoricalRatesComputer to implement IHistoricalRates and add an auxiliary function to get the select index.

## v4.7.3
### Oracles
- Update managed aggregator oracles: Add the ability to change the default config (strategies and aggregation params).

## v4.7.2
### Dependencies
- Upgrade adrastia-core to v4.7.1.

### Accumulators
- Add constructor args validation and events to AccumulatorConfig.

## v4.7.1
### Prudentia
#### Controllers
- Update RateController
  - canUpdate now returns false if it's unable to compute the next rate
  - computeRate now reverts if the config hasn't been set

## v4.7.0
### Dependencies
- Upgrade adrastia-core to v4.7.0.

### Accumulators
- Update ManagedAlocUtilizationAndErrorAccumulator: Added a flag to consider an empty portfolio as 0% utilized.

### Prudentia
#### Computers
- Add HistoricalRatesComputer: An IRateComputer that fetches historical rates from an IHistoricalRates contract.
- Add ManagedHistoricalRatesComputer: A HistoricalRatesComputer that implements standard management functions.
- Add SlopedOracleMutationComputer: An OracleMutationComputer that applies a two-part slope function to the value returned by an oracle.
- Add ManagedSlopedOracleMutationComputer: A SlopedOracleMutationComputer that implements standard management functions.

## v4.6.2
### Prudentia
#### Controllers
- Update RateController
  - Allow unrestricted individual component weights
  - Allow total component weights to be above 100%
  - Modify computeRateInternal to cap the rate to the max possible value to prevent overflow

## v4.6.1
### Dependencies
- Upgrade adrastia-core to v4.6.1.

### Accumulators
- Update ManagedCompoundV2SBAccumulator, ManagedIonicSBAccumulator, and ManagedVenusIsolatedV2SBAccumulator: Out of an abundance of caution, only those with the CONFIG_ADMIN role can refresh token mappings.

## v4.6.0
### Dependencies
- Upgrade adrastia-core to v4.6.0.

### Accumulators
- Add ManagedVenusIsolatedV2SBAccumulator: A VenusIsolatedV2SBAccumulator that implements standard management functions.

## v4.5.0
### Dependencies
- Upgrade adrastia-core to v4.5.0.

### Accumulators
- Add ManagedCompoundV2SBAccumulator: A CompoundV2SBAccumulator that implements standard management functions.
- Add ManagedIonicSBAccumulator: An IonicSBAccumulator that implements standard management functions.

## v4.4.0
### Dependencies
- Upgrade adrastia-core to v4.4.0.

### Accumulators
- Add ManagedAlocUtilizationAndErrorAccumulator: An AlocUtilizationAndErrorAccumulator that implements standard management functions.

### Prudentia
#### Controllers
- Add PidController: A RateController extension that implements a PID controller.
- Add ManagedPidController: A PidController that implements standard management functions.
- Add TrueFiAlocPidController: A ManagedPidController designed for integration into TrueFi.
#### Transformers
- Add IInputAndErrorTransformer: Interface for transforming input and error values in a PID controller.
- Add NegativeErrorScalingTransformer: Implements the IInputAndErrorTransformer interface to scale negative error values.
- Add PositiveErrorScalingTransformer: Implements the IInputAndErrorTransformer interface to scale positive error values.

## v4.3.0
### Dependencies
- Upgrade adrastia-core to v4.3.0.

### Accumulators
- Add ManagedAdrastiaPriceAccumulator

## v4.2.0
### Dependencies
- Upgrade adrastia-core to v4.2.0.

### Accumulators
- Ensure heartbeat is not zero in setConfig
- Revert if the config is unchanged in setConfig

### Oracles
- Revert if the pause status is unchanged in setUpdatesPaused
- Revert if the token config is unchanged in setTokenConfig
- Revert if the config is unchanged in setConfig

### Prudentia
#### Controllers
- Revert if a component has zero weight in setConfig
- Revert if duplicate components are provided in setConfig
- Revert if the pause status is unchanged in setUpdatesPaused
- Fix precision loss error in computeRateInternal

## v4.1.0
### Accumulators
- Add ManagedCometSBAccumulator and ManagedAaveV3SBAccumulator
  - Allows for calculations of time-weighted average total supply and borrow amounts for Aave V3 and Compound III (Comet) pools.
### Prudentia
#### Computers
- Add [Managed/Aave]OracleMutationComputer: A contract that computes mutated values from Adrastia oracles.

### Prudentia
#### Controllers
- Make RateController#computeRate return a clamped rate.
- Add 64 bits of config storage space for user extensions.
- Add [Managed]CapController: A special-purpose rate controller for supply&borrow cap management.
- Add AaveCapController: A special-purpose rate controller for Aave V3 supply&borrow cap management that feeds into the Aave v3 config engine and uses the Aave ACL manager for permissioning.
- Add AaveRateController: A rate controller that uses the Aave ACL manager for permissioning.
#### Computers
- Add MutatedValueComputer: An abstract contract for computing mutated values.
- Add [Managed]ERC20MutationComputer: An abstract contract for computing mutated values from tokens, with decimal trimming and scaling.
- Add AaveV3BorrowMutationComputer: A contract for computing Aave v3 total borrow mutated values.
- Add AaveV3SupplyMutationComputer: A contract for computing Aave v3 total supply mutated values.
- Add CTokenBorrowMutationComputer: A contract for computing Compound v2 total borrow mutated values.
- Add CTokenSupplyMutationComputer: A contract for computing Compound v2 total supply mutated values.
- Add CometBorrowMutationComputer: A contract for computing Compound III (Comet) total borrow mutated values.
- Add CometSupplyMutationComputer: A contract for computing Compound III (Comet) total supply mutated values.
- Add CometCollateralMutationComputer: A contract for computing Compound III (Comet) total collateral mutated values.

## v4.0.0
### Dependencies
- Upgrade adrastia-core to v4.0.0.

### Accumulators
- Add AccumulatorConfig: A base contract for managing the configuration of an accumulator.
  - All accumulators now extend this contract.
- Update the role hierarchy:
  - ADMIN
    - CONFIG_ADMIN
    - UPDATER_ADMIN
      - ORACLE_UPDATER
- Add ManagedOffchainPriceAccumulator and ManagedOffchainLiquidityAccumulator.
- Add managed interest rate accumulators for Compound v2, Compound III, Aave v2, and Aave v3.
- Add managed price and liquidity accumulators for Balancer v2.
- Add managed price and liquidity accumulators for Algebra DEX.

### Bounties
- Add PriceManipulationBounty: A contract for setting up and claiming bounties against price manipulation.


### Oracles
- Add ManagedPeriodicPriceAccumulationOracle.
- Add IOracleAggregatorTokenConfig and OracleAggregatorTokenConfig: These config contracts allow config admins to update oracle aggregator configurations.
- Add ManagedCurrentAggregatorOracle.
- Add the ability to pause updates to the aggregators.
- Add ManagedMedianFilteringOracle.
- Add ManagedPriceVolatilityOracle.

### Rates (Prudentia)
- Add RateController and related contracts: A contract that periodically computes and stores rates for tokens.
- Add ManualRateComputer: A contract that computes rates based on manual input by an authorized rate configurator.

### Compatibility
- Add AdrastiaPoweredPriceOracle: A contract that adapts an IPriceOracle implementation to be used with AggregatorV3Interface.

## v3.0.0
- Upgrade adrastia-core to v3.0.0

## v2.0.0
- Upgrade adrastia-core to v2.0.0

## v1.0.0
- Upgrade pythia-core from v1.0.0-rc.11 to v1.0.0

## v1.0.0-rc.8
- Upgrade pythia-core from v1.0.0-rc.10 to v1.0.0-rc.11

## v1.0.0-rc.7
- Upgrade pythia-core from v1.0.0-rc.9 to v1.0.0-rc.10
- Upgrade solc from v0.8.11 to v0.8.13