const { expect } = require("chai");
const { ethers, timeAndMine } = require("hardhat");
const { currentBlockTimestamp } = require("../../../../../src/time");

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

const PERIOD = 100;
const INITIAL_BUFFER_CARDINALITY = 2;
const UPDATERS_MUST_BE_EOA = false;
const COMPUTE_AHEAD = true;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const PSEUDO_BNB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";

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

const HOOK_TYPE_PRE_UPDATE = 0;

async function deployStandardController(overrides, contractName = "ManagedRateController") {
    const controllerFactory = await ethers.getContractFactory(contractName);

    const period = overrides?.period ?? PERIOD;
    const initialBufferCardinality = overrides?.initialBufferCardinality ?? INITIAL_BUFFER_CARDINALITY;
    const updaterMustBeEoa = overrides?.updaterMustBeEoa ?? UPDATERS_MUST_BE_EOA;
    const computeAhead = overrides?.computeAhead ?? COMPUTE_AHEAD;

    controller = await controllerFactory.deploy(computeAhead, period, initialBufferCardinality, updaterMustBeEoa);

    return {
        controller: controller,
    };
}

describe("VenusAccrueInterestHook#constructor", function () {
    it("Works", async function () {
        const poolStubFactory = await ethers.getContractFactory("IonicStub");
        const poolStub = await poolStubFactory.deploy();
        await poolStub.deployed();

        const hookFactory = await ethers.getContractFactory("VenusAccrueInterestHook");
        const hook = await hookFactory.deploy(poolStub.address, PSEUDO_BNB);
        await hook.deployed();

        expect(await hook.comptroller()).to.equal(poolStub.address);
        expect(await hook.nativePseudoAddress()).to.equal(PSEUDO_BNB);
    });
});

