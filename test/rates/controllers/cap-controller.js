const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const PERIOD = 100;
const INITIAL_BUFFER_CARDINALITY = 2;
const UPDATERS_MUST_BE_EOA = false;
const COMPUTE_AHEAD = true;

const TWO_PERCENT_CHANGE = ethers.utils.parseUnits("0.02", 8);

const MAX_UINT_64 = BigNumber.from(2).pow(64).sub(1);

const DEFAULT_CONFIG = {
    max: MAX_UINT_64,
    min: ethers.constants.Zero,
    maxIncrease: MAX_UINT_64,
    maxDecrease: MAX_UINT_64,
    maxPercentIncrease: BigNumber.from(2).pow(32).sub(1),
    maxPercentDecrease: 10000,
    base: ethers.utils.parseUnits("0", 18),
    componentWeights: [],
    components: [],
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

// Credits: https://stackoverflow.com/questions/53311809/all-possible-combinations-of-a-2d-array-in-javascript
function combos(list, n = 0, result = [], current = []) {
    if (n === list.length) result.push(current);
    else list[n].forEach((item) => combos(list, n + 1, result, [...current, item]));

    return result;
}

describe("CapController#constructor", function () {
    var factory;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("ManagedCapController");
    });

    const testCombinations = [
        [1, 2], // period
        [1, 2], // initialBufferCardinality
        [false, true], // updatersMustBeEoa
        [false, true], // computeAhead
    ];

    for (const test of combos(testCombinations)) {
        const period = test[0];
        const initialBufferCardinality = test[1];
        const updatersMustBeEoa = test[2];
        const computeAhead = test[3];

        it(
            "Should deploy with period=" +
                period +
                ", initialBufferCardinality=" +
                initialBufferCardinality +
                ", updatersMustBeEoa=" +
                updatersMustBeEoa +
                ", computeAhead=" +
                computeAhead,
            async function () {
                const rateController = await factory.deploy(
                    computeAhead,
                    period,
                    initialBufferCardinality,
                    updatersMustBeEoa
                );

                expect(await rateController.computeAhead()).to.equal(computeAhead);
                expect(await rateController.period()).to.equal(period);
                expect(await rateController.getRatesCapacity(GRT)).to.equal(initialBufferCardinality);
                expect(await rateController.updatersMustBeEoa()).to.equal(updatersMustBeEoa);

                // Granularity should always be 1
                expect(await rateController.granularity()).to.equal(1);
            }
        );
    }
});

describe("CapController#setRatesCapacity", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("ManagedCapController");
        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setRatesCapacity(USDC, 10)).to.emit(controller, "RatesCapacityIncreased");
    });

    it("Should work if the caller doesn't have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setRatesCapacity(USDC, 10)).to.emit(
            controller,
            "RatesCapacityIncreased"
        );
    });
});

describe("CapController#setChangeThreshold", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("ManagedCapController");
        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, 0, TWO_PERCENT_CHANGE);

        expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);
    });

    it("Should work if the caller has the admin role", async function () {
        const [, other] = await ethers.getSigners();

        await controller.grantRole(ADMIN_ROLE, other.address);

        await expect(controller.connect(other).setChangeThreshold(USDC, TWO_PERCENT_CHANGE))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, 0, TWO_PERCENT_CHANGE);

        expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);
    });

    it("Should revert if the caller doesn't have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setChangeThreshold(USDC, TWO_PERCENT_CHANGE)).to.be.revertedWith(
            /AccessControl: .*/
        );
    });

    it("Should work when the threshold changes to above zero then to zero", async function () {
        await expect(controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, 0, TWO_PERCENT_CHANGE);

        expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);

        await expect(controller.setChangeThreshold(USDC, 0))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, TWO_PERCENT_CHANGE, 0);

        expect(await controller.getChangeThreshold(USDC)).to.equal(0);
    });

    it("Should not emit an event if the threshold doesn't change", async function () {
        await expect(controller.setChangeThreshold(USDC, 0)).to.not.emit(controller, "ChangeThresholdUpdated");

        expect(await controller.getChangeThreshold(USDC)).to.equal(0);
    });
});

