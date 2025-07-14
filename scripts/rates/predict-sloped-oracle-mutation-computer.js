const { formatUnits, parseUnits } = require("ethers/lib/utils");
const hre = require("hardhat");

const ethers = hre.ethers;

const CONTRACT_ADDRESS_SLOPED_IR_COMPUTER = "0x786881A6d1d3337d51c5bE56362452A4F265CB68";
const CONTRACT_ADDRESS_PID_COMPUTER = "0xC40753877CfeF6f50E13695395c58357505719F8";
const TOKEN_ADDRESS = "0xf0f161fda2712db8b566946122a5af183995e2ed";

const RATE_DECIMALS = 18;

const PREDICTIVE_UTILIZATION_RATE = parseUnits("0.99", RATE_DECIMALS);

async function main() {
    const contract = await ethers.getContractAt("SlopedOracleMutationComputer", CONTRACT_ADDRESS_SLOPED_IR_COMPUTER);
    const contractPid = await ethers.getContractAt("PidController", CONTRACT_ADDRESS_PID_COMPUTER);

    const pidRate = await contractPid.computeRate(TOKEN_ADDRESS);

    console.log(`Current PID rate (borrow): ${formatUnits(pidRate, RATE_DECIMALS - 2)}%`);

    // Predict the rate using an alternative utilization rate

    const slopeConfig = await contract.getSlopeConfig(TOKEN_ADDRESS);
    const generalConfig = await contract.getConfig(TOKEN_ADDRESS);
    const defaultOneXScalar = await contract.defaultOneXScalar();

    let predictedSlopeRate = slopeConfig.base.add(PREDICTIVE_UTILIZATION_RATE.mul(slopeConfig.baseSlope));

    if (PREDICTIVE_UTILIZATION_RATE.gt(slopeConfig.kink)) {
        predictedSlopeRate = predictedSlopeRate.add(
            PREDICTIVE_UTILIZATION_RATE.sub(slopeConfig.kink).mul(slopeConfig.kinkSlope)
        );
    }

    // Scale and add offset
    predictedSlopeRate = predictedSlopeRate.mul(generalConfig.scalar).div(defaultOneXScalar).add(generalConfig.offset);

    if (predictedSlopeRate.gt(generalConfig.max)) {
        predictedSlopeRate = generalConfig.max;
    } else if (predictedSlopeRate.lt(generalConfig.min)) {
        predictedSlopeRate = generalConfig.min;
    }

    console.log(`Predicted slope rate (borrow): ${formatUnits(predictedSlopeRate, RATE_DECIMALS - 2)}%`);

    const predictedRate = pidRate.add(predictedSlopeRate);

    console.log(`Predicted rate (borrow): ${formatUnits(predictedRate, RATE_DECIMALS - 2)}%`);

    const predictedSupplyRate = predictedRate.mul(PREDICTIVE_UTILIZATION_RATE).div(parseUnits("1", RATE_DECIMALS));

    console.log(`Predicted rate (supply): ${formatUnits(predictedSupplyRate, RATE_DECIMALS - 2)}%`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