describe("VenusAccrueInterestHook#refreshTokenMappings", function () {
    let poolStubFactory;
    let cTokenFactory;
    let hookFactory;

    let poolStub;
    let hook;

    before(async function () {
        cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
        hookFactory = await ethers.getContractFactory("VenusAccrueInterestHook");
        poolStubFactory = await ethers.getContractFactory("IonicStub");
    });

    beforeEach(async function () {
        poolStub = await poolStubFactory.deploy();
        await poolStub.deployed();
        hook = await hookFactory.deploy(poolStub.address, PSEUDO_BNB);
        await hook.deployed();

        // Remove all markets and refresh the mapping
        await poolStub.stubRemoveAllMarkets();
        await hook.refreshTokenMappings();
    });

    it("Reverts if there are two markets for a single underlying token", async function () {
        const usdcCToken1 = await cTokenFactory.deploy(USDC);
        await usdcCToken1.deployed();
        const usdcCToken2 = await cTokenFactory.deploy(USDC);
        await usdcCToken2.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken1.address);
        await poolStub["stubAddMarket(address)"](usdcCToken2.address);

        await expect(hook.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Reverts if the same market is listed twice", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address,bool,bool)"](usdcCToken.address, false, true);

        await expect(hook.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Reverts if two different CEther tokens are listed", async function () {
        const cEther1 = await cTokenFactory.deploy(WETH);
        await cEther1.deployed();
        const cEther2 = await cTokenFactory.deploy(WETH);
        await cEther2.deployed();

        await cEther1.stubSetIsCEther(true);
        await cEther2.stubSetIsCEther(true);

        await poolStub["stubAddMarket(address)"](cEther1.address);
        await poolStub["stubAddMarket(address)"](cEther2.address);

        await expect(hook.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Discovers one market - WETH", async function () {
        const cToken = await cTokenFactory.deploy(WETH);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](cToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cToken.address);
        expect(receipt.events.length).to.equal(2);

        const contractVTokenAddress = await hook.tokenToVToken(WETH);
        expect(contractVTokenAddress).to.equal(cToken.address);
    });

    it("Discovers one market - USDC", async function () {
        const cToken = await cTokenFactory.deploy(USDC);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](cToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cToken.address);
        expect(receipt.events.length).to.equal(2);

        const contractVTokenAddress = await hook.tokenToVToken(USDC);
        expect(contractVTokenAddress).to.equal(cToken.address);
    });

    it("Discovers two markets - USDC and WETH", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address)"](wethCToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(2, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(usdcCToken.address);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(wethCToken.address);
        expect(receipt.events.length).to.equal(3);

        const usdcVTokenAddress = await hook.tokenToVToken(USDC);
        expect(usdcVTokenAddress).to.equal(usdcCToken.address);

        const wethVTokenAddress = await hook.tokenToVToken(WETH);
        expect(wethVTokenAddress).to.equal(wethCToken.address);
    });

    it("Discovers one new market", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await hook.refreshTokenMappings();

        await poolStub["stubAddMarket(address)"](wethCToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(wethCToken.address);
        expect(receipt.events.length).to.equal(2);

        const usdcVTokenAddress = await hook.tokenToVToken(USDC);
        expect(usdcVTokenAddress).to.equal(usdcCToken.address);

        const wethVTokenAddress = await hook.tokenToVToken(WETH);
        expect(wethVTokenAddress).to.equal(wethCToken.address);
    });

    it("Discovers the removal of a market", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address)"](wethCToken.address);
        await hook.refreshTokenMappings();

        await poolStub["stubRemoveMarket(address)"](usdcCToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(0, 1);
        expect(refreshTx).to.emit(hook, "VTokenRemoved").withArgs(usdcCToken.address);
        expect(receipt.events.length).to.equal(2);

        await expect(hook.tokenToVToken(USDC)).to.be.revertedWith("InvalidToken");

        const wethVTokenAddress = await hook.tokenToVToken(WETH);
        expect(wethVTokenAddress).to.equal(wethCToken.address);
    });

    it("Discovers the removal of all markets", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address)"](wethCToken.address);
        await hook.refreshTokenMappings();

        await poolStub.stubRemoveAllMarkets();
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(0, 2);
        expect(refreshTx).to.emit(hook, "VTokenRemoved").withArgs(usdcCToken.address);
        expect(refreshTx).to.emit(hook, "VTokenRemoved").withArgs(wethCToken.address);
        expect(receipt.events.length).to.equal(3);

        await expect(hook.tokenToVToken(USDC)).to.be.revertedWith("InvalidToken");
        await expect(hook.tokenToVToken(WETH)).to.be.revertedWith("InvalidToken");
    });

    it("Discovers the additon and removal of markets", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await hook.refreshTokenMappings();

        await poolStub["stubAddMarket(address)"](wethCToken.address);
        await poolStub["stubRemoveMarket(address)"](usdcCToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 1);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(wethCToken.address);
        expect(refreshTx).to.emit(hook, "VTokenRemoved").withArgs(usdcCToken.address);
        expect(receipt.events.length).to.equal(3);

        await expect(hook.tokenToVToken(USDC)).to.be.revertedWith("InvalidToken");

        const wethVTokenAddress = await hook.tokenToVToken(WETH);
        expect(wethVTokenAddress).to.equal(wethCToken.address);
    });

    it("Works even if nothing changes", async function () {
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(0, 0);
        expect(receipt.events.length).to.equal(1);
    });

    it("CTokens without underlying tokens are treated as CEther", async function () {
        const cToken = await cTokenFactory.deploy(WETH);
        await cToken.deployed();

        await cToken.stubSetIsCEther(true);

        await poolStub["stubAddMarket(address)"](cToken.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cToken.address);
        expect(receipt.events.length).to.equal(2);
    });

    it("Skips markets whose cToken is address(0)", async function () {
        const cToken = await cTokenFactory.deploy(WETH);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](ethers.constants.AddressZero);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(0, 0);
        expect(receipt.events.length).to.equal(1);
    });

    it("CEther with a non-reverting fallback doesn't cause problems", async function () {
        const cEtherFactory = await ethers.getContractFactory("CEtherStub");
        const cEther = await cEtherFactory.deploy();

        await poolStub["stubAddMarket(address)"](cEther.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cEther.address);
        expect(receipt.events.length).to.equal(2);
    });

    it("CEther with a reverting fallback doesn't cause problems", async function () {
        const cEtherFactory = await ethers.getContractFactory("CEtherStub");
        const cEther = await cEtherFactory.deploy();

        await cEther.stubSetRevertInFallback(true);

        await poolStub["stubAddMarket(address)"](cEther.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cEther.address);
        expect(receipt.events.length).to.equal(2);
    });

    it("CEther with a gas-guzzling fallback doesn't cause problems", async function () {
        const cEtherFactory = await ethers.getContractFactory("CEtherStub");
        const cEther = await cEtherFactory.deploy();

        await cEther.stubSetConsumeGasInFallback(true);

        await poolStub["stubAddMarket(address)"](cEther.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cEther.address);
        expect(receipt.events.length).to.equal(2);
    });

    it("CEther with a state-modifying fallback doesn't cause problems", async function () {
        const cEtherFactory = await ethers.getContractFactory("CEtherStub");
        const cEther = await cEtherFactory.deploy();

        await cEther.stubSetWriteInFallback(true);

        await poolStub["stubAddMarket(address)"](cEther.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cEther.address);
        expect(receipt.events.length).to.equal(2);
    });

    it("Two CEther with a gas-guzzling fallback is reverted with DuplicateMarket", async function () {
        const cEtherFactory = await ethers.getContractFactory("CEtherStub");
        const cEther1 = await cEtherFactory.deploy();
        const cEther2 = await cEtherFactory.deploy();

        await cEther1.stubSetConsumeGasInFallback(true);
        await cEther2.stubSetConsumeGasInFallback(true);

        await poolStub["stubAddMarket(address)"](cEther1.address);
        await poolStub["stubAddMarket(address)"](cEther2.address);

        await expect(hook.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Maps cEther to the BNB pseudo address", async function () {
        const cEtherFactory = await ethers.getContractFactory("CEtherStub");
        const cEther = await cEtherFactory.deploy();

        await poolStub["stubAddMarket(address)"](cEther.address);
        const refreshTx = await hook.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(hook, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(hook, "VTokenAdded").withArgs(cEther.address);
        expect(receipt.events.length).to.equal(2);

        const contractVTokenAddress = await hook.tokenToVToken(PSEUDO_BNB);
        expect(contractVTokenAddress).to.equal(cEther.address);
    });
});

