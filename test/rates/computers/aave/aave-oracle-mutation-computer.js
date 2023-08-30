const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;
const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DATA_SLOT_PRICE = 1;
const DATA_SLOT_LIQUIDITY_TOKEN = 2;
const DATA_SLOT_LIQUIDITY_QUOTETOKEN = 3;

const DEFAULT_DECIMALS = 4;

const DEFAULT_DATA_SLOT = DATA_SLOT_PRICE;
const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);
const DEFAULT_DECIMAL_OFFSET = 0;

const PASS_THROUGH_CONFIG = {
    max: BigNumber.from(2).pow(64).sub(1),
    min: BigNumber.from(0),
    offset: BigNumber.from(0),
    scalar: DEFAULT_ONE_X_SCALAR.toNumber(),
};

describe("AaveOracleMutationComputer#setConfig", function () {
    var aclManager;
    var computer;

    beforeEach(async function () {
        const [owner] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(owner.address, true);
        await aclManager.deployed();

        const oracleFactory = await ethers.getContractFactory("MockOracle2");
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const computerFactory = await ethers.getContractFactory("AaveOracleMutationComputer");
        computer = await computerFactory.deploy(
            aclManager.address,
            oracle.address,
            DEFAULT_DATA_SLOT,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMAL_OFFSET
        );
    });

    it("Works when the caller has all roles", async function () {
        await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
    });

    it("Works when the caller has the pool admin role", async function () {
        const [, poolAdmin] = await ethers.getSigners();

        await aclManager.grantRole(await aclManager.POOL_ADMIN_ROLE(), poolAdmin.address);

        await computer
            .connect(poolAdmin)
            .setConfig(
                USDC,
                PASS_THROUGH_CONFIG.max,
                PASS_THROUGH_CONFIG.min,
                PASS_THROUGH_CONFIG.offset,
                PASS_THROUGH_CONFIG.scalar
            );
    });

    it("Reverts when the caller doesn't have any roles", async function () {
        const [, other] = await ethers.getSigners();

        await expect(
            computer
                .connect(other)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith("NotAuthorized");
    });

    it("Reverts when the caller only has the emergency admin role", async function () {
        const [, emergencyAdmin] = await ethers.getSigners();

        await aclManager.grantRole(await aclManager.EMERGENCY_ADMIN_ROLE(), emergencyAdmin.address);

        await expect(
            computer
                .connect(emergencyAdmin)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith("NotAuthorized");
    });

    it("Reverts when the caller only has the risk admin role", async function () {
        const [, riskAdmin] = await ethers.getSigners();

        await aclManager.grantRole(await aclManager.RISK_ADMIN_ROLE(), riskAdmin.address);

        await expect(
            computer
                .connect(riskAdmin)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith("NotAuthorized");
    });

    it("Reverts when the caller only has the flash borrower role", async function () {
        const [, flashBorrower] = await ethers.getSigners();

        await aclManager.grantRole(await aclManager.FLASH_BORROWER_ROLE(), flashBorrower.address);

        await expect(
            computer
                .connect(flashBorrower)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith("NotAuthorized");
    });

    it("Reverts when the caller only has the bridge role", async function () {
        const [, bridge] = await ethers.getSigners();

        await aclManager.grantRole(await aclManager.BRIDGE_ROLE(), bridge.address);

        await expect(
            computer
                .connect(bridge)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith("NotAuthorized");
    });

    it("Reverts when the caller only has the asset listing admin role", async function () {
        const [, assetListingAdmin] = await ethers.getSigners();

        await aclManager.grantRole(await aclManager.ASSET_LISTING_ADMIN_ROLE(), assetListingAdmin.address);

        await expect(
            computer
                .connect(assetListingAdmin)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith("NotAuthorized");
    });
});
