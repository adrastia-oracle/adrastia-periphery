const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
    abi: ARITHMETIC_AVERAGING_ABI,
    bytecode: ARITHMETIC_AVERAGING_BYTECODE,
} = require("@adrastia-oracle/adrastia-core/artifacts/contracts/strategies/averaging/ArithmeticAveraging.sol/ArithmeticAveraging.json");

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
const uniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const uniswapV3InitCodeHash = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

const algebraInitCodeHash = "0x6ec6c9c8091d160c0aa74b2b14ba9c1717e95093bd3ac085cee99a49aab294a4";

const balancerV2Vault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"; // Balancer v2 on mainnet
const balancerV2WeightedPoolId = "0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014"; // BAL/WETH on mainnet

const cometUSDC = "0xc3d688B66703497DAA19211EEdff47f25384cdc3"; // USDC market on mainnet
const aaveV3Pool = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"; // Aave v3 on mainnet

const UPDATER_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const CONFIG_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("CONFIG_ADMIN_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));
const TARGET_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TARGET_ADMIN_ROLE"));

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const BAL = "0xba100000625a3754423978a60c9317c58a424e3D";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

const DEFAULT_CONFIG = {
    updateThreshold: TWO_PERCENT_CHANGE,
    updateDelay: MIN_UPDATE_DELAY,
    heartbeat: MAX_UPDATE_DELAY,
};

const DEFAULT_DECIMALS = 18;

const DEFAULT_UTILIZATION_DECIMALS = 4;
const DEFAULT_UTILIZATION_TARGET = ethers.utils.parseUnits("0.85", DEFAULT_UTILIZATION_DECIMALS);

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function describeUtilizationAndErrorAccumulatorTests(contractName, deployFunction, getTokenFunc) {
    describe(contractName + "#setTarget", function () {
        var accumulator;
        var token;

        beforeEach(async function () {
            accumulator = await deployFunction();
            token = await getTokenFunc();
        });

        it("Reverts if the caller doesn't have any roles", async function () {
            const [, addr1] = await ethers.getSigners();

            await expect(accumulator.connect(addr1).setTarget(token, DEFAULT_UTILIZATION_TARGET)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the caller only has the CONFIG_ADMIN role", async function () {
            const [, addr1] = await ethers.getSigners();

            await accumulator.grantRole(CONFIG_ADMIN_ROLE, addr1.address);

            await expect(accumulator.connect(addr1).setTarget(token, DEFAULT_UTILIZATION_TARGET)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the caller only has the UPDATER_ADMIN role", async function () {
            const [, addr1] = await ethers.getSigners();

            await accumulator.grantRole(UPDATER_ADMIN_ROLE, addr1.address);

            await expect(accumulator.connect(addr1).setTarget(token, DEFAULT_UTILIZATION_TARGET)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the caller only has the ORACLE_UPDATER role", async function () {
            const [owner, addr1] = await ethers.getSigners();

            await accumulator.grantRole(UPDATER_ADMIN_ROLE, owner.address);
            await accumulator.grantRole(ORACLE_UPDATER_ROLE, addr1.address);

            await expect(accumulator.connect(addr1).setTarget(token, DEFAULT_UTILIZATION_TARGET)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the default target doesn't change", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            // Sanity check that the default target is as expected
            expect(await accumulator.getTarget(ethers.constants.AddressZero)).to.equal(DEFAULT_UTILIZATION_TARGET);

            await expect(
                accumulator.setTarget(ethers.constants.AddressZero, DEFAULT_UTILIZATION_TARGET)
            ).to.be.revertedWith("TargetNotChanged");
        });

        it("Reverts if the token-based target doesn't change", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            // Set the target for the token
            await accumulator.setTarget(token, DEFAULT_UTILIZATION_TARGET);

            await expect(accumulator.setTarget(token, DEFAULT_UTILIZATION_TARGET)).to.be.revertedWith(
                "TargetNotChanged"
            );
        });

        it("Works if the caller has the TARGET_ADMIN role, with a specific token", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            const tx = await accumulator.setTarget(token, target);

            // Expected events
            await expect(tx).to.emit(accumulator, "TargetInitialized").withArgs(token, true);
            await expect(tx).to.emit(accumulator, "TargetUpdated").withArgs(token, target);

            expect(await accumulator.getTarget(token)).to.equal(target);
        });

        it("Works if the caller has the TARGET_ADMIN role, with a specific token, for a second time", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            const target2 = target.sub(1);

            const tx = await accumulator.setTarget(token, target2);

            // Expected events
            await expect(tx).to.not.emit(accumulator, "TargetInitialized");
            await expect(tx).to.emit(accumulator, "TargetUpdated").withArgs(token, target2);

            expect(await accumulator.getTarget(token)).to.equal(target2);
        });

        it("Works if the caller has the TARGET_ADMIN role, setting the default target", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            const tx = await accumulator.setTarget(ethers.constants.AddressZero, target);

            // Expected events
            await expect(tx).to.not.emit(accumulator, "TargetInitialized");
            await expect(tx).to.emit(accumulator, "TargetUpdated").withArgs(ethers.constants.AddressZero, target);

            expect(await accumulator.getTarget(ethers.constants.AddressZero)).to.equal(target);
        });

        it("Works if the caller has the TARGET_ADMIN role, setting the default target, for a second time", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(ethers.constants.AddressZero, target);

            const target2 = target.sub(1);

            const tx = await accumulator.setTarget(ethers.constants.AddressZero, target2);

            // Expected events
            await expect(tx).to.not.emit(accumulator, "TargetInitialized");
            await expect(tx).to.emit(accumulator, "TargetUpdated").withArgs(ethers.constants.AddressZero, target2);

            expect(await accumulator.getTarget(ethers.constants.AddressZero)).to.equal(target2);
        });

        it("Reinitializes a target after it has been reverted to the default target, with the old target", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            // Revert to the default target
            await accumulator.revertToDefaultTarget(token);

            // Revert to the old target
            const tx = await accumulator.setTarget(token, target);

            // Expected events
            await expect(tx).to.emit(accumulator, "TargetInitialized").withArgs(token, true);
            await expect(tx).to.emit(accumulator, "TargetUpdated").withArgs(token, target);

            expect(await accumulator.getTarget(token)).to.equal(target);
        });

        it("Reinitializes a target after it has been reverted to the default target, with a new target", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            // Revert to the default target
            await accumulator.revertToDefaultTarget(token);

            // Set a new target
            const newTarget = target.sub(1);
            const tx = await accumulator.setTarget(token, newTarget);

            // Expected events
            await expect(tx).to.emit(accumulator, "TargetInitialized").withArgs(token, true);
            await expect(tx).to.emit(accumulator, "TargetUpdated").withArgs(token, newTarget);

            expect(await accumulator.getTarget(token)).to.equal(newTarget);
        });
    });

    describe(contractName + "#getTarget", function () {
        var accumulator;
        var token;

        beforeEach(async function () {
            accumulator = await deployFunction();
            token = await getTokenFunc();
        });

        it("Returns the default target if no target has been set", async function () {
            expect(await accumulator.getTarget(token)).to.equal(DEFAULT_UTILIZATION_TARGET);
        });

        it("Returns the target if it has been set", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            expect(await accumulator.getTarget(token)).to.equal(target);
        });

        it("Returns the default target if the target has been reverted to the default", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            await accumulator.revertToDefaultTarget(token);

            expect(await accumulator.getTarget(token)).to.equal(DEFAULT_UTILIZATION_TARGET);
        });
    });

    describe(contractName + "#isUsingDefaultTarget", function () {
        var accumulator;
        var token;

        beforeEach(async function () {
            accumulator = await deployFunction();
            token = await getTokenFunc();
        });

        it("Returns true if no target has been set", async function () {
            expect(await accumulator.isUsingDefaultTarget(token)).to.equal(true);
        });

        it("Returns true with address(0)", async function () {
            expect(await accumulator.isUsingDefaultTarget(ethers.constants.AddressZero)).to.equal(true);
        });

        it("Returns false if a target has been set", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            expect(await accumulator.isUsingDefaultTarget(token)).to.equal(false);
        });

        it("Returns true if the target has been reverted to the default", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            await accumulator.revertToDefaultTarget(token);

            expect(await accumulator.isUsingDefaultTarget(token)).to.equal(true);
        });
    });

    describe(contractName + "#revertToDefaultTarget", function () {
        var accumulator;
        var token;

        beforeEach(async function () {
            accumulator = await deployFunction();
            token = await getTokenFunc();
        });

        it("Reverts if the caller doesn't have any roles", async function () {
            const [, addr1] = await ethers.getSigners();

            await expect(accumulator.connect(addr1).revertToDefaultTarget(token)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the caller only has the CONFIG_ADMIN role", async function () {
            const [, addr1] = await ethers.getSigners();

            await accumulator.grantRole(CONFIG_ADMIN_ROLE, addr1.address);

            await expect(accumulator.connect(addr1).revertToDefaultTarget(token)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the caller only has the UPDATER_ADMIN role", async function () {
            const [, addr1] = await ethers.getSigners();

            await accumulator.grantRole(UPDATER_ADMIN_ROLE, addr1.address);

            await expect(accumulator.connect(addr1).revertToDefaultTarget(token)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the caller only has the ORACLE_UPDATER role", async function () {
            const [owner, addr1] = await ethers.getSigners();

            await accumulator.grantRole(UPDATER_ADMIN_ROLE, owner.address);
            await accumulator.grantRole(ORACLE_UPDATER_ROLE, addr1.address);

            await expect(accumulator.connect(addr1).revertToDefaultTarget(token)).to.be.revertedWith(
                /AccessControl: .*/
            );
        });

        it("Reverts if the token is already the default target", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            await expect(accumulator.revertToDefaultTarget(token)).to.be.revertedWith("AlreadyUsingDefaultTarget");
        });

        it("Reverts if the token is address(0)", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            await expect(accumulator.revertToDefaultTarget(ethers.constants.AddressZero)).to.be.revertedWith(
                "AlreadyUsingDefaultTarget"
            );
        });

        it("Reverts if the token is already using the default target, after reverting to the default tartget", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            await accumulator.revertToDefaultTarget(token);

            await expect(accumulator.revertToDefaultTarget(token)).to.be.revertedWith("AlreadyUsingDefaultTarget");
        });

        it("Works if the caller has the TARGET_ADMIN role", async function () {
            const [owner] = await ethers.getSigners();

            await accumulator.grantRole(TARGET_ADMIN_ROLE, owner.address);

            const target = DEFAULT_UTILIZATION_TARGET.sub(1);

            await accumulator.setTarget(token, target);

            const tx = await accumulator.revertToDefaultTarget(token);

            // Expected events
            await expect(tx).to.emit(accumulator, "TargetInitialized").withArgs(token, false);
            await expect(tx).to.not.emit(accumulator, "TargetUpdated");

            expect(await accumulator.isUsingDefaultTarget(token)).to.equal(true);
        });
    });
}