describe("VenusAccrueInterestHook#onPostControllerUpdate", function () {
    it("Reverts", async function () {
        const poolStubFactory = await ethers.getContractFactory("IonicStub");
        const hookFactory = await ethers.getContractFactory("VenusAccrueInterestHook");

        poolStub = await poolStubFactory.deploy();
        await poolStub.deployed();
        hook = await hookFactory.deploy(poolStub.address, PSEUDO_BNB);
        await hook.deployed();

        await expect(
            hook.onPostControllerUpdate(USDC, {
                target: 1,
                current: 1,
                timestamp: 1,
            })
        ).to.be.revertedWith("Not implemented");
    });
});

describe("VenusAccrueInterestHook - integration tests", function () {
    let poolStubFactory;
    let cTokenFactory;
    let hookFactory;
    let controllerFactory;

    let poolStub;
    let hook;
    let controller;

    let token;
    let cToken;

    before(async function () {
        cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
        hookFactory = await ethers.getContractFactory("VenusAccrueInterestHook");
        poolStubFactory = await ethers.getContractFactory("IonicStub");
        controllerFactory = await ethers.getContractFactory("ManagedRateController");
    });

    beforeEach(async function () {
        poolStub = await poolStubFactory.deploy();
        await poolStub.deployed();
        hook = await hookFactory.deploy(poolStub.address, PSEUDO_BNB);
        await hook.deployed();

        const controllerDeployment = await deployStandardController();
        controller = controllerDeployment.controller;

        token = USDC;
        cToken = await cTokenFactory.deploy(token);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](cToken.address);
        await hook.refreshTokenMappings();

        // Setup the controller - permissions
        const [owner] = await ethers.getSigners();
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, owner.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);
        await controller.grantRole(RATE_ADMIN_ROLE, owner.address);

        // Setup the controller - config
        await controller.setConfig(token, DEFAULT_CONFIG);

        await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
            allowHookFailure: false,
            hookGasLimit: 1_000_000,
            hookAddress: hook.address,
        });

        await cToken.stubSetRateComputer(controller.address);
    });

    it("Doesn't call accrueInterest when the controller doesn't have a rate", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

        await expect(controller.update(updateData)).to.emit(controller, "RateUpdated");

        expect(await cToken.stubAccrueInterestCallTimes()).to.equal(0);
    });

    it("Calls accrueInterest once when the controller has a rate", async function () {
        const rate = ethers.utils.parseUnits("0.05", 18); // 5%
        await controller.manuallyPushRate(token, rate, rate, 1);

        // Advance the time s.t. an update is needed
        await timeAndMine.increaseTime(PERIOD + 1);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

        // Sanity check
        expect(await cToken.stubAccrueInterestCallTimes()).to.equal(0);

        await expect(controller.update(updateData)).to.emit(controller, "RateUpdated");

        expect(await cToken.stubAccrueInterestCallTimes()).to.equal(1);
    });

    it("Reverts if it fails to accrue interest", async function () {
        const rate = ethers.utils.parseUnits("0.05", 18); // 5%
        await controller.manuallyPushRate(token, rate, rate, 1);

        // Advance the time s.t. an update is needed
        await timeAndMine.increaseTime(PERIOD + 1);

        const errorCode = 123;

        // Make the cToken revert on accrueInterest
        await cToken.stubSetAccrueInterestReturnCode(errorCode);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

        // Encode the expected inner revert reason
        const expectedInnerError = new ethers.utils.Interface([
            "error FailedToAccrueInterest(address token, address vToken, uint256 code)",
        ]).encodeErrorResult("FailedToAccrueInterest", [token, cToken.address, errorCode]);

        await expect(controller.update(updateData))
            .to.be.revertedWith("HookFailedError")
            .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, expectedInnerError);

        expect(await cToken.stubAccrueInterestCallTimes()).to.equal(0);
    });

    it("Doesn't accrue interest upon failure, with allowHookFailure set to true", async function () {
        const rate = ethers.utils.parseUnits("0.05", 18); // 5%
        await controller.manuallyPushRate(token, rate, rate, 1);

        // Advance the time s.t. an update is needed
        await timeAndMine.increaseTime(PERIOD + 1);

        const errorCode = 123;

        // Make the cToken revert on accrueInterest
        await cToken.stubSetAccrueInterestReturnCode(errorCode);

        // Set the hook to allow failure
        await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
            allowHookFailure: true,
            hookGasLimit: 1_000_000,
            hookAddress: hook.address,
        });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

        // Encode the expected inner revert reason
        const expectedInnerError = new ethers.utils.Interface([
            "error FailedToAccrueInterest(address token, address vToken, uint256 code)",
        ]).encodeErrorResult("FailedToAccrueInterest", [token, cToken.address, errorCode]);

        const updatePromise = controller.update(updateData);

        await expect(updatePromise).to.emit(controller, "RateUpdated");

        const timestamp = await currentBlockTimestamp();

        await expect(updatePromise)
            .to.emit(controller, "HookFailed")
            .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, expectedInnerError, timestamp);

        expect(await cToken.stubAccrueInterestCallTimes()).to.equal(0);
    });
});
