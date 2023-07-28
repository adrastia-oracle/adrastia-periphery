const hre = require("hardhat");

const contractAddress = "";

// The address of the aggregation strategy.
const aggregationStrategy = "";

// The address of the validation strategy. Can be the zero address to skip validation.
const validationStrategy = "";

// The minimum number of underlying oracle responses required to perform an update.
const minimumResponses = 1;

// An array of the underlying oracle addresses.
const oracles = [];

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/oracles/configs/OracleAggregatorTokenConfig.sol:OracleAggregatorTokenConfig",
        address: contractAddress,
        constructorArguments: [aggregationStrategy, validationStrategy, minimumResponses, oracles],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
