const hre = require("hardhat");

const ethers = hre.ethers;

const aggregationStrategies = {
    arbitrum: {
        median: "0xC7E8e1daB09e7E29cda87C32DBDf34b8E2859003",
        minimum: "0xC2273620B48BBbC38D193B7aaa05A9594668c0D6",
        maximum: "0xc5DFF7Ce4A8D6B98c6eb70ACa1C5527d8147e539",
    },
    optimism: {
        median: "0x2a0755Ca1EbcB9c37C883c09DE5202b3cc7b7470",
        minimum: "0x248Ab376F7dB8B06e7c9EA1dE3E746d47Ee489c3",
        maximum: "0x10E514cEF50424306eDD391b2d4cB016930E1cc2",
    },
    polygon: {
        median: "0x021e3bd203144ae330a766d4076040a48fea6122",
        minimum: "0x90C8E14d36bfc6ea6c871F5874eE095631d4eDC6",
        maximum: "0x92Eb6895550Fd2EFc1519De69f8b85A819A1fDC1",
    },
};

const oracles = {
    arbitrum: {
        "chainlink-eth-usd": "0x8aC5f2E2960fb3d022cD45f5410201c5bFc95891",
        "pyth-eth-usd": "0x4e22Ea0CB77B5aE0085551EF0fC5026C82c07e1D",
        "median-dao-usd": "0x41F14ed7e7E8034a5EB4EC72BdE3C94F91ECfa10",
        "liquidation-oracle-usd": "0x9EdaB5295260AC27c13564E4827b73408C132270",
    },
    optimism: {
        "chainlink-eth-usd": "0x00922ad039612B8b2DD9a8b10e6a834cec74B9DC",
        "pyth-eth-usd": "0xc68a2bBfE00786B2710FfDe68e03Fa80654280Ce",
        "median-dao-usd": "0x4Ace7Ed2941774FE9Ec58e0CeD53F91fCFe7e4cc",
        "liquidation-oracle-usd": "0x8950365aAAe83aa8CFAD779457423ac2D8FF8Ce0",
    },
    polygon: {
        "chainlink-eth-usd": "0xeb0FF74b91F46b1d5BB4402736D6DFEfc1B0f532",
        "pyth-eth-usd": "0x9b5b125dae8e21eb0207430c229f11198bd116fc",
        "median-dao-usd": "0xe6D09cD4a7f59B1be72513E7F3BA425b81e00948",
        "liquidation-oracle-usd": "0x0D32b0B3D75Ad5209BAA2DC8E0E7a2cF698a5551",
    },
};

async function main() {
    const chain = "optimism";

    // The address of the aggregation strategy.
    const aggregationStrategy = aggregationStrategies[chain].maximum;

    // The address of the validation strategy. Can be the zero address to skip validation.
    const validationStrategy = ethers.constants.AddressZero;

    // The minimum number of underlying oracle responses required to perform an update.
    const minimumResponses = 2;

    // An array of the underlying oracle addresses.
    const oracles_ = [oracles[chain]["median-dao-usd"], oracles[chain]["liquidation-oracle-usd"]];

    const factory = await ethers.getContractFactory("OracleAggregatorTokenConfig");
    const config = await factory.deploy(aggregationStrategy, validationStrategy, minimumResponses, oracles_);
    await config.deployed();

    console.log("OracleAggregatorTokenConfig deployed to:", config.address);

    console.log("Waiting for 30 seconds...");

    await new Promise((resolve) => setTimeout(resolve, 30000));

    console.log("Verifying contract...");

    const contractAddress = config.address;

    await hre.run("verify:verify", {
        contract: "contracts/oracles/configs/OracleAggregatorTokenConfig.sol:OracleAggregatorTokenConfig",
        address: contractAddress,
        constructorArguments: [aggregationStrategy, validationStrategy, minimumResponses, oracles_],
    });

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