describe("CapController#willAnythingChange", function () {
    var controller;

    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");
        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    const tests = [
        {
            lastRate: 0,
            newRate: 1,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 1,
            newRate: 0,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 0,
            newRate: 0,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 1,
            newRate: 1,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 100,
            newRate: 101,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 101,
            newRate: 100,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 100,
            newRate: 102,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 102,
            newRate: 100,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 100,
            newRate: 103,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 103,
            newRate: 100,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 0,
            newRate: 0,
            changeThreshold: 0,
            expected: true,
        },
        {
            lastRate: 1,
            newRate: 1,
            changeThreshold: 0,
            expected: true,
        },
    ];

    for (const test of tests) {
        it(
            "Returns " +
                test.expected +
                " when lastRate is " +
                test.lastRate +
                ", newRate is " +
                test.newRate +
                ", and changeThreshold is " +
                ethers.utils.formatUnits(test.changeThreshold, 6) +
                "%",
            async function () {
                await controller.setChangeThreshold(USDC, test.changeThreshold);

                await controller.stubPush(USDC, test.lastRate, test.lastRate, 1);

                const newConfig = {
                    ...DEFAULT_CONFIG,
                    base: test.newRate,
                };

                await controller.setConfig(USDC, newConfig);

                const tx = await controller.stubWillAnythingChange(updateData);

                expect(tx).to.equal(test.expected);
            }
        );
    }

    const initialTests = [
        {
            newRate: 0,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            newRate: 1,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            newRate: MAX_UINT_64,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            newRate: 0,
            changeThreshold: 0,
            expected: true,
        },
        {
            newRate: 1,
            changeThreshold: 0,
            expected: true,
        },
        {
            newRate: MAX_UINT_64,
            changeThreshold: 0,
            expected: true,
        },
    ];

    for (const test of initialTests) {
        it(
            "Returns " +
                test.expected +
                " when the first rate (initial) is " +
                test.newRate +
                " and changeThreshold is " +
                ethers.utils.formatUnits(test.changeThreshold, 6) +
                "%",
            async function () {
                await controller.setChangeThreshold(USDC, test.changeThreshold);

                const newConfig = {
                    ...DEFAULT_CONFIG,
                    base: test.newRate,
                };

                await controller.setConfig(USDC, newConfig);

                const tx = await controller.stubWillAnythingChange(updateData);

                expect(tx).to.equal(test.expected);
            }
        );
    }
});

describe("CapController#changeThresholdSurpassed", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");
        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );
    });

    it("Returns true when the change is enormously large", async function () {
        const tx = await controller.stubChangeThresholdSurpassed(1, ethers.constants.MaxUint256, TWO_PERCENT_CHANGE);

        expect(tx).to.equal(true);
    });
});

describe("CapController#update", function () {
    var controller;

    async function deploy(updatersMustBeEoa) {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");

        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            updatersMustBeEoa
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    }

    beforeEach(async () => {
        await deploy(false);
    });

    it("Reverts if the caller doesn't have the ORACLE_UPDATER_ROLE", async function () {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await expect(controller.update(updateData)).to.be.revertedWith("MissingRole").withArgs(ORACLE_UPDATER_ROLE);
    });

    it("Works if the caller has the ORACLE_UPDATER_ROLE", async function () {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant the role to the signer
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await expect(controller.update(updateData)).to.not.be.reverted;
    });

    it("Works if the ORACLE_UPDATER_ROLE is open", async function () {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Grant the role to everyone
        await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await expect(controller.update(updateData)).to.not.be.reverted;
    });
});

describe("CapController#manuallyPushRate", function () {
    var controller;

    beforeEach(async function () {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");

        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should revert if the caller does not have the ADMIN role", async function () {
        // Get the second signer
        const [, signer] = await ethers.getSigners();

        // Assign the signer all of the other roles
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer.address.toLowerCase();

        const rate = ethers.utils.parseUnits("0.1234", 18);

        await expect(controller.connect(signer).manuallyPushRate(GRT, rate, rate, 1)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + ADMIN_ROLE
        );

        // Sanity check that we can successfully call the function if we have the role
        await controller.grantRole(ADMIN_ROLE, signer.address);
        await expect(controller.connect(signer).manuallyPushRate(GRT, rate, rate, 1)).to.not.be.reverted;
    });

    it("Works if the caller has all roles", async function () {
        const rate = ethers.utils.parseUnits("0.1234", 18);

        const initialRateCount = await controller.getRatesCount(GRT);
        // Sanity check that the rate count is 0
        expect(initialRateCount).to.equal(0);

        const capacity = await controller.getRatesCapacity(GRT);

        const amount = 1;

        const tx = await controller.manuallyPushRate(GRT, rate, rate, amount);
        const receipt = await tx.wait();
        const timestamp = await blockTimestamp(receipt.blockNumber);

        expect(receipt).to.emit(controller, "RateUpdated").withArgs(GRT, rate, rate, timestamp);
        expect(receipt).to.emit(controller, "RatePushedManually").withArgs(GRT, rate, rate, timestamp, amount);
        expect(await controller.getRatesCount(GRT)).to.equal(Math.min(initialRateCount + amount, capacity));
        // Ensure RateUpdated was emitted `amount` times
        expect(receipt.events.filter((e) => e.event === "RateUpdated").length).to.equal(amount);
    });

    it("Works if the caller has only the ADMIN role", async function () {
        const [, other] = await ethers.getSigners();

        await controller.grantRole(ADMIN_ROLE, other.address);

        const rate = ethers.utils.parseUnits("0.1234", 18);

        const initialRateCount = await controller.getRatesCount(GRT);
        // Sanity check that the rate count is 0
        expect(initialRateCount).to.equal(0);

        const capacity = await controller.getRatesCapacity(GRT);

        const amount = 1;

        const tx = await controller.connect(other).manuallyPushRate(GRT, rate, rate, amount);
        const receipt = await tx.wait();
        const timestamp = await blockTimestamp(receipt.blockNumber);

        expect(receipt).to.emit(controller, "RateUpdated").withArgs(GRT, rate, rate, timestamp);
        expect(receipt).to.emit(controller, "RatePushedManually").withArgs(GRT, rate, rate, timestamp, amount);
        expect(await controller.getRatesCount(GRT)).to.equal(Math.min(initialRateCount + amount, capacity));
        // Ensure RateUpdated was emitted `amount` times
        expect(receipt.events.filter((e) => e.event === "RateUpdated").length).to.equal(amount);
    });
});

