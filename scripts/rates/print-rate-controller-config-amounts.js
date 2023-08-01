const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const token = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"; // WETH on Polygon

    // The following configuration assumes all amounts are whole token amounts (no decimals)

    // The maximum rate
    const max = ethers.utils.parseUnits("1", 9); // 1,000,000,000 WETH
    // The minimum rate
    const min = ethers.utils.parseUnits("1", 0); // 1 WETH
    // The maximum increase in the rate per update
    const maxIncrease = BigNumber.from(10000); // 10,000 WETH
    // The maximum decrease in the rate per update
    const maxDecrease = BigNumber.from(0); // 0 WETH
    // The maximum percent increase in the rate per update
    const maxPercentIncrease = BigNumber.from(2000); // 20%
    // The maximum percent decrease in the rate per update
    const maxPercentDecrease = BigNumber.from(0); // 0%
    // The base rate
    const baseRate = BigNumber.from(0); // 0 WETH
    // Dynamic rate components
    const dynamicRateComponents = [
        {
            address: "0xB2384aa8EA7374d5558e1d09c93304C086609821", // AaveV3SupplyMutationComputer on Polygon
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