function describeLiquidityAccumulatorTests(
    contractName,
    deployFunction,
    generateUpdateDataFunction,
    updaterRoleCanBeOpen,
    smartContractsCanUpdate,
    getTokenFunc,
    describeAdditionalTests = undefined
) {
    describe(contractName + "#setConfig", function () {
        var accumulator;
        var token;

        beforeEach(async function () {
            accumulator = await deployFunction();

            const [owner] = await ethers.getSigners();

            // Grant owner the config admin role
            await accumulator.grantRole(CONFIG_ADMIN_ROLE, owner.address);

            token = await getTokenFunc();
        });

        it("Only accounts with config admin role can set config", async function () {
            const [, addr1] = await ethers.getSigners();

            expect(await accumulator.hasRole(CONFIG_ADMIN_ROLE, addr1.address)).to.equal(false);

            await expect(accumulator.connect(addr1).setConfig(DEFAULT_CONFIG)).to.be.revertedWith(/AccessControl: .*/);
        });

        it("Works", async function () {
            const config = {
                updateThreshold: TWO_PERCENT_CHANGE * 2,
                updateDelay: MIN_UPDATE_DELAY + 100,
                heartbeat: MAX_UPDATE_DELAY + 100,
            };

            const tx = await accumulator.setConfig(config);
            const receipt = await tx.wait();

            expect(receipt.events[0].event).to.equal("ConfigUpdated");
            // Expect that the first event parameter is the DEFAULT_CONFIG object
            expect(receipt.events[0].args[0]).to.deep.equal(Object.values(DEFAULT_CONFIG));
            // Expect that the second event parameter is the config object
            expect(receipt.events[0].args[1]).to.deep.equal(Object.values(config));

            expect(await accumulator.updateThreshold()).to.equal(config.updateThreshold);
            expect(await accumulator.updateDelay()).to.equal(config.updateDelay);
            expect(await accumulator.heartbeat()).to.equal(config.heartbeat);
        });

        it("Reverts if updateThreshold is 0", async function () {
            const config = {
                updateThreshold: 0,
                updateDelay: MIN_UPDATE_DELAY + 100,
                heartbeat: MAX_UPDATE_DELAY + 100,
            };

            await expect(accumulator.setConfig(config)).to.be.revertedWith("InvalidConfig");
        });

        it("Reverts if updateDelay is greater than heartbeat", async function () {
            const config = {
                updateThreshold: TWO_PERCENT_CHANGE * 2,
                updateDelay: MAX_UPDATE_DELAY + 100,
                heartbeat: MIN_UPDATE_DELAY + 100,
            };

            await expect(accumulator.setConfig(config)).to.be.revertedWith("InvalidConfig");
        });

        it("Reverts if the heartbeat is zero", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                updateDelay: 0,
                heartbeat: 0,
            };

            await expect(accumulator.setConfig(config)).to.be.revertedWith("InvalidConfig");
        });

        it("Reverts if the config remains unchanged", async function () {
            await expect(accumulator.setConfig(DEFAULT_CONFIG)).to.be.revertedWith("ConfigUnchanged");
        });
    });

    describe(contractName + "#update", function () {
        var accumulator;
        var token;

        beforeEach(async () => {
            accumulator = await deployFunction();

            const [owner] = await ethers.getSigners();

            // Grant owner the updater admin role
            await accumulator.grantRole(UPDATER_ADMIN_ROLE, owner.address);

            // Grant owner the oracle updater role
            await accumulator.grantRole(ORACLE_UPDATER_ROLE, owner.address);

            token = await getTokenFunc();
        });

        describe("Only accounts with oracle updater role can update", function () {
            it("Accounts with oracle updater role can update", async function () {
                const updateData = await generateUpdateDataFunction(accumulator, token);

                expect(await accumulator.canUpdate(updateData)).to.equal(true);

                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");
            });

            it("Accounts without oracle updater role cannot update", async function () {
                const updateData = await generateUpdateDataFunction(accumulator, token);

                const [, addr1] = await ethers.getSigners();

                expect(await accumulator.connect(addr1).canUpdate(updateData)).to.equal(false);

                const revertReason = updaterRoleCanBeOpen ? "MissingRole" : /AccessControl: .*/;

                await expect(accumulator.connect(addr1).update(updateData)).to.be.revertedWith(revertReason);

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                await expect(accumulator.connect(addr1).update(updateData)).to.be.revertedWith(revertReason);
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
                    const updateData = await generateUpdateDataFunction(accumulator, token);

                    if (!smartContractsCanUpdate) {
                        await expect(
                            updateableCallerFactory.deploy(accumulator.address, true, updateData)
                        ).to.be.revertedWith("LiquidityAccumulator: MUST_BE_EOA");
                    } else {
                        await expect(updateableCallerFactory.deploy(accumulator.address, true, updateData)).to.not.be
                            .reverted;
                    }
                });
            }

            it((smartContractsCanUpdate ? "Can" : "Can't") + " update in a function call", async function () {
                const updateData = await generateUpdateDataFunction(accumulator, token);

                const updateableCaller = await updateableCallerFactory.deploy(accumulator.address, false, updateData);
                await updateableCaller.deployed();

                // Grant the updater role to the updateable caller
                await accumulator.grantRole(ORACLE_UPDATER_ROLE, updateableCaller.address);

                if (!smartContractsCanUpdate) {
                    await expect(updateableCaller.callUpdate()).to.be.revertedWith("LiquidityAccumulator: MUST_BE_EOA");
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
                    const updateData = await generateUpdateDataFunction(accumulator, token);

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
                        const updateData = await generateUpdateDataFunction(accumulator, token);

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

        it("Should support IAccumulator", async () => {
            const interfaceId = await interfaceIds.iAccumulator();
            expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });
    });

    if (describeAdditionalTests) {
        describeAdditionalTests(contractName, deployFunction, getTokenFunc);
    }
}

async function deployOffchainLiquidityAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedOffchainLiquidityAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        USDC,
        DEFAULT_DECIMALS,
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function generateOffchainUpdateData(accumulator, token) {
    const tokenLiquidity = ethers.utils.parseUnits("2.35", 18);
    const quoteTokenLiquidity = ethers.utils.parseUnits("3.5711", 18);

    const updateData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint", "uint", "uint"],
        [token, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
    );

    return updateData;
}

async function deployCurveLiquidityAccumulator() {
    // Deploy the curve pool
    const poolFactory = await ethers.getContractFactory("CurvePoolStub");
    const curvePool = await poolFactory.deploy([WETH, USDC]);
    await curvePool.deployed();

    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedCurveLiquidityAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        curvePool.address,
        2,
        USDC,
        USDC,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployUniswapV2LiquidityAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedUniswapV2LiquidityAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        uniswapV2FactoryAddress,
        uniswapV2InitCodeHash,
        USDC,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployUniswapV3LiquidityAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedUniswapV3LiquidityAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        uniswapV3FactoryAddress,
        uniswapV3InitCodeHash,
        [3000],
        USDC,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployAlgebraLiquidityAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("AlgebraLiquidityAccumulatorStub");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        ethers.constants.AddressZero,
        algebraInitCodeHash,
        USDC,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployBalancerV2LiquidityAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedBalancerV2LiquidityAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        balancerV2Vault,
        balancerV2WeightedPoolId,
        WETH,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployCometSBAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedCometSBAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        cometUSDC,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployAaveV3SBAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedAaveV3SBAccumulator");
    return await accumulatorFactory.deploy(
        averagingStrategy.address,
        aaveV3Pool,
        0, // Liquidity decimals
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function generateDexBasedUpdateData(accumulator, token) {
    const liquidity = await accumulator["consultLiquidity(address,uint256)"](token, 0);

    const updateData = ethers.utils.defaultAbiCoder.encode(
        ["address", "uint", "uint", "uint"],
        [token, liquidity["tokenLiquidity"], liquidity["quoteTokenLiquidity"], await currentBlockTimestamp()]
    );

    return updateData;
}

async function deployAlocUtilizationAndErrorAccumulator() {
    // Deploy the averaging strategy
    const averagingStrategyFactory = await ethers.getContractFactory(
        ARITHMETIC_AVERAGING_ABI,
        ARITHMETIC_AVERAGING_BYTECODE
    );
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    // Deploy accumulator
    const accumulatorFactory = await ethers.getContractFactory("ManagedAlocUtilizationAndErrorAccumulator");
    return await accumulatorFactory.deploy(
        DEFAULT_UTILIZATION_TARGET,
        averagingStrategy.address,
        DEFAULT_UTILIZATION_DECIMALS,
        TWO_PERCENT_CHANGE,
        MIN_UPDATE_DELAY,
        MAX_UPDATE_DELAY
    );
}

async function deployTrueFiAloc() {
    const alocFactory = await ethers.getContractFactory("AlocStub");
    const aloc = await alocFactory.deploy();
    await aloc.deployed();

    return aloc.address;
}

describeLiquidityAccumulatorTests(
    "ManagedOffchainLiquidityAccumulator",
    deployOffchainLiquidityAccumulator,
    generateOffchainUpdateData,
    /*
    The role can't be open because updaters have full control over the data that the accumulator stores. There are
    no cases where it would be beneficial to allow anyone to update the accumulator.
    */
    false,
    /*
    Smart contracts can update the accumulator because there's no extra power that they would gain by being able to
    so. Updaters already have full control over the data that the accumulator stores.
    */
    true,
    () => WETH
);

describeLiquidityAccumulatorTests(
    "ManagedCurveLiquidityAccumulator",
    deployCurveLiquidityAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => WETH
);

describeLiquidityAccumulatorTests(
    "ManagedUniswapV2LiquidityAccumulator",
    deployUniswapV2LiquidityAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => WETH
);

describeLiquidityAccumulatorTests(
    "ManagedUniswapV3LiquidityAccumulator",
    deployUniswapV3LiquidityAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => WETH
);

describeLiquidityAccumulatorTests(
    "ManagedAlgebraLiquidityAccumulator",
    deployAlgebraLiquidityAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => WETH
);

describeLiquidityAccumulatorTests(
    "ManagedBalancerV2LiquidityAccumulator",
    deployBalancerV2LiquidityAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => BAL
);

describeLiquidityAccumulatorTests(
    "ManagedCometSBAccumulator",
    deployCometSBAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => USDC
);

describeLiquidityAccumulatorTests(
    "ManagedAaveV3SBAccumulator",
    deployAaveV3SBAccumulator,
    generateDexBasedUpdateData,
    /*
    The role can be open because updaters don't have full control over the data that the accumulator stores. There are
    cases where it would be beneficial to allow anyone to update the accumulator.
    */
    true,
    /*
    Smart contracts can't update the accumulator because it's susceptible to flash loan attack manipulation.
    */
    false,
    () => USDC
);

describeLiquidityAccumulatorTests(
    "ManagedAlocUtilizationAndErrorAccumulator",
    deployAlocUtilizationAndErrorAccumulator,
    generateDexBasedUpdateData,
    true,
    false,
    deployTrueFiAloc,
    describeUtilizationAndErrorAccumulatorTests
);
