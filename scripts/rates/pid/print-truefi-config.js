const hre = require("hardhat");

const ethers = hre.ethers;
const parseUnits = ethers.utils.parseUnits;
const BigNumber = ethers.BigNumber;

const POLYGON_POSITIVE_ERROR_SCALING_TRANSFORMER_2_1 = "0x7f2584858375Da8b42D0a5CabA5b6cdbE32F1b65"; // 2/1 scalar

const RATE_DECIMALS = 4;

const PORTFOLIO = "0xF0f9b11FC04B3Ee2C45BEE625e6a01BFB2efb944";
const TRANSFORMER = POLYGON_POSITIVE_ERROR_SCALING_TRANSFORMER_2_1;

async function printRateControllerConfig(token) {
    // The maximum rate
    const max = ethers.utils.parseUnits("0.2", RATE_DECIMALS); // 20%
    // The minimum rate
    const min = ethers.utils.parseUnits("0.01", RATE_DECIMALS); // 1%
    // The maximum increase in the rate per update
    const maxIncrease = ethers.utils.parseUnits("0.1", RATE_DECIMALS); // 10%
    // The maximum decrease in the rate per update
    const maxDecrease = ethers.utils.parseUnits("0.1", RATE_DECIMALS); // 10%
    // The maximum percent increase in the rate per update
    const maxPercentIncrease = BigNumber.from(10000); // 100%
    // The maximum percent decrease in the rate per update
    const maxPercentDecrease = BigNumber.from(10000); // 100%
    // The base rate
    const baseRate = ethers.constants.Zero;
    // Dynamic rate components
    const dynamicRateComponents = [];

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
    console.log("max = " + max.toString());
    console.log("min = " + min.toString());
    console.log("maxIncrease = " + maxIncrease.toString());
    console.log("maxDecrease = " + maxDecrease.toString());
    console.log("maxPercentIncrease = " + maxPercentIncrease.toString());
    console.log("maxPercentDecrease = " + maxPercentDecrease.toString());
    console.log("baseRate = " + baseRate.toString());
    console.log("componentWeights = " + componentWeights);
    console.log("componentAddresses = " + componentAddresses);
}

async function printRateControllerPidConfig(token) {
    // The following configuration is based on using 8 decimals for the input and 4 decimals for the output
    var kPNumerator = 500;
    var kPDenominator = 100_000_000;
    var kINumerator = 100;
    var kIDenominator = 100_000_000;
    var kDNumerator = 0;
    var kDDenominator = 10_000;
    const reverseError = true;
    var transformer = TRANSFORMER;

    // Assemble the configuration as a string
    const configuration =
        '["' +
        kPNumerator.toString() +
        '","' +
        kPDenominator.toString() +
        '","' +
        kINumerator.toString() +
        '","' +
        kIDenominator.toString() +
        '","' +
        kDNumerator.toString() +
        '","' +
        kDDenominator.toString() +
        '",' +
        reverseError +
        ',"' +
        transformer +
        '"]';

    // Print the configuration
    console.log("RateController PID configuration for " + token + ": " + configuration);
    console.log("kPNumerator = " + kPNumerator.toString());
    console.log("kPDenominator = " + kPDenominator.toString());
    console.log("kINumerator = " + kINumerator.toString());
    console.log("kIDenominator = " + kIDenominator.toString());
    console.log("kDNumerator = " + kDNumerator.toString());
    console.log("kDDenominator = " + kDDenominator.toString());
    console.log("reverseError = " + reverseError);
    console.log("transformer = " + transformer);
}

async function main() {
    console.log("=== TrueFi PID Controller Configuration ===");
    await printRateControllerConfig(PORTFOLIO);
    console.log("=== End TrueFi PID Controller Configuration ===\n");

    console.log("=== TrueFi PID Controller Starting Rate ===");
    const startingRate = parseUnits("0.08", RATE_DECIMALS); // 8% APY
    console.log("Starting rate = " + startingRate.toString());
    console.log("=== End TrueFi PID Controller Starting Rate ===\n");

    console.log("=== TrueFi PID Controller PID Configuration ===");
    await printRateControllerPidConfig(PORTFOLIO);
    console.log("=== End TrueFi PID Controller PID Configuration ===\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
