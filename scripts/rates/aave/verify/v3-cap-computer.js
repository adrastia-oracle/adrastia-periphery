const hre = require("hardhat");

// The type of market to compute the rate for
const BORROW = "Borrow";
const SUPPLY = "Supply";

const contractAddress = "0xa6250Bb81a5D8CbC7FA2ab501E2df58394c3CdaD";

// Replace this address with the address of the Aave ACL Manager on your desired network
const aclManager = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146"; // MockAaveACLManager on Polygon
// Replace this address with the address of the Aave Lending Pool on your desired network
const lendingPoolAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // v3 Polygon
// 1x scalar
const oneXScalar = ethers.BigNumber.from(10).pow(6);
// Aave version
const aaveVersion = 3;
// The type of market to compute the rate for (BORROW or SUPPLY)
const type = BORROW;

async function main() {
    const contractName = "AaveV3" + type + "MutationComputer";

    await hre.run("verify:verify", {
        contract: "contracts/rates/computers/proto/aave/" + contractName + ".sol:" + contractName,
        address: contractAddress,
        constructorArguments: [aclManager, lendingPoolAddress, oneXScalar, 18, 0],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
