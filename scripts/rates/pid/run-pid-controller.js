const { BigNumber } = require("ethers");
const hre = require("hardhat");

const rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ethers = hre.ethers;

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const MAX_UINT64 = ethers.BigNumber.from(2).pow(64).sub(1);
const MAX_UINT32 = ethers.BigNumber.from(2).pow(32).sub(1);

async function handleInput(actions) {
    const ac = new AbortController();
    const signal = ac.signal;

    var hasAnswer = false;

    rl.question("Select an option: ", { signal }, async (answer) => {
        if (answer.toLocaleLowerCase() === "pn+") {
            await actions["increaseKPNum"]();
        } else if (answer.toLocaleLowerCase() === "pn-") {
            await actions["decreaseKPNum"]();
        } else if (answer.toLocaleLowerCase() === "pd+") {
            await actions["increaseKPDen"]();
        } else if (answer.toLocaleLowerCase() === "pd-") {
            await actions["decreaseKPDen"]();
        } else if (answer.toLocaleLowerCase() === "in+") {
            await actions["increaseKINum"]();
        } else if (answer.toLocaleLowerCase() === "in-") {
            await actions["decreaseKINum"]();
        } else if (answer.toLocaleLowerCase() === "id+") {
            await actions["increaseKIDen"]();
        } else if (answer.toLocaleLowerCase() === "id-") {
            await actions["decreaseKIDen"]();
        } else if (answer.toLocaleLowerCase() === "dn+") {
            await actions["increaseKDNum"]();
        } else if (answer.toLocaleLowerCase() === "dn-") {
            await actions["decreaseKDNum"]();
        } else if (answer.toLocaleLowerCase() === "dd+") {
            await actions["increaseKDDen"]();
        } else if (answer.toLocaleLowerCase() === "dd-") {
            await actions["decreaseKDDen"]();
        } else if (answer.toLocaleLowerCase() === "+") {
            await actions["increaseInput"]();
        } else if (answer.toLocaleLowerCase() === "++") {
            await actions["increaseInput"]();
            await actions["increaseInput"]();
        } else if (answer.toLocaleLowerCase() === "+++") {
            await actions["increaseInput"]();
            await actions["increaseInput"]();
            await actions["increaseInput"]();
        } else if (answer.toLocaleLowerCase() === "-") {
            await actions["decreaseInput"]();
        } else if (answer.toLocaleLowerCase() === "--") {
            await actions["decreaseInput"]();
            await actions["decreaseInput"]();
        } else if (answer.toLocaleLowerCase() === "---") {
            await actions["decreaseInput"]();
            await actions["decreaseInput"]();
            await actions["decreaseInput"]();
        } else if (answer.toLocaleLowerCase() === "pause") {
            await actions["pause"]();
        } else if (answer.toLocaleLowerCase() === "unpause") {
            await actions["unpause"]();
        }

        hasAnswer = true;
    });

    while (!hasAnswer && !signal.aborted) {
        await sleep(100);
    }
}

