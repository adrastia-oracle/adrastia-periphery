const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MAX_CONFIG } = require("../../../src/constants/rate-controller");
const { RATE_ADMIN_ROLE, ADMIN_ROLE } = require("../../../src/roles");
const { AddressZero } = ethers.constants;

const DEFAULT_PERIOD = 100;
const DEFAULT_INITIAL_BUFFER_CARDINALITY = 10;
const DEFAULT_UPDATERS_MUST_BE_EAO = false;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("HistoricalRatesComputer#constructor", function () {
    var factory;

    before(async function () {
        factory = await ethers.getContractFactory("HistoricalRatesComputerStub");
    });

    it("Sets the default config a rate provider is provided", async function () {
        const rateControllerFactory = await ethers.getContractFactory("RateControllerStub");
        const rateController = await rateControllerFactory.deploy(
            DEFAULT_PERIOD,
            DEFAULT_INITIAL_BUFFER_CARDINALITY,
            DEFAULT_UPDATERS_MUST_BE_EAO
        );
        await rateController.deployed();

        const index = 0;
        const highAvailability = false;

        const computer = await factory.deploy(rateController.address, index, highAvailability);

        await expect(computer.deployTransaction).to.emit(computer, "ConfigUpdated");
        await expect(computer.deployTransaction).to.emit(computer, "ConfigInitialized").withArgs(AddressZero, true);

        const deployReceipt = await computer.deployTransaction.wait();

        const event = deployReceipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(AddressZero);
        expect(event.args[1]).to.deep.equal([rateController.address, index, highAvailability]);

        const config = await computer.getConfig(AddressZero);

        expect(config).to.deep.equal([rateController.address, index, highAvailability]);
    });

    it("Sets the default config a rate provider is provided, with an alternative index and high availability", async function () {
        const rateControllerFactory = await ethers.getContractFactory("RateControllerStub");
        const rateController = await rateControllerFactory.deploy(
            DEFAULT_PERIOD,
            DEFAULT_INITIAL_BUFFER_CARDINALITY,
            DEFAULT_UPDATERS_MUST_BE_EAO
        );
        await rateController.deployed();

        const index = 1;
        const highAvailability = true;

        const computer = await factory.deploy(rateController.address, index, highAvailability);

        await expect(computer.deployTransaction).to.emit(computer, "ConfigUpdated");
        await expect(computer.deployTransaction).to.emit(computer, "ConfigInitialized").withArgs(AddressZero, true);

        const deployReceipt = await computer.deployTransaction.wait();

        const event = deployReceipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(AddressZero);
        expect(event.args[1]).to.deep.equal([rateController.address, index, highAvailability]);

        const config = await computer.getConfig(AddressZero);

        expect(config).to.deep.equal([rateController.address, index, highAvailability]);
    });

    it("Does not set the default config if no rate provider is provided", async function () {
        const index = 0;
        const highAvailability = false;

        const computer = await factory.deploy(AddressZero, index, highAvailability);

        await expect(computer.deployTransaction).to.not.emit(computer, "ConfigUpdated");
        await expect(computer.deployTransaction).to.not.emit(computer, "ConfigInitialized");

        const deployReceipt = await computer.deployTransaction.wait();

        expect(deployReceipt.events).to.be.empty;
    });
});

