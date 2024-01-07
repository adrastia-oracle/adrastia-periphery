const hre = require("hardhat");

const contractAddress = "0x7f2584858375Da8b42D0a5CabA5b6cdbE32F1b65";

const numerator = 2;
const denominator = 1;

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/rates/transformers/PositiveErrorScalingTransformer.sol:PositiveErrorScalingTransformer",
        address: contractAddress,
        constructorArguments: [numerator, denominator],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
