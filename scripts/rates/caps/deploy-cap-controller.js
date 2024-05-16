const hre = require("hardhat");

const ethers = hre.ethers;

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

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

async function main() {
    const period = 24 * 60 * 60; // 24 hours
    const initialBufferCardinality = 2;
    const updatersMustBeEoa = true;
    const newAdmin = "0xec89a5dd6c179c345EA7996AA879E59cB18c8484"; // Adrastia Admin
    const assignAllRolesToAdmin = true;
    const anyoneCanUpdate = true;

    const factory = await ethers.getContractFactory("ManagedCapController");
    const rateController = await factory.deploy(period, initialBufferCardinality, updatersMustBeEoa);
    await rateController.deployed();

    console.log("ManagedCapController deployed to:", rateController.address);

    if (newAdmin !== "") {
        await tryGrantRole(rateController, newAdmin, ADMIN_ROLE);

        // Get our address
        const [deployer] = await ethers.getSigners();

        if (assignAllRolesToAdmin) {
            // Grant the deployer the updater admin role
            await tryGrantRole(rateController, deployer.address, ORACLE_UPDATER_MANAGER_ROLE);

            await tryGrantRole(rateController, newAdmin, ORACLE_UPDATER_MANAGER_ROLE);
            await tryGrantRole(rateController, newAdmin, ORACLE_UPDATER_ROLE);
            await tryGrantRole(rateController, newAdmin, RATE_ADMIN_ROLE);
            await tryGrantRole(rateController, newAdmin, UPDATE_PAUSE_ADMIN_ROLE);

            if (anyoneCanUpdate) {
                await tryGrantRole(rateController, ethers.constants.AddressZero, ORACLE_UPDATER_ROLE);
            }

            // Revoke the deployer's updater admin role
            await tryRevokeRole(rateController, deployer.address, ORACLE_UPDATER_MANAGER_ROLE);
        }

        // Revoke the deployer's admin role
        await tryRevokeRole(rateController, deployer.address, ADMIN_ROLE);
    }

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