describe("HistoricalRatesComputer#computeRate", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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

    it("Reverts if the token is address(0)", async function () {
        await expect(computer.computeRate(AddressZero)).to.be.revertedWith("InvalidInput");
    });

    it("Reverts if there's no config for a token", async function () {
        await expect(computer.computeRate(token)).to.be.revertedWith("MissingConfig");
    });

    it("Reverts if there are no rates available, without high availability", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(computer.computeRate(token)).to.be.reverted;
    });

    it("Reverts if there are no rates available, with high availability", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: true,
        });

        await expect(computer.computeRate(token)).to.be.reverted;
    });

    it("Reverts if the desired rate is not available, without high availability", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: false,
        });

        await rateController.manuallyPushRate(token, 0, 0, 1);

        await expect(computer.computeRate(token)).to.be.reverted;
    });

    it("Returns the rate if the desired rate is available, without high availability", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        const rate = 1;
        await rateController.manuallyPushRate(token, rate, rate, 1);

        expect(await computer.computeRate(token)).to.equal(rate);
    });

    it("Returns the rate at the desired index if the desired rate is available, without high availability", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: false,
        });

        const rate = 123;
        await rateController.manuallyPushRate(token, rate + 1, rate + 1, 1); // index 2
        await rateController.manuallyPushRate(token, rate, rate, 1); // index 1 - desired
        await rateController.manuallyPushRate(token, rate + 1, rate + 1, 1); // index 0

        expect(await computer.computeRate(token)).to.equal(rate);
    });

    it("Returns the oldest rate if the desired rate is not available, with high availability", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        });

        const rate = 123;
        await rateController.manuallyPushRate(token, rate, rate, 1); // index 0

        expect(await computer.computeRate(token)).to.equal(rate);
    });

    it("Uses the default config if no config is set for the token", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        const rate = 123;
        await rateController.manuallyPushRate(token, rate, rate, 1);

        expect(await computer.computeRate(token)).to.equal(rate);
    });

    it("Returns the rate at index 0 with high availability, ignoring older rates", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: true,
        });

        const rate = 123;
        await rateController.manuallyPushRate(token, rate + 1, rate + 1, 1); // index 2
        await rateController.manuallyPushRate(token, rate + 1, rate + 1, 1); // index 1
        await rateController.manuallyPushRate(token, rate, rate, 1); // index 0 - desired

        expect(await computer.computeRate(token)).to.equal(rate);
    });

    it("Returns the rate at index 1 with high availability, ignoring older rates", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        });

        const rate = 123;
        await rateController.manuallyPushRate(token, rate + 1, rate + 1, 1); // index 2
        await rateController.manuallyPushRate(token, rate, rate, 1); // index 1 - desired
        await rateController.manuallyPushRate(token, rate + 1, rate + 1, 1); // index 0

        expect(await computer.computeRate(token)).to.equal(rate);
    });
});