async function main() {
    const coin = USDC;
    const period = 24 * 60 * 60; // 24 hours
    const initialBufferCardinality = 2;
    const updatersMustBeEoa = true;
    const [signer] = await ethers.getSigners();
    const newAdmin = "";
    const assignAllRolesToAdmin = true;
    const inputPrecisionDecimals = 8;
    const outputPrecisionDecimals = 4;
    const deltaTerm = 20;
    const errorScalarNumerator = BigNumber.from(2);
    const errorScalarDenominator = BigNumber.from(1);

    const startingRate = ethers.utils.parseUnits("0.08", outputPrecisionDecimals); // 8% APY
    var target = ethers.utils.parseUnits("0.9", inputPrecisionDecimals);
    var input = ethers.utils.parseUnits("1.0", inputPrecisionDecimals);

    // The following configuration assumes that 1e18 = 100% for rates

    // The maximum rate
    const max = ethers.utils.parseUnits("0.2", outputPrecisionDecimals); // 20%
    // The minimum rate
    const min = ethers.utils.parseUnits("0.01", outputPrecisionDecimals); // 1%
    // The maximum increase in the rate per update
    const maxIncrease = ethers.utils.parseUnits("0.1", outputPrecisionDecimals); // 10%
    // The maximum decrease in the rate per update
    const maxDecrease = ethers.utils.parseUnits("0.1", outputPrecisionDecimals); // 10%
    // The maximum percent increase in the rate per update
    const maxPercentIncrease = BigNumber.from(10000); // 100%
    // The maximum percent decrease in the rate per update
    const maxPercentDecrease = BigNumber.from(10000); // 100%

    var kPNumerator = -100;
    var kPDenominator = 100_000_000;
    var kINumerator = -100;
    var kIDenominator = 100_000_000;
    var kDNumerator = -0;
    var kDDenominator = 10_000;
    var paused = false;

    const rateConfig = {
        max: max,
        min: min,
        maxIncrease: maxIncrease,
        maxDecrease: maxDecrease,
        maxPercentIncrease: maxPercentIncrease,
        maxPercentDecrease: maxPercentDecrease,
        base: ethers.BigNumber.from(0),
        componentWeights: [],
        components: [],
    };

    var transformerAddress = ethers.constants.AddressZero;
    if (errorScalarNumerator !== undefined && errorScalarDenominator !== undefined) {
        const transformerFactory = await ethers.getContractFactory("NegativeErrorScalingTransformer");
        const transformer = await transformerFactory.deploy(errorScalarNumerator, errorScalarDenominator);
        await transformer.deployed();

        transformerAddress = transformer.address;

        console.log("Transformer deployed to:", transformerAddress);
    }

    const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
    const oracle = await oracleFactory.deploy();
    await oracle.deployed();

    await oracle.setTarget(coin, target);
    await oracle.setInput(coin, input);

    const contractName = "ManagedPidController";
    const factory = await ethers.getContractFactory(contractName);
    const rateController = await factory.deploy(oracle.address, period, initialBufferCardinality, updatersMustBeEoa);
    await rateController.deployed();

    console.log(contractName + " deployed to:", rateController.address);

    if (newAdmin) {
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

            // Revoke the deployer's updater admin role
            await tryRevokeRole(rateController, deployer.address, ORACLE_UPDATER_MANAGER_ROLE);
        }

        // Revoke the deployer's admin role
        await tryRevokeRole(rateController, deployer.address, ADMIN_ROLE);
    } else {
        if (assignAllRolesToAdmin) {
            // Get our address
            const [deployer] = await ethers.getSigners();

            // Grant the deployer all roles
            await tryGrantRole(rateController, deployer.address, ORACLE_UPDATER_MANAGER_ROLE);
            await tryGrantRole(rateController, deployer.address, ORACLE_UPDATER_ROLE);
            await tryGrantRole(rateController, deployer.address, RATE_ADMIN_ROLE);
            await tryGrantRole(rateController, deployer.address, UPDATE_PAUSE_ADMIN_ROLE);
        }
    }

    console.log(contractName + " access control configured");

    // Set the rate config
    console.log("Setting rate config...", rateConfig);
    await rateController.setConfig(coin, rateConfig);

    // Set the starting rate
    console.log("Setting starting rate...");
    await rateController.manuallyPushRate(coin, startingRate, startingRate, 1);

    // Set the PID parameters
    console.log("Setting PID config...");

    const updatePidConfig = async () => {
        await rateController.setPidConfig(coin, {
            inputAndErrorOracle: ethers.constants.AddressZero,
            kPNumerator: kPNumerator,
            kPDenominator: kPDenominator,
            kINumerator: kINumerator,
            kIDenominator: kIDenominator,
            kDNumerator: kDNumerator,
            kDDenominator: kDDenominator,
            transformer: transformerAddress,
        });
    };

    await updatePidConfig();

    console.log("Starting...");

    while (true) {
        try {
            await sleep(1000);

            // Perform update if needed
            const checkData = ethers.utils.defaultAbiCoder.encode(["address"], [coin]);
            var updateTx = undefined;
            var updateReceipt = undefined;
            if (await rateController.canUpdate(checkData)) {
                updateTx = await rateController.update(checkData);
                updateReceipt = await updateTx.wait();
            }

            const output = await rateController.computeRate(coin);

            console.clear();

            if (updateReceipt !== undefined) {
                console.log(
                    "\u001b[" + 93 + "m" + "Controller updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            console.log("Target: %s%", ethers.utils.formatUnits(target, inputPrecisionDecimals - 2));
            console.log("Input: %s%", ethers.utils.formatUnits(input, inputPrecisionDecimals - 2));
            console.log("Output: %s%", ethers.utils.formatUnits(output, outputPrecisionDecimals - 2));

            // Advance the time by period seconds
            await hre.network.provider.send("evm_increaseTime", [period]);
            await hre.network.provider.send("evm_mine");

            const actions = {
                increaseKPNum: async () => {
                    kPNumerator += deltaTerm;
                    console.log("kPNumerator:", kPNumerator);

                    await updatePidConfig();
                },
                decreaseKPNum: async () => {
                    kPNumerator -= deltaTerm;
                    console.log("kPNumerator:", kPNumerator);

                    await updatePidConfig();
                },
                increaseKPDen: async () => {
                    kPDenominator += deltaTerm;
                    console.log("kPDenominator:", kPDenominator);

                    await updatePidConfig();
                },
                decreaseKPDen: async () => {
                    kPDenominator -= deltaTerm;
                    console.log("kPDenominator:", kPDenominator);

                    await updatePidConfig();
                },
                increaseKINum: async () => {
                    kINumerator += deltaTerm;
                    console.log("kINumerator:", kINumerator);

                    await updatePidConfig();
                },
                decreaseKINum: async () => {
                    kINumerator -= deltaTerm;
                    console.log("kINumerator:", kINumerator);

                    await updatePidConfig();
                },
                increaseKIDen: async () => {
                    kIDenominator += deltaTerm;
                    console.log("kIDenominator:", kIDenominator);

                    await updatePidConfig();
                },
                decreaseKIDen: async () => {
                    kIDenominator -= deltaTerm;
                    console.log("kIDenominator:", kIDenominator);

                    await updatePidConfig();
                },
                increaseKDNum: async () => {
                    kDNumerator += deltaTerm;
                    console.log("kDNumerator:", kDNumerator);

                    await updatePidConfig();
                },
                decreaseKDNum: async () => {
                    kDNumerator -= deltaTerm;
                    console.log("kDNumerator:", kDNumerator);

                    await updatePidConfig();
                },
                increaseKDDen: async () => {
                    kDDenominator += deltaTerm;
                    console.log("kDDenominator:", kDDenominator);

                    await updatePidConfig();
                },
                decreaseKDDen: async () => {
                    kDDenominator -= deltaTerm;
                    console.log("kDDenominator:", kDDenominator);

                    await updatePidConfig();
                },
                increaseInput: async () => {
                    input = input.add(ethers.utils.parseUnits("0.1", inputPrecisionDecimals));
                    console.log("Input:", ethers.utils.formatUnits(input, inputPrecisionDecimals));

                    await oracle.setInput(coin, input);
                },
                decreaseInput: async () => {
                    input = input.sub(ethers.utils.parseUnits("0.1", inputPrecisionDecimals));
                    console.log("Input:", ethers.utils.formatUnits(input, inputPrecisionDecimals));

                    await oracle.setInput(coin, input);
                },
                pause: async () => {
                    paused = true;
                    console.log("Paused:", paused);

                    await rateController.setUpdatesPaused(coin, paused);
                },
                unpause: async () => {
                    paused = false;
                    console.log("Paused:", paused);

                    await rateController.setUpdatesPaused(coin, paused);
                },
            };

            await handleInput(actions);
        } catch (e) {
            console.error(e);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
