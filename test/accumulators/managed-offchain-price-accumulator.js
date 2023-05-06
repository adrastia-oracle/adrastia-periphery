const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
    abi: ARITHMETIC_AVERAGING_ABI,
    bytecode: ARITHMETIC_AVERAGING_BYTECODE,
} = require("@adrastia-oracle/adrastia-core/artifacts/contracts/strategies/averaging/ArithmeticAveraging.sol/ArithmeticAveraging.json");

const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function describePriceAccumulatorTests(contractName, deployFunction, updaterRoleCanBeOpen, smartContractsCanUpdate) {
    describe(contractName + "#update", function () {
        var accumulator;

        beforeEach(async () => {
            accumulator = await deployFunction();

            const [owner] = await ethers.getSigners();

            // Grant owner the oracle updater role
            await accumulator.grantRole(ORACLE_UPDATER_ROLE, owner.address);
        });

        describe("Only accounts with oracle updater role can update", function () {
            it("Accounts with oracle updater role can update", async function () {
                const price = ethers.utils.parseUnits("1.2357", 18);

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [WETH, price, await currentBlockTimestamp()]
                );

                expect(await accumulator.canUpdate(updateData)).to.equal(true);

                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");
            });

            it("Accounts without oracle updater role cannot update", async function () {
                const price = ethers.utils.parseUnits("1.2357", 18);

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [WETH, price, await currentBlockTimestamp()]
                );

                const [, addr1] = await ethers.getSigners();

                expect(await accumulator.connect(addr1).canUpdate(updateData)).to.equal(false);

                await expect(accumulator.connect(addr1).update(updateData)).to.be.revertedWith("AccessControl");

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                await expect(accumulator.connect(addr1).update(updateData)).to.be.revertedWith("AccessControl");
            });
        });

        describe("Smart contracts " + (smartContractsCanUpdate ? "can" : "can't") + " update", function () {
            var updateableCallerFactory;

            beforeEach(async function () {
                // Allow every address to update (if the role is open)
                await accumulator.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);

                updateableCallerFactory = await ethers.getContractFactory("UpdateableCaller");
            });

            if (updaterRoleCanBeOpen) {
                // Note: If the updater role is not open, we can't test this because we can't grant the role to the
                // updateable caller before it's deployed
                it((smartContractsCanUpdate ? "Can" : "Can't") + " update in the constructor", async function () {
                    const price = ethers.utils.parseUnits("1.2357", 18);

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [WETH, price, await currentBlockTimestamp()]
                    );

                    if (!smartContractsCanUpdate) {
                        await expect(
                            updateableCallerFactory.deploy(accumulator.address, true, updateData)
                        ).to.be.revertedWith("PriceAccumulator: MUST_BE_EOA");
                    } else {
                        await expect(updateableCallerFactory.deploy(accumulator.address, true, updateData)).to.not.be
                            .reverted;
                    }
                });
            }

            it((smartContractsCanUpdate ? "Can" : "Can't") + " update in a function call", async function () {
                const price = ethers.utils.parseUnits("1.2357", 18);

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [WETH, price, await currentBlockTimestamp()]
                );

                const updateableCaller = await updateableCallerFactory.deploy(accumulator.address, false, updateData);
                await updateableCaller.deployed();

                // Grant the updater role to the updateable caller
                await accumulator.grantRole(ORACLE_UPDATER_ROLE, updateableCaller.address);

                if (!smartContractsCanUpdate) {
                    await expect(updateableCaller.callUpdate()).to.be.revertedWith("PriceAccumulator: MUST_BE_EOA");
                } else {
                    await expect(updateableCaller.callUpdate()).to.not.be.reverted;
                }
            });
        });

        describe(
            "All accounts " +
                (updaterRoleCanBeOpen ? "can" : "cannot") +
                " update if the role is assigned to address(0)",
            function () {
                beforeEach(async () => {
                    // Grant everyone the oracle updater role
                    await accumulator.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);
                });

                it("Accounts with oracle updater role can still update", async function () {
                    const price = ethers.utils.parseUnits("1.2357", 18);

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [WETH, price, await currentBlockTimestamp()]
                    );

                    expect(await accumulator.canUpdate(updateData)).to.equal(true);

                    expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");

                    // Increase time so that the accumulator needs another update
                    await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                    // The second call has some different functionality, so ensure that the results are the same for it
                    expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");
                });

                it(
                    "Accounts without oracle updater role " + (updaterRoleCanBeOpen ? "can" : "cannot") + " update",
                    async function () {
                        const price = ethers.utils.parseUnits("1.2357", 18);

                        const updateData = ethers.utils.defaultAbiCoder.encode(
                            ["address", "uint", "uint"],
                            [WETH, price, await currentBlockTimestamp()]
                        );

                        const [owner, addr1] = await ethers.getSigners();

                        expect(await accumulator.connect(addr1).canUpdate(updateData)).to.equal(updaterRoleCanBeOpen);

                        if (updaterRoleCanBeOpen) {
                            await expect(accumulator.connect(addr1).update(updateData)).to.emit(accumulator, "Updated");

                            // Increase time so that the accumulator needs another update
                            await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                            // The second call has some different functionality, so ensure that the results are the same for it
                            await expect(accumulator.connect(addr1).update(updateData)).to.emit(accumulator, "Updated");
                        } else {
                            await expect(accumulator.connect(addr1).update(updateData)).to.be.reverted;

                            // The second call has some different functionality, so ensure that the results are the same for it
                            // We first make an update with the owner
                            await expect(accumulator.connect(owner).update(updateData)).to.emit(accumulator, "Updated");

                            // Increase time so that the accumulator needs another update
                            await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                            // We make sure that the other address still can't update
                            await expect(accumulator.connect(addr1).update(updateData)).to.be.reverted;
                        }
                    }
                );
            }
        );
    });

    describe(contractName + "#supportsInterface(interfaceId)", function () {
        var accumulator;
        var interfaceIds;

        beforeEach(async () => {
            accumulator = await deployFunction();

            const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
            interfaceIds = await interfaceIdsFactory.deploy();
        });

        it("Should support IAccessControl", async () => {
            const interfaceId = await interfaceIds.iAccessControl();
            expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });

        it("Should support IAccessControlEnumerable", async () => {
            const interfaceId = await interfaceIds.iAccessControlEnumerable();
            expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });
    });
}

async function deployOffchainPriceAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedOffchainPriceAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        USDC,
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

describePriceAccumulatorTests(
    "ManagedOffchainPriceAccumulator",
    deployOffchainPriceAccumulator,
    /*
    The role can't be open because updaters have full control over the data that the accumulator stores. There are
    no cases where it would be beneficial to allow anyone to update the accumulator.
    */
    false,
    /*
    Smart contracts can update the accumulator because there's no extra power that they would gain by being able to
    so. Updaters already have full control over the data that the accumulator stores.
    */
    true
);