describe("HistoricalRatesComputer#setConfig", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;
    var secondRateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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
        secondRateController = await rateControllerFactory.deploy(
            DEFAULT_PERIOD,
            DEFAULT_INITIAL_BUFFER_CARDINALITY,
            DEFAULT_UPDATERS_MUST_BE_EAO
        );
        await rateController.grantRole(RATE_ADMIN_ROLE, signer.address);
        await rateController.setConfig(token, MAX_CONFIG);
        await secondRateController.grantRole(RATE_ADMIN_ROLE, signer.address);
        await secondRateController.setConfig(token, MAX_CONFIG);

        computer = await computerFactory.deploy(AddressZero, 0, false);
    });

    it("Reverts if the rateProvider is address(0) and we're not setting the default config", async function () {
        await expect(
            computer.setConfig(token, { rateProvider: AddressZero, index: 0, highAvailability: false })
        ).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if we're setting the default config as nil when it's already nil", async function () {
        await expect(
            computer.setConfig(AddressZero, { rateProvider: AddressZero, index: 0, highAvailability: false })
        ).to.be.revertedWith("ConfigNotChanged");
    });

    it("Reverts if the default config does not change", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(AddressZero, defaultConfig);

        await expect(computer.setConfig(AddressZero, defaultConfig)).to.be.revertedWith("ConfigNotChanged");
    });

    it("Reverts if the token config does not change", async function () {
        const tokenConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(token, tokenConfig);

        await expect(computer.setConfig(token, tokenConfig)).to.be.revertedWith("ConfigNotChanged");
    });

    it("Reverts if we set the default config to nil but the provided config index is not nil", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(
            computer.setConfig(AddressZero, { rateProvider: AddressZero, index: 1, highAvailability: false })
        ).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if we set the default config to nil but the provided config highAvailability is not nil", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(
            computer.setConfig(AddressZero, { rateProvider: AddressZero, index: 0, highAvailability: true })
        ).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if we set the default config to nil but the provided config is not nil", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await expect(
            computer.setConfig(AddressZero, { rateProvider: AddressZero, index: 1, highAvailability: true })
        ).to.be.revertedWith("InvalidConfig");
    });

    it("Sets the default config", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        const tx = await computer.setConfig(AddressZero, defaultConfig);

        await expect(tx).to.emit(computer, "ConfigUpdated");
        await expect(tx).to.emit(computer, "ConfigInitialized").withArgs(AddressZero, true);

        const receipt = await tx.wait();
        const event = receipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(AddressZero);
        expect(event.args[1]).to.deep.equal([
            defaultConfig.rateProvider,
            defaultConfig.index,
            defaultConfig.highAvailability,
        ]);

        const config = await computer.getConfig(AddressZero);

        expect(config).to.deep.equal([defaultConfig.rateProvider, defaultConfig.index, defaultConfig.highAvailability]);
    });

    it("Sets the default config to nil", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(AddressZero, defaultConfig);

        const nilConfig = {
            rateProvider: AddressZero,
            index: 0,
            highAvailability: false,
        };

        const tx = await computer.setConfig(AddressZero, nilConfig);

        await expect(tx).to.emit(computer, "ConfigUpdated");
        await expect(tx).to.emit(computer, "ConfigInitialized").withArgs(AddressZero, false);

        const receipt = await tx.wait();
        const event = receipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(AddressZero);
        expect(event.args[1]).to.deep.equal([nilConfig.rateProvider, nilConfig.index, nilConfig.highAvailability]);

        await expect(computer.getConfig(AddressZero)).to.be.revertedWith("MissingConfig");
    });

    it("Sets a new default config", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(AddressZero, defaultConfig);

        const newDefaultConfig = {
            rateProvider: secondRateController.address,
            index: 1,
            highAvailability: true,
        };

        const tx = await computer.setConfig(AddressZero, newDefaultConfig);

        await expect(tx).to.emit(computer, "ConfigUpdated");
        await expect(tx).to.not.emit(computer, "ConfigInitialized");

        const receipt = await tx.wait();
        const event = receipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(AddressZero);
        expect(event.args[1]).to.deep.equal([
            newDefaultConfig.rateProvider,
            newDefaultConfig.index,
            newDefaultConfig.highAvailability,
        ]);

        const config = await computer.getConfig(AddressZero);

        expect(config).to.deep.equal([
            newDefaultConfig.rateProvider,
            newDefaultConfig.index,
            newDefaultConfig.highAvailability,
        ]);
    });

    it("Sets a new token config", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(token, defaultConfig);

        const tokenConfig = {
            rateProvider: secondRateController.address,
            index: 1,
            highAvailability: true,
        };

        const tx = await computer.setConfig(token, tokenConfig);

        await expect(tx).to.emit(computer, "ConfigUpdated");
        await expect(tx).to.not.emit(computer, "ConfigInitialized");

        const receipt = await tx.wait();
        const event = receipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(token);
        expect(event.args[1]).to.deep.equal([
            tokenConfig.rateProvider,
            tokenConfig.index,
            tokenConfig.highAvailability,
        ]);

        const config = await computer.getConfig(token);

        expect(config).to.deep.equal([tokenConfig.rateProvider, tokenConfig.index, tokenConfig.highAvailability]);
    });
});

