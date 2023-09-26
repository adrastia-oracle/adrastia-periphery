const hre = require("hardhat");

// The oracle's data slot
const DATA_SLOT_PRICE = 1;
const DATA_SLOT_LIQUIDITY_TOKEN = 2;
const DATA_SLOT_LIQUIDITY_QUOTETOKEN = 3;

// Supply & Borrow oracle data slots
const SUPPLY = DATA_SLOT_LIQUIDITY_QUOTETOKEN;
const BORROW = DATA_SLOT_LIQUIDITY_TOKEN;

const contractAddress = "0x2d4506A825D031Af598463A67Da11BeC700b753a";

// Replace this address with the address of the Aave ACL Manager on your desired network
const aclManager = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146"; // MockAaveACLManager on Polygon
// Replace this address with the address of the Adrastia oracle contract on your desired network
const oracle = "0xc0514a2A4eD8bA8cf3f9Bb71cC8d6e0cA0E5A4a7"; // Aave v3 S&B oracle on Polygon: v4.1.0
// Replace this with the data slot of the oracle to use
const dataSlot = BORROW;
// 1x scalar
const oneXScalar = ethers.BigNumber.from(10).pow(6);

async function main() {
    const contractName = "AaveOracleMutationComputer";

    await hre.run("verify:verify", {
        contract: "contracts/rates/computers/proto/aave/" + contractName + ".sol:" + contractName,
        address: contractAddress,
        constructorArguments: [aclManager, oracle, dataSlot, oneXScalar, 0],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
