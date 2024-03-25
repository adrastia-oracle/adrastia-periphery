const hre = require("hardhat");

const contractAddress = "";

const numerator = 2;
const denominator = 1;

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/rates/transformers/NegativeErrorScalingTransformer.sol:NegativeErrorScalingTransformer",
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
