const hre = require("hardhat");

// The type of market to compute the rate for
const BORROW = "CometBorrowMutationComputer";
const SUPPLY = "CometSupplyMutationComputer";
const COLLATERAL = "CometCollateralMutationComputer";

const contractAddress = "";

// Replace this address with the address of the Comet contract
const comet = "";
// 1x scalar
const oneXScalar = ethers.BigNumber.from(10).pow(6);
// The type of market to compute the rate for (BORROW or SUPPLY)
const type = SUPPLY;

async function main() {
    const contractName = type;

    await hre.run("verify:verify", {
        contract: "contracts/rates/computers/proto/compound/" + contractName + ".sol:" + contractName,
        address: contractAddress,
        constructorArguments: [comet, oneXScalar, 18, 0],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
