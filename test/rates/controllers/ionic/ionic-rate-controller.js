const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers, timeAndMine } = require("hardhat");

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

describe("IonicRateController", function () {
    describe("IonicRateController#update", function () {
        var controller;
        var token;
        var cToken;
        var comptroller;

        beforeEach(async function () {
            token = USDC;

            const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
            cToken = await cTokenFactory.deploy(token);
            await cToken.deployed();

            const comptrollerFactory = await ethers.getContractFactory("IonicStub");
            comptroller = await comptrollerFactory.deploy();

            await comptroller.stubSetCToken(token, cToken.address);

            const controllerFactory = await ethers.getContractFactory("IonicRateController");
            controller = await controllerFactory.deploy(comptroller.address, false, DEFAULT_PERIOD, 1, false);

            // Grant roles
            const [signer] = await ethers.getSigners();
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            // Set configs
            await controller.setConfig(token, DEFAULT_CONFIG);
        });

        it("Doesn't call accrueInterest if the buffer is empty", async function () {
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            await expect(controller.update(updateData)).to.not.emit(cToken, "InterestAccrued");
        });

        it("Calls accrueInterest if the buffer is not empty", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 18);
            await controller.manuallyPushRate(token, startingRate, startingRate, 1);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
            await expect(controller.update(updateData)).to.emit(cToken, "InterestAccrued");
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
            await expect(controller.update(updateData)).to.be.revertedWith("FailedToAccrueInterest");
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
            await expect(controller.update(updateData)).to.be.revertedWith("CTokenNotFound");
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
            await expect(controller.update(updateData)).to.emit(cToken, "InterestAccrued").withArgs(startingRate);

            const newRate = await controller.computeRate(token);

            // The new rate should be different from the starting rate
            expect(newRate).to.not.eq(startingRate);
        });
    });
});
