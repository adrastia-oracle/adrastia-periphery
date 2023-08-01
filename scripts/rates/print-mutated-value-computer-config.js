const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const token = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"; // WETH on Polygon

    // Default 1x scalar. Make sure to verify that the computer uses the same 1x scaler.
    const oneXScalar = ethers.BigNumber.from(10).pow(6);

    // The following configuration assumes all amounts are whole token amounts (no decimals)

    // The maximum value that will be returned by the computer (up to 2^64-1)
    const max = ethers.BigNumber.from(2).pow(64).sub(1);
    // The minimum value that will be returned by the computer (up to 2^64-1)
    const min = ethers.BigNumber.from(0);
    // The value to add after the value has been scaled by the scalar below
    const offset = ethers.BigNumber.from(100);
    // The scalar to multiply the value by before adding the offset
    const scalar = oneXScalar.add(oneXScalar.div(5)); // 1.2x

    const configuration =
        '["' + max.toString() + '","' + min.toString() + '","' + offset.toString() + '","' + scalar.toString() + '"]';

    // Print the configuration
    console.log("MutatedValueComputer configuration for " + token + ": " + configuration);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
