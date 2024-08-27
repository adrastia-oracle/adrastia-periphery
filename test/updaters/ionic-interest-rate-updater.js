const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers, timeAndMine } = require("hardhat");
const { currentBlockTimestamp } = require("../../src/time");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

// In this example, 1e18 = 100%
const DEFAULT_CONFIG = {
    max: ethers.utils.parseUnits("1.0", 18), // 100%
    min: ethers.utils.parseUnits("0.0", 18), // 0%
    maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
    maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
    maxPercentIncrease: 10000, // 100%
    maxPercentDecrease: 10000, // 100%
    base: ethers.utils.parseUnits("0.6", 18), // 60%
    componentWeights: [],
    components: [],
};

const DEFAULT_PERIOD = 100;

describe("IonicInterestRateUpdater", function () {
    var controller;
    var token;
    var cToken;
    var comptroller;
    var updater;

    beforeEach(async function () {
        token = USDC;

        const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
        cToken = await cTokenFactory.deploy(token);
        await cToken.deployed();

        const comptrollerFactory = await ethers.getContractFactory("IonicStub");
        comptroller = await comptrollerFactory.deploy();

        await comptroller.stubSetCToken(token, cToken.address);

        const controllerFactory = await ethers.getContractFactory("RateControllerStub");
        controller = await controllerFactory.deploy(false, DEFAULT_PERIOD, 1, false);
        await controller.deployed();

        await cToken.stubSetRateComputer(controller.address);

        const updaterFactory = await ethers.getContractFactory("IonicInterestRateUpdater");
        updater = await updaterFactory.deploy(comptroller.address, controller.address);
        await updater.deployed();

        // Grant roles
        const [signer] = await ethers.getSigners();
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, updater.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set configs
        await controller.setConfig(token, DEFAULT_CONFIG);
    });

    describe("IonicInterestRateUpdater#canUpdate", function () {
        it("Returns true when the controller returns true", async function () {
            await controller.overrideCanUpdate(true, true);

            const canUpdate = await updater.canUpdate(token);
            expect(canUpdate).to.be.true;
        });

        it("Returns false when the controller returns false", async function () {
            await controller.overrideCanUpdate(true, false);

            const canUpdate = await updater.canUpdate(token);
            expect(canUpdate).to.be.false;
        });
    });

    describe("IonicInterestRateUpdater#needsUpdate", function () {
        it("Returns true when the controller returns true", async function () {
            await controller.overrideNeedsUpdate(true, true);

            const needsUpdate = await updater.needsUpdate(token);
            expect(needsUpdate).to.be.true;
        });

        it("Returns false when the controller returns false", async function () {
            await controller.overrideNeedsUpdate(true, false);

            const needsUpdate = await updater.needsUpdate(token);
            expect(needsUpdate).to.be.false;
        });
    });

    describe("IonicInterestRateUpdater#timeSinceLastUpdate", function () {
        it("Returns the time since the last update", async function () {
            const timestamp = 10;

            await controller.stubPush(token, 1, 1, timestamp);

            const currentTime = await currentBlockTimestamp();

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            const timeSinceLastUpdate = await updater.timeSinceLastUpdate(updateData);

            expect(timeSinceLastUpdate).to.eq(currentTime - timestamp);
        });
    });

    describe("IonicInterestRateUpdater#lastUpdateTime", function () {
        it("Returns the last update time", async function () {
            const timestamp = 10;

            await controller.stubPush(token, 1, 1, timestamp);

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            const lastUpdateTime = await updater.lastUpdateTime(updateData);

            expect(lastUpdateTime).to.eq(timestamp);
        });
    });

    describe("IonicInterestRateUpdater#update", function () {
        it("Doesn't call accrueInterest if the buffer is empty", async function () {
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            await expect(updater.update(updateData)).to.not.emit(cToken, "InterestAccrued");
        });

        it("Calls accrueInterest if the buffer is not empty", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 18);
            await controller.manuallyPushRate(token, startingRate, startingRate, 1);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            await expect(updater.update(updateData)).to.emit(cToken, "InterestAccrued");
        });

        it("Reverts if accrueInterest is not successful and the buffer is not empty", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 18);
            await controller.manuallyPushRate(token, startingRate, startingRate, 1);

            // Set the interest rate to be unavailable
            await cToken.stubSetAccrueInterestReturnCode(1);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            await expect(updater.update(updateData)).to.be.revertedWith("FailedToAccrueInterest");
        });

        it("Reverts if it can't find the cToken", async function () {
            // Configure GRT
            await controller.setConfig(GRT, DEFAULT_CONFIG);

            // Push an initial rate (should succeed)
            const startingRate = ethers.utils.parseUnits("0.2", 18);
            await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await expect(updater.update(updateData)).to.be.revertedWith("CTokenNotFound");
        });

        it("Calls accrueInterest before pushing the new rate", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 18);
            await controller.manuallyPushRate(token, startingRate, startingRate, 1);

            // Set a new base rate of 90%
            const newBaseRate = ethers.utils.parseUnits("0.9", 18);
            await controller.setConfig(token, { ...DEFAULT_CONFIG, base: newBaseRate });

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            await expect(updater.update(updateData)).to.emit(cToken, "InterestAccrued").withArgs(startingRate);

            const newRate = await controller.computeRate(token);

            // The new rate should be different from the starting rate
            expect(newRate).to.not.eq(startingRate);
        });
    });
});
