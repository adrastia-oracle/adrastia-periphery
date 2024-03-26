# Changelog

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