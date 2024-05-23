const hre = require("hardhat");

const parseUnits = hre.ethers.utils.parseUnits;

const CHANGE_PRECISION_DECIMALS = 8;

const UPDATE_THRESHOLD_0_1_PERCENT = parseUnits("0.001", CHANGE_PRECISION_DECIMALS); // 0.1%
const UPDATE_THRESHOLD_0_5_PERCENT = parseUnits("0.005", CHANGE_PRECISION_DECIMALS); // 0.5%
const UPDATE_THRESHOLD_1_PERCENT = parseUnits("0.01", CHANGE_PRECISION_DECIMALS); // 1%
const UPDATE_THRESHOLD_10_PERCENT = parseUnits("0.1", CHANGE_PRECISION_DECIMALS); // 10%

async function main() {
    const updateThreshold = UPDATE_THRESHOLD_0_1_PERCENT;
    const updateDelay = 10; // 10 seconds
    const heartbeat = 60 * 60 * 4; // 4 hours

    console.log("Update threshold:", updateThreshold.toNumber());
    console.log("Update delay:", updateDelay);
    console.log("Heartbeat:", heartbeat);

    // Assemble the configuration as a string
    const configuration =
        '["' + updateThreshold.toString() + '","' + updateDelay.toString() + '","' + heartbeat.toString() + '"]';

    // Print the configuration
    console.log("Accumulator config: " + configuration);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