describe("HistoricalRatesComputer#isUsingDefaultConfig", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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

    it("Returns true for address(0), with a default config", async function () {
        expect(await computer.isUsingDefaultConfig(AddressZero)).to.be.true;
    });

    it("Returns true for address(0), without a default config", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        expect(await computer.isUsingDefaultConfig(AddressZero)).to.be.true;
    });

    it("Returns true if the token config has not been set, without a default config", async function () {
        expect(await computer.isUsingDefaultConfig(token)).to.be.true;
    });

    it("Returns true if the token config has not been set, with a default config", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        expect(await computer.isUsingDefaultConfig(token)).to.be.true;
    });

    it("Returns false if the token config has been set, without a default config", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        expect(await computer.isUsingDefaultConfig(token)).to.be.false;
    });

    it("Returns false if the token config has been set, with a default config", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        expect(await computer.isUsingDefaultConfig(token)).to.be.false;
    });

    it("Returns true if we revert to the default config, without a default config", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await computer.revertToDefaultConfig(token);

        expect(await computer.isUsingDefaultConfig(token)).to.be.true;
    });

    it("Returns true if we revert to the default config, with a default config", async function () {
        await computer.setConfig(AddressZero, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await computer.revertToDefaultConfig(token);

        expect(await computer.isUsingDefaultConfig(token)).to.be.true;
    });
});

describe("HistoricalRatesComputer#revertToDefaultConfig", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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

    it("Reverts if the token is address(0)", async function () {
        await expect(computer.revertToDefaultConfig(AddressZero)).to.be.revertedWith("AlreadyUsingDefaultConfig");
    });

    it("Reverts if the token is already using the default config", async function () {
        await expect(computer.revertToDefaultConfig(token)).to.be.revertedWith("AlreadyUsingDefaultConfig");
    });

    it("Reverts if the token is already using the default config, after reverting to the default config", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await computer.revertToDefaultConfig(token);

        await expect(computer.revertToDefaultConfig(token)).to.be.revertedWith("AlreadyUsingDefaultConfig");
    });

    it("Reverts to the default config", async function () {
        const config = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(token, config);

        const tx = await computer.revertToDefaultConfig(token);

        await expect(tx).to.emit(computer, "ConfigInitialized").withArgs(token, false);
        await expect(tx).to.emit(computer, "ConfigUpdated");

        const receipt = await tx.wait();

        const event = receipt.events.find((log) => log.event === "ConfigUpdated");

        expect(event.args[0]).to.equal(token);
        expect(event.args[1]).to.deep.equal([AddressZero, 0, false]);

        expect(await computer.isUsingDefaultConfig(token)).to.be.true;
    });
});

describe("HistoricalRatesComputer#getConfig", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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

    it("Reverts if the config is not set and the default config is not set", async function () {
        await expect(computer.getConfig(token)).to.be.revertedWith("MissingConfig");
    });

    it("Returns the token config if it's set, with the default config being nil", async function () {
        const config = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(token, config);

        expect(await computer.getConfig(token)).to.deep.equal([
            config.rateProvider,
            config.index,
            config.highAvailability,
        ]);
    });

    it("Returns the token config if it's set, with the default config being set", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(AddressZero, defaultConfig);

        const config = {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        };

        await computer.setConfig(token, config);

        expect(await computer.getConfig(token)).to.deep.equal([
            config.rateProvider,
            config.index,
            config.highAvailability,
        ]);
    });

    it("Returns the default config if the token config is not set", async function () {
        const config = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(AddressZero, config);

        expect(await computer.getConfig(token)).to.deep.equal([
            config.rateProvider,
            config.index,
            config.highAvailability,
        ]);
    });

    it("Returns the default config after reverting to the default config", async function () {
        const defaultConfig = {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        };

        await computer.setConfig(AddressZero, defaultConfig);

        const config = {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        };

        await computer.setConfig(token, config);

        await computer.revertToDefaultConfig(token);

        expect(await computer.getConfig(token)).to.deep.equal([
            defaultConfig.rateProvider,
            defaultConfig.index,
            defaultConfig.highAvailability,
        ]);
    });
});

