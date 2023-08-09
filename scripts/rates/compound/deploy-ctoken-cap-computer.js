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
const BORROW = "CTokenBorrowMutationComputer";
const SUPPLY = "CTokenSupplyMutationComputer";

async function main() {
    // START OF USER CONFIGURATION

    // 1x scalar
    const oneXScalar = ethers.BigNumber.from(10).pow(6);
    // The type of market to compute the rate for (BORROW or SUPPLY)
    const type = SUPPLY;

    const newAdmin = "0xec89a5dd6c179c345EA7996AA879E59cB18c8484"; // Adrastia Admin
    const assignAllRolesToAdmin = true;

    // END OF USER CONFIGURATION

    const [deployer] = await hre.ethers.getSigners();

    const contractName = type;

    console.log("Deploying " + contractName + " with account:", deployer.address);

    const computerFactory = await hre.ethers.getContractFactory(contractName);
    const computer = await computerFactory.deploy(oneXScalar, 18, 0);

    await computer.deployed();

    console.log(contractName + " deployed to:", computer.address);

    if (newAdmin !== "") {
        console.log("Granting roles to the new admin...");

        await tryGrantRole(computer, newAdmin, ADMIN_ROLE);

        // Get our address
        const [deployer] = await ethers.getSigners();

        if (assignAllRolesToAdmin) {
            await tryGrantRole(computer, newAdmin, RATE_ADMIN_ROLE);
        }

        // Revoke the deployer's admin role
        await tryRevokeRole(computer, deployer.address, ADMIN_ROLE);
    }

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
