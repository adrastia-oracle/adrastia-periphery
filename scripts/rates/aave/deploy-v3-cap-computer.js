const hre = require("hardhat");

const ethers = hre.ethers;

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

async function tryGrantRole(contract, account, role) {
    console.log("Granting role", role, "to", account, "on", contract.address);

    var executed = false;

    for (var i = 0; i < 10; i++) {
        try {
            const tx = await contract.grantRole(role, account);

            console.log("  - Tx hash", tx.hash);

            const receipt = await tx.wait();

            if (receipt.status) {
                executed = true;

                break;
            }
        } catch (e) {
            console.error(e);
            console.log("Failed to grant role, retrying...");
            await new Promise((r) => setTimeout(r, 10000));
        }
    }

    if (!executed) {
        throw new Error(
            "Failed to grant role for contract " +
                contract.address +
                " and account " +
                account +
                " and role " +
                role +
                " after 10 attempts"
        );
    }
}

async function tryRevokeRole(contract, account, role) {
    console.log("Revoking role", role, "to", account, "on", contract.address);

    var executed = false;

    for (var i = 0; i < 10; i++) {
        try {
            const tx = await contract.revokeRole(role, account);

            console.log("  - Tx hash", tx.hash);

            const receipt = await tx.wait();

            if (receipt.status) {
                executed = true;

                break;
            }
        } catch (e) {
            console.error(e);
            console.log("Failed to grant role, retrying...");
            await new Promise((r) => setTimeout(r, 10000));
        }
    }

    if (!executed) {
        throw new Error(
            "Failed to grant role for contract " +
                contract.address +
                " and account " +
                account +
                " and role " +
                role +
                " after 10 attempts"
        );
    }
}

// The type of market to compute the rate for
const BORROW = "Borrow";
const SUPPLY = "Supply";

async function main() {
    // START OF USER CONFIGURATION

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

    // END OF USER CONFIGURATION

    const [deployer] = await hre.ethers.getSigners();

    const contractName = "AaveV" + aaveVersion + type + "MutationComputer";

    console.log("Deploying " + contractName + " with account:", deployer.address);

    const computerFactory = await hre.ethers.getContractFactory(contractName);
    const computer = await computerFactory.deploy(aclManager, lendingPoolAddress, oneXScalar, 18, 0);

    await computer.deployed();

    console.log(contractName + " deployed to:", computer.address);

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
