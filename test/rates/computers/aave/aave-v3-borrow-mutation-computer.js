const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;
const AddressZero = ethers.constants.AddressZero;

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const NON_ERC20 = "0x0000000000000000000000000000000000000001";

const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);
const DEFAULT_DECIMALS = 18;
const DEFAULT_DECIMAL_OFFSET = 0;

const PASS_THROUGH_CONFIG = {
    max: BigNumber.from(2).pow(64).sub(1),
    min: BigNumber.from(0),
    offset: BigNumber.from(0),
    scalar: DEFAULT_ONE_X_SCALAR.toNumber(),
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("AaveV3BorrowMutationComputer#constructor", function () {
    var factory;
    var aclManager;
    var lendingPool;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");

        const [owner] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(owner.address, false);

        const lendingPoolFactory = await ethers.getContractFactory("AaveV3LendingPoolStub");
        lendingPool = await lendingPoolFactory.deploy();

        await aclManager.deployed();
        await lendingPool.deployed();
    });

    it("Works with the default one x scalar, decimals, and decimal offset", async function () {
        const computer = await factory.deploy(
            aclManager.address,
            lendingPool.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );

        await computer.deployed();

        expect(await computer.aclManager()).to.equal(aclManager.address);
        expect(await computer.lendingPool()).to.equal(lendingPool.address);
        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
    });

    it("Reverts if the default one x scalar is zero", async function () {
        await expect(
            factory.deploy(aclManager.address, lendingPool.address, 0, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET)
        ).to.be.revertedWith("InvalidOneXScalar");
    });

    it("Works with a non-default one x scalar", async function () {
        const computer = await factory.deploy(
            aclManager.address,
            lendingPool.address,
            100,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );

        await computer.deployed();

        expect(await computer.aclManager()).to.equal(aclManager.address);
        expect(await computer.lendingPool()).to.equal(lendingPool.address);
        expect(await computer.defaultOneXScalar()).to.equal(100);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
    });

    it("Works with a non-default default decimals", async function () {
        const computer = await factory.deploy(
            aclManager.address,
            lendingPool.address,
            DEFAULT_ONE_X_SCALAR,
            100,
            DEFAULT_DECIMAL_OFFSET
        );

        await computer.deployed();

        expect(await computer.aclManager()).to.equal(aclManager.address);
        expect(await computer.lendingPool()).to.equal(lendingPool.address);
        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(100);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
    });

    it("Works with a non-default decimals offset", async function () {
        const computer = await factory.deploy(
            aclManager.address,
            lendingPool.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            100
        );

        await computer.deployed();

        expect(await computer.aclManager()).to.equal(aclManager.address);
        expect(await computer.lendingPool()).to.equal(lendingPool.address);
        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(100);
    });
});

