const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const POLYGON_USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const POLYGON_WBTC = "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6";
const POLYGON_WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";

const POLYGON_AAVE_V3_SUPPLY_CAP_COMPUTER = "0x6853Db03894c5197671111cc7D86f2280e7fcC8e";
const POLYGON_AAVE_V3_BORROW_CAP_COMPUTER = "0x2d4506A825D031Af598463A67Da11BeC700b753a";

async function main() {
    const token = POLYGON_WBTC; // USDC on Polygon

    // The following configuration assumes all amounts are whole token amounts (no decimals)

    // The maximum rate
    const max = ethers.utils.parseUnits("1", 9); // 1,000,000,000
    // The minimum rate
    const min = ethers.utils.parseUnits("1", 0); // 1
    // The maximum increase in the rate per update
    const maxIncrease = BigNumber.from(5_000);
    // The maximum decrease in the rate per update
    const maxDecrease = BigNumber.from(0); // 0
    // The maximum percent increase in the rate per update
    const maxPercentIncrease = BigNumber.from(2000); // 20%
    // The maximum percent decrease in the rate per update
    const maxPercentDecrease = BigNumber.from(0); // 0%
    // The base rate
    const baseRate = BigNumber.from(0); // 0
    // Dynamic rate components
    const dynamicRateComponents = [
        {
            address: POLYGON_AAVE_V3_SUPPLY_CAP_COMPUTER, // Aave v3 supply cap computer on Polygon
            weight: BigNumber.from(10000), // 100%
        },
    ];

    // The component weights in the format ["weight1","weight2",...]
    const componentWeights =
        "[" + dynamicRateComponents.map((component) => '"' + component.weight.toString() + '"').join(",") + "]";
    // The component addresses in the format ["address1","address2",...]
    const componentAddresses = "[" + dynamicRateComponents.map((component) => `"${component.address}"`).join(",") + "]";

    // Assemble the configuration as a string
    const configuration =
        '["' +
        max.toString() +
        '","' +
        min.toString() +
        '","' +
        maxIncrease.toString() +
        '","' +
        maxDecrease.toString() +
        '","' +
        maxPercentIncrease.toString() +
        '","' +
        maxPercentDecrease.toString() +
        '","' +
        baseRate.toString() +
        '",' +
        componentWeights +
        "," +
        componentAddresses +
        "]";

    // Print the configuration
    console.log("RateController configuration for " + token + ": " + configuration);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