describe("HistoricalRatesComputer#computeRateIndex", function () {
    var computerFactory;
    var token;
    var computer;
    var rateController;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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

    it("Reverts if the token is address(0)", async function () {
        await expect(computer.computeRateIndex(AddressZero)).to.be.revertedWith("InvalidInput");
    });

    it("Reverts if there's no config for a token", async function () {
        await expect(computer.computeRateIndex(USDC)).to.be.revertedWith("MissingConfig");
    });

    it("Returns the index of the desired rate, without high availability, even if the rate isn't available", async function () {
        const index = 7;

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: index,
            highAvailability: false,
        });

        expect(await computer.computeRateIndex(token)).to.eq(index);
    });

    it("Returns the index of the desired rate, without high availability", async function () {
        const index = 1;

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: false,
        });

        await rateController.manuallyPushRate(token, 0, 0, 2);

        expect(await computer.computeRateIndex(token)).to.eq(index);
    });

    it("Returns 0 with high availability when there are no rates available", async function () {
        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        });

        expect(await computer.computeRateIndex(token)).to.eq(0);
    });

    it("Returns the index of the desired rate, with high availability", async function () {
        const index = 1;

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        });

        await rateController.manuallyPushRate(token, 0, 0, 2);

        expect(await computer.computeRateIndex(token)).to.eq(index);
    });

    it("Returns the index of the desired rate, with high availability, ignoring older rates", async function () {
        const index = 1;

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 1,
            highAvailability: true,
        });

        await rateController.manuallyPushRate(token, 0, 0, 10);

        expect(await computer.computeRateIndex(token)).to.eq(index);
    });
});

