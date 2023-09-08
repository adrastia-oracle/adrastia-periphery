const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;

const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

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

describe("ManagedOracleMutationComputer#setConfig", function () {
    var computer;

    beforeEach(async function () {
        const oracleFactory = await ethers.getContractFactory("MockOracle2");
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const factory = await ethers.getContractFactory("ManagedOracleMutationComputer");
        computer = await factory.deploy(
            oracle.address,
            DEFAULT_DATA_SLOT,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMAL_OFFSET
        );
    });

    it("Works when the caller has all roles", async function () {
        const [owner] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, owner.address);

        await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
    });

    it("Works when the caller has rate admin role", async function () {
        const [, rateAdmin] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, rateAdmin.address);

        await computer
            .connect(rateAdmin)
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
        ).to.be.revertedWith(/AccessControl: .*/);
    });
});

describe("ManagedOracleMutationComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const oracleFactory = await ethers.getContractFactory("MockOracle2");
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const factory = await ethers.getContractFactory("ManagedOracleMutationComputer");
        computer = await factory.deploy(
            oracle.address,
            DEFAULT_DATA_SLOT,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMAL_OFFSET
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IERC165", async () => {
        const interfaceId = await interfaceIds.iERC165();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IRateComputer", async () => {
        const interfaceId = await interfaceIds.iRateComputer();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IAccessControlEnumerable", async () => {
        const interfaceId = await interfaceIds.iAccessControlEnumerable();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IAccessControl", async () => {
        const interfaceId = await interfaceIds.iAccessControl();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
