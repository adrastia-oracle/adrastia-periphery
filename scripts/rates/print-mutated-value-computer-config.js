const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);

async function main() {
    // Default 1x scalar. Make sure to verify that the computer uses the same 1x scaler.
    const oneXScalar = DEFAULT_ONE_X_SCALAR;

    const decimals = 4;

    // The maximum value that will be returned by the computer (up to 2^64-1)
    const max = ethers.BigNumber.from(2).pow(64).sub(1);
    // The minimum value that will be returned by the computer (up to 2^64-1)
    const min = ethers.utils.parseUnits("1", decimals);
    // The value to add after the value has been scaled by the scalar below
    const offset = ethers.utils.parseUnits("200000", decimals);
    // The scalar to multiply the value by before adding the offset
    const scalar = oneXScalar.add(oneXScalar.div(50)); // 1.02x

    const configuration =
        '["' + max.toString() + '","' + min.toString() + '","' + offset.toString() + '","' + scalar.toString() + '"]';

    console.log("max: " + max.toString());
    console.log("min: " + min.toString());
    console.log("offset: " + offset.toString());
    console.log("scalar: " + scalar.toString());

    // Print the configuration
    console.log("MutatedValueComputer configuration: " + configuration);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
