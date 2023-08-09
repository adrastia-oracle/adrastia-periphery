const hre = require("hardhat");

// The type of market to compute the rate for
const BORROW = "CTokenBorrowMutationComputer";
const SUPPLY = "CTokenSupplyMutationComputer";

const contractAddress = "0xd0e1d3AeCAd9ddABF8E22CcD1d2CF9aE3B4AD96f";

// 1x scalar
const oneXScalar = ethers.BigNumber.from(10).pow(6);
// The type of market to compute the rate for (BORROW or SUPPLY)
const type = SUPPLY;

async function main() {
    const contractName = type;

    await hre.run("verify:verify", {
        contract: "contracts/rates/computers/proto/compound/" + contractName + ".sol:" + contractName,
        address: contractAddress,
        constructorArguments: [oneXScalar, 18, 0],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