describe("HistoricalRatesComputer - IHistoricalRates implementation", function () {
    let rateControllerStubFactory;
    let historicalRatesComputerFactory;
    let token;

    let rateController;
    let computer;

    let rate0;
    let rate1;

    before(async function () {
        rateControllerStubFactory = await ethers.getContractFactory("RateControllerStub");
        historicalRatesComputerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const tokenContract = await tokenFactory.deploy("Token", "TKN", 18);
        await tokenContract.deployed();

        token = tokenContract.address;
    });

    beforeEach(async function () {
        const [signer] = await ethers.getSigners();

        rateController = await rateControllerStubFactory.deploy(
            DEFAULT_PERIOD,
            DEFAULT_INITIAL_BUFFER_CARDINALITY,
            DEFAULT_UPDATERS_MUST_BE_EAO
        );
        await rateController.deployed();

        computer = await historicalRatesComputerFactory.deploy(AddressZero, 0, false);

        await computer.setConfig(token, {
            rateProvider: rateController.address,
            index: 0,
            highAvailability: false,
        });

        await rateController.grantRole(RATE_ADMIN_ROLE, signer.address);
        await rateController.setConfig(token, MAX_CONFIG);
        await rateController.setConfig(USDC, MAX_CONFIG);

        // Allow anyone

        rate0 = ethers.constants.One;
        rate1 = ethers.constants.Two;

        await rateController.manuallyPushRate(token, rate1, rate1, 1);
        await rateController.manuallyPushRate(token, rate0, rate0, 1);

        await rateController.manuallyPushRate(USDC, rate1, rate1, 1);
        await rateController.manuallyPushRate(USDC, rate0, rate0, 1);
    });

    describe("getRateAt", function () {
        it("Reverts if there's no config for the token", async function () {
            await expect(computer.getRateAt(USDC, 0)).to.be.revertedWith("MissingConfig");
        });

        it("Calls the rate controller to get the rate at the desired index", async function () {
            expect((await computer.getRateAt(token, 0)).current).to.eq(1);
        });

        it("Calls the default rate controller to get the rate at the desired index", async function () {
            // Set the default
            await computer.setConfig(AddressZero, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            });

            expect((await computer.getRateAt(USDC, 0)).current).to.eq(1);
        });
    });

    describe("getRates(address,uint256)", function () {
        it("Reverts if there's no config for the token", async function () {
            await expect(computer["getRates(address,uint256)"](USDC, 2)).to.be.revertedWith("MissingConfig");
        });

        it("Calls the rate controller to get the rates at the desired index", async function () {
            const rates = await computer["getRates(address,uint256)"](token, 2);

            expect(rates).lengthOf(2);

            expect(rates[0].current).to.eq(rate0);
            expect(rates[1].current).to.eq(rate1);
        });

        it("Calls the default rate controller to get the rates at the desired index", async function () {
            // Set the default
            await computer.setConfig(AddressZero, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            });

            const rates = await computer["getRates(address,uint256)"](USDC, 2);

            expect(rates).lengthOf(2);

            expect(rates[0].current).to.eq(rate0);
            expect(rates[1].current).to.eq(rate1);
        });
    });

    describe("getRates(address,uint256,uint256,uint256)", function () {
        it("Reverts if there's no config for the token", async function () {
            await expect(computer["getRates(address,uint256,uint256,uint256)"](USDC, 2, 0, 1)).to.be.revertedWith(
                "MissingConfig"
            );
        });

        it("Calls the rate controller to get the rates at the desired index", async function () {
            const rates = await computer["getRates(address,uint256,uint256,uint256)"](token, 2, 0, 1);

            expect(rates).lengthOf(2);

            expect(rates[0].current).to.eq(rate0);
            expect(rates[1].current).to.eq(rate1);
        });

        it("Calls the default rate controller to get the rates at the desired index", async function () {
            // Set the default
            await computer.setConfig(AddressZero, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            });

            const rates = await computer["getRates(address,uint256,uint256,uint256)"](USDC, 2, 0, 1);

            expect(rates).lengthOf(2);

            expect(rates[0].current).to.eq(rate0);
            expect(rates[1].current).to.eq(rate1);
        });
    });

    describe("getRatesCount", function () {
        it("Reverts if there's no config for the token", async function () {
            await expect(computer.getRatesCount(USDC)).to.be.revertedWith("MissingConfig");
        });

        it("Calls the rate controller to get the rates count", async function () {
            expect(await computer.getRatesCount(token)).to.eq(2);
        });

        it("Calls the default rate controller to get the rates count", async function () {
            // Set the default
            await computer.setConfig(AddressZero, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            });

            expect(await computer.getRatesCount(USDC)).to.eq(2);
        });
    });

    describe("getRatesCapacity", function () {
        it("Reverts if there's no config for the token", async function () {
            await expect(computer.getRatesCapacity(USDC)).to.be.revertedWith("MissingConfig");
        });

        it("Calls the rate controller to get the rates capacity", async function () {
            expect(await computer.getRatesCapacity(token)).to.eq(DEFAULT_INITIAL_BUFFER_CARDINALITY);
        });

        it("Calls the default rate controller to get the rates capacity", async function () {
            // Set the default
            await computer.setConfig(AddressZero, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            });

            expect(await computer.getRatesCapacity(USDC)).to.eq(DEFAULT_INITIAL_BUFFER_CARDINALITY);
        });
    });

    describe("setRatesCapacity", function () {
        it("Reverts if there's no config for the token", async function () {
            await expect(computer.setRatesCapacity(USDC, 100)).to.be.revertedWith("MissingConfig");
        });

        it("Calls the rate controller to set the rates capacity", async function () {
            // Grant the computer the admin role to set the rates capacity
            await rateController.grantRole(ADMIN_ROLE, computer.address);

            await computer.setRatesCapacity(token, 100);

            expect(await computer.getRatesCapacity(token)).to.eq(100);
        });

        it("Calls the default rate controller to set the rates capacity", async function () {
            // Set the default
            await computer.setConfig(AddressZero, {
                rateProvider: rateController.address,
                index: 0,
                highAvailability: false,
            });

            // Grant the computer the admin role to set the rates capacity
            await rateController.grantRole(ADMIN_ROLE, computer.address);

            await computer.setRatesCapacity(USDC, 100);

            expect(await computer.getRatesCapacity(USDC)).to.eq(100);
        });
    });
});

describe("HistoricalRatesComputer#supportsInterface", function () {
    var computerFactory;
    var computer;
    var interfaceIds;

    before(async function () {
        computerFactory = await ethers.getContractFactory("HistoricalRatesComputerStub");

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

    it("Should support IHistoricalRates", async () => {
        const interfaceId = await interfaceIds.iHistoricalRates();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
