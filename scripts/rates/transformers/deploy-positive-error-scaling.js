const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const numerator = 2;
    const denominator = 1;

    const contractName = "PositiveErrorScalingTransformer";
    const factory = await ethers.getContractFactory(contractName);
    const transformer = await factory.deploy(numerator, denominator);
    await transformer.deployed();

    console.log(contractName + " deployed to:", transformer.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