describe("AaveV3BorrowMutationComputer#getValue", function () {
    var computer;
    var aclManager;
    var lendingPool;
    var token;
    var stableDebtToken;
    var variableDebtToken;

    beforeEach(async function () {
        const [owner] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(owner.address, true);
        const lendingPoolFactory = await ethers.getContractFactory("AaveV3LendingPoolStub");
        lendingPool = await lendingPoolFactory.deploy();

        await aclManager.deployed();
        await lendingPool.deployed();
    });

    const commonTests = [
        BigNumber.from(0),
        BigNumber.from(1),
        BigNumber.from(2),
        BigNumber.from(10).pow(18 + 9),
        BigNumber.from(2).pow(256).sub(1),
    ];

    const defaultDecimalsToTest = [18, 6, 0];

    const decimalOffsetsToTest = [0, 1, -1];

    function calculateExpectedValue(value, decimals, decimalsOffset) {
        var result = BigNumber.from(value);

        if (decimalsOffset > 0) {
            result = result.mul(BigNumber.from(10).pow(decimalsOffset));
        } else if (decimalsOffset < 0) {
            result = result.div(BigNumber.from(10).pow(-decimalsOffset));
        }

        result = result.div(BigNumber.from(10).pow(decimals));
        if (result.gt(ethers.constants.MaxUint256)) {
            return ethers.constants.MaxUint256;
        }

        return result;
    }

    function describeTests(decimals, decimalsOffset) {
        for (const stableBorrowAmount of commonTests) {
            for (const variableBorrowAmount of commonTests) {
                var total = stableBorrowAmount.add(variableBorrowAmount);
                if (total.gt(ethers.constants.MaxUint256)) {
                    total = ethers.constants.MaxUint256;
                }

                const expected = calculateExpectedValue(total, decimals, decimalsOffset);

                it(`Works with a stable debt of ${stableBorrowAmount.toString()} and a variable debt of ${variableBorrowAmount.toString()}, and the result is ${expected.toString()}`, async function () {
                    const erc20Factory = await ethers.getContractFactory("FakeERC20");
                    stableDebtToken = await erc20Factory.deploy("Stable debt", "sdToken", decimals);
                    variableDebtToken = await erc20Factory.deploy("Variable debt", "vdToken", decimals);

                    const [owner] = await ethers.getSigners();

                    // Mint stableBorrowAmount amount of tokens
                    await stableDebtToken.mint(owner.address, stableBorrowAmount);
                    // Mint variableBorrowAmount amount of tokens
                    await variableDebtToken.mint(owner.address, variableBorrowAmount);

                    // Configure the lending pool to use the tokens
                    await lendingPool.setStableDebtToken(token, stableDebtToken.address);
                    await lendingPool.setVariableDebtToken(token, variableDebtToken.address);

                    // Allow for some rounding error with very large numbers
                    const allowedDelta = expected.div(BigNumber.from(10).pow(36));

                    expect(await computer.stubGetValue(token)).to.be.closeTo(expected, allowedDelta);
                });
            }
        }
    }

    for (const defaultDecimals of defaultDecimalsToTest) {
        describe(`Using a default decimals of ${defaultDecimals}`, function () {
            for (const decimalsOffset of decimalOffsetsToTest) {
                describe(`Using a decimals offset of ${decimalsOffset}`, function () {
                    describe("Using a token with 18 decimals", function () {
                        beforeEach(async function () {
                            const computerFactory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");
                            computer = await computerFactory.deploy(
                                aclManager.address,
                                lendingPool.address,
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );

                            token = GRT;
                        });

                        describeTests(18, decimalsOffset);
                    });

                    describe("Using a token with 6 decimals", function () {
                        beforeEach(async function () {
                            const computerFactory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");
                            computer = await computerFactory.deploy(
                                aclManager.address,
                                lendingPool.address,
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );

                            token = USDC;
                        });

                        describeTests(6, decimalsOffset);
                    });

                    describe("Using a non-standard token where we use the default decimals", function () {
                        beforeEach(async function () {
                            const computerFactory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");
                            computer = await computerFactory.deploy(
                                aclManager.address,
                                lendingPool.address,
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );

                            token = NON_ERC20;
                        });

                        describeTests(defaultDecimals, decimalsOffset);
                    });
                });
            }
        });
    }

    it("Reverts if the token address is zero", async function () {
        const computerFactory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");
        computer = await computerFactory.deploy(
            aclManager.address,
            lendingPool.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );

        await expect(computer.stubGetValue(ethers.constants.AddressZero)).to.be.revertedWith("InvalidInput");
    });
});

describe("AaveV3BorrowMutationComputer#setConfig", function () {
    var aclManager;
    var lendingPool;
    var computer;

    beforeEach(async function () {
        const [owner] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(owner.address, true);
        const lendingPoolFactory = await ethers.getContractFactory("AaveV3LendingPoolStub");
        lendingPool = await lendingPoolFactory.deploy();

        await aclManager.deployed();
        await lendingPool.deployed();

        const computerFactory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");
        computer = await computerFactory.deploy(
            aclManager.address,
            lendingPool.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
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

describe("AaveV3BorrowMutationComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const computerFactory = await ethers.getContractFactory("AaveV3BorrowMutationComputerStub");
        computer = await computerFactory.deploy(
            AddressZero,
            AddressZero,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
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
});
