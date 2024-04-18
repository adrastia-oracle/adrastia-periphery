const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ADMIN_ROLE, RATE_ADMIN_ROLE } = require("../../../src/roles");
const { MAX_CONFIG } = require("../../../src/constants/rate-controller");
const { AddressZero } = ethers.constants;

const DEFAULT_PERIOD = 100;
const DEFAULT_INITIAL_BUFFER_CARDINALITY = 10;
const DEFAULT_UPDATERS_MUST_BE_EAO = false;

describe("ManagedHistoricalRatesComputer#setConfig", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("ManagedHistoricalRatesComputer");

        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const tokenContract = await tokenFactory.deploy("Token", "TKN", 18);
        await tokenContract.deployed();

        token = tokenContract.address;
    });

    beforeEach(async function () {
        const [signer] = await ethers.getSigners();

        const rateControllerFactory = await ethers.getContractFactory("RateControllerStub");
        rateController = await rateControllerFactory.deploy(
            DEFAULT_PERIOD,
            DEFAULT_INITIAL_BUFFER_CARDINALITY,
            DEFAULT_UPDATERS_MUST_BE_EAO
        );
        await rateController.grantRole(RATE_ADMIN_ROLE, signer.address);
        await rateController.setConfig(token, MAX_CONFIG);

        computer = await computerFactory.deploy(AddressZero, 0, false);
    });

    it("Reverts when the caller doesn't have any roles", async function () {
        const [, other] = await ethers.getSigners();

        await expect(
            computer.connect(other).setConfig(token, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            })
        ).to.be.revertedWith(/AccessControl: .*/);
    });

    it("Reverts if the caller only has the ADMIN role", async function () {
        const [, other] = await ethers.getSigners();

        await computer.grantRole(ADMIN_ROLE, other.address);

        await expect(
            computer.connect(other).setConfig(token, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            })
        ).to.be.revertedWith(/AccessControl: .*/);
    });

    it("We can set a token config when the caller has all roles", async function () {
        const [owner] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, owner.address);

        const tx = await computer.connect(owner).setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(tx).to.emit(computer, "ConfigUpdated");
    });

    it("We can set a token config when the caller has rate admin role", async function () {
        const [, rateAdmin] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, rateAdmin.address);

        const tx = await computer.connect(rateAdmin).setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(tx).to.emit(computer, "ConfigUpdated");
    });

    it("We can set a default config when the caller has rate admin role", async function () {
        const [, rateAdmin] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, rateAdmin.address);

        const tx = await computer.connect(rateAdmin).setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(tx).to.emit(computer, "ConfigUpdated");
    });

    it("We can set a default config when the caller has all roles", async function () {
        const [owner] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, owner.address);

        const tx = await computer.connect(owner).setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(tx).to.emit(computer, "ConfigUpdated");
    });
});

describe("ManagedHistoricalRatesComputer#supportsInterface", function () {
    var computerFactory;
    var computer;
    var interfaceIds;

    before(async function () {
        computerFactory = await ethers.getContractFactory("ManagedHistoricalRatesComputer");

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    beforeEach(async function () {
        computer = await computerFactory.deploy(AddressZero, 0, false);
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