describe("CapController#setUpdatesPaused", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");

        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should revert if the caller does not have the UPDATE_PAUSE_ADMIN role", async function () {
        // Get the second signer
        const [, signer] = await ethers.getSigners();

        // Assign the signer all of the other roles
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(ADMIN_ROLE, signer.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer.address.toLowerCase();

        await expect(controller.connect(signer).setUpdatesPaused(GRT, true)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + UPDATE_PAUSE_ADMIN_ROLE
        );

        // Sanity check that we can successfully call the function if we have the role
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        await expect(controller.connect(signer).setUpdatesPaused(GRT, true)).to.not.be.reverted;
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setUpdatesPaused(GRT, true))
            .to.emit(controller, "PauseStatusChanged")
            .withArgs(GRT, true);

        // Sanity check that the changes were made
        expect(await controller.areUpdatesPaused(GRT)).to.equal(true);
    });

    it("Should work if the caller has only the UPDATE_PAUSE_ADMIN role", async function () {
        const [, other] = await ethers.getSigners();

        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, other.address);

        await expect(controller.connect(other).setUpdatesPaused(GRT, true))
            .to.emit(controller, "PauseStatusChanged")
            .withArgs(GRT, true);

        // Sanity check that the changes were made
        expect(await controller.areUpdatesPaused(GRT)).to.equal(true);
    });
});

describe("CapController#canUpdate", function () {
    var controller;

    async function deploy(updatersMustBeEOA) {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");

        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            updatersMustBeEOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    }

    beforeEach(async () => {
        await deploy(false);
    });

    it("Can't update if we don't have the required role and the role is not open", async function () {
        // needsUpdate should return true
        await controller.overrideNeedsUpdate(true, true);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.false;

        // Sanity check that it can update if we have the role
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        expect(await controller.canUpdate(updateData)).to.be.true;
    });

    it("Can update if we have the required role and the role is not open", async function () {
        // needsUpdate should return true
        await controller.overrideNeedsUpdate(true, true);

        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.true;
    });

    it("Can update if we don't have the required role but the role is open", async function () {
        // needsUpdate should return true
        await controller.overrideNeedsUpdate(true, true);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Grant the role to everyone
        await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.true;
    });
});

describe("CapController#setConfig", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("CapControllerStub");

        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
    });

    it("Should revert if the caller does not have the RATE_ADMIN role", async function () {
        // Get the second signer
        const [, signer] = await ethers.getSigners();

        // Assign the signer all of the other roles
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        await controller.grantRole(ADMIN_ROLE, signer.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer.address.toLowerCase();

        await expect(controller.connect(signer).setConfig(GRT, DEFAULT_CONFIG)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + RATE_ADMIN_ROLE
        );

        // Sanity check that we can successfully call the function if we have the role
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await expect(controller.connect(signer).setConfig(GRT, DEFAULT_CONFIG)).to.not.be.reverted;
    });

    it("Should work if the caller has all roles", async function () {
        const tx = await controller.setConfig(GRT, DEFAULT_CONFIG);

        await expect(tx).to.emit(controller, "RateConfigUpdated");
    });

    it("Should work if the caller has only the RATE_ADMIN role", async function () {
        const [, other] = await ethers.getSigners();

        await controller.grantRole(RATE_ADMIN_ROLE, other.address);

        const tx = await controller.connect(other).setConfig(GRT, DEFAULT_CONFIG);

        await expect(tx).to.emit(controller, "RateConfigUpdated");
    });
});

describe("CapController#supportsInterface", function () {
    var controller;
    var interfaceIds;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("ManagedCapController");

        controller = await controllerFactory.deploy(
            COMPUTE_AHEAD,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IERC165", async () => {
        const interfaceId = await interfaceIds.iERC165();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IUpdateable", async () => {
        const interfaceId = await interfaceIds.iUpdateable();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IPeriodic", async () => {
        const interfaceId = await interfaceIds.iPeriodic();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHistoricalRates", async () => {
        const interfaceId = await interfaceIds.iHistoricalRates();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IRateComputer", async () => {
        const interfaceId = await interfaceIds.iRateComputer();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
