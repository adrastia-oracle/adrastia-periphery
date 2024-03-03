const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;
const AddressZero = ethers.constants.AddressZero;

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);

const PASS_THROUGH_CONFIG = {
    max: BigNumber.from(2).pow(64).sub(1),
    min: BigNumber.from(0),
    offset: BigNumber.from(0),
    scalar: DEFAULT_ONE_X_SCALAR.toNumber(),
};

const INVALID_CONFIG = {
    max: BigNumber.from(0),
    min: BigNumber.from(1), // min > max is invalid
    offset: BigNumber.from(0),
    scalar: DEFAULT_ONE_X_SCALAR.toNumber(),
};

const ZERO_CONFIG = {
    max: BigNumber.from(0),
    min: BigNumber.from(0),
    offset: BigNumber.from(0),
    scalar: 0,
};

const MINIMAL_CONFIG = {
    max: BigNumber.from(0),
    min: BigNumber.from(0),
    offset: BigNumber.from(0),
    scalar: 1,
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("MutatedValueComputer#constructor", function () {
    var factory;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("MutatedValueComputerStub");
    });

    it("Works with the default one x scalar", async function () {
        const computer = await factory.deploy(DEFAULT_ONE_X_SCALAR);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
    });

    it("Reverts if the default one x scalar is zero", async function () {
        await expect(factory.deploy(0)).to.be.revertedWith("InvalidOneXScalar");
    });

    it("Works with a non-default one x scalar", async function () {
        const computer = await factory.deploy(100);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(100);
    });
});

describe("MutatedValueComputer#setConfig", function () {
    var computer;

    beforeEach(async function () {
        const factory = await ethers.getContractFactory("MutatedValueComputerStub");

        computer = await factory.deploy(DEFAULT_ONE_X_SCALAR);
    });

    it("Works with a pass-through config", async function () {
        const tx = await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
        await expect(tx).to.emit(computer, "ConfigUpdated");
        const receipt = await tx.wait();
        const event = receipt.events?.find((e) => e.event === "ConfigUpdated");
        expect(event?.args?.token).to.equal(USDC);
        expect(event?.args?.oldConfig).to.deep.equal(Object.values(ZERO_CONFIG));
        expect(event?.args?.newConfig).to.deep.equal(Object.values(PASS_THROUGH_CONFIG));

        const config = await computer.getConfig(USDC);

        expect(config.max).to.equal(PASS_THROUGH_CONFIG.max);
        expect(config.min).to.equal(PASS_THROUGH_CONFIG.min);
        expect(config.offset).to.equal(PASS_THROUGH_CONFIG.offset);
        expect(config.scalar).to.equal(PASS_THROUGH_CONFIG.scalar);
    });

    it("Reverts if the min is greater than the max", async function () {
        await expect(
            computer.setConfig(
                USDC,
                INVALID_CONFIG.max,
                INVALID_CONFIG.min,
                INVALID_CONFIG.offset,
                INVALID_CONFIG.scalar
            )
        ).to.be.revertedWith("InvalidConfig");
    });

    it("Works with a minimal config", async function () {
        const tx = await computer.setConfig(
            USDC,
            MINIMAL_CONFIG.max,
            MINIMAL_CONFIG.min,
            MINIMAL_CONFIG.offset,
            MINIMAL_CONFIG.scalar
        );
        await expect(tx).to.emit(computer, "ConfigUpdated");
        const receipt = await tx.wait();
        const event = receipt.events?.find((e) => e.event === "ConfigUpdated");
        expect(event?.args?.token).to.equal(USDC);
        expect(event?.args?.oldConfig).to.deep.equal(Object.values(ZERO_CONFIG));
        expect(event?.args?.newConfig).to.deep.equal(Object.values(MINIMAL_CONFIG));

        const config = await computer.getConfig(USDC);

        expect(config.max).to.equal(MINIMAL_CONFIG.max);
        expect(config.min).to.equal(MINIMAL_CONFIG.min);
        expect(config.offset).to.equal(MINIMAL_CONFIG.offset);
        expect(config.scalar).to.equal(MINIMAL_CONFIG.scalar);
    });

    it("Works with setting the config for a second time", async function () {
        const tx1 = await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
        await expect(tx1).to.emit(computer, "ConfigUpdated");

        const newConfig = {
            max: BigNumber.from(2).pow(64).sub(2),
            min: BigNumber.from(2),
            offset: BigNumber.from(-1),
            scalar: 1000,
        };

        const tx2 = await computer.setConfig(USDC, newConfig.max, newConfig.min, newConfig.offset, newConfig.scalar);
        await expect(tx2).to.emit(computer, "ConfigUpdated");
        const receipt = await tx2.wait();
        const event = receipt.events?.find((e) => e.event === "ConfigUpdated");
        expect(event?.args?.token).to.equal(USDC);
        expect(event?.args?.oldConfig).to.deep.equal(Object.values(PASS_THROUGH_CONFIG));
        expect(event?.args?.newConfig).to.deep.equal(Object.values(newConfig));

        const config = await computer.getConfig(USDC);

        expect(config.max).to.equal(newConfig.max);
        expect(config.min).to.equal(newConfig.min);
        expect(config.offset).to.equal(newConfig.offset);
        expect(config.scalar).to.equal(newConfig.scalar);
    });

    it("Reverts when checkSetConfig reverts", async function () {
        await computer.stubSetRevertOnSetConfig(true);

        await expect(
            computer.setConfig(
                USDC,
                PASS_THROUGH_CONFIG.max,
                PASS_THROUGH_CONFIG.min,
                PASS_THROUGH_CONFIG.offset,
                PASS_THROUGH_CONFIG.scalar
            )
        ).to.be.revertedWith("revertOnSetConfig");
    });

    it("Reverts when the scalar is zero", async function () {
        await expect(
            computer.setConfig(USDC, PASS_THROUGH_CONFIG.max, PASS_THROUGH_CONFIG.min, PASS_THROUGH_CONFIG.offset, 0)
        ).to.be.revertedWith("InvalidConfig");
    });

    it("Allows a new min that's above the current rate", async function () {
        const tx1 = await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
        await expect(tx1).to.emit(computer, "ConfigUpdated");

        await computer.stubSetValue(USDC, BigNumber.from(100));

        const currentRate = await computer.computeRate(USDC);
        const newMin = currentRate.add(1);

        const tx2 = await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            newMin,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
        await expect(tx2).to.emit(computer, "ConfigUpdated");

        // Sanity check that the the rate is equal to the new min
        const newRate = await computer.computeRate(USDC);
        expect(newRate).to.equal(newMin);
    });

    it("Allows a new max that's below the current rate", async function () {
        const tx1 = await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
        await expect(tx1).to.emit(computer, "ConfigUpdated");

        await computer.stubSetValue(USDC, BigNumber.from(100));

        const currentRate = await computer.computeRate(USDC);
        const newMax = currentRate.sub(1);

        const tx2 = await computer.setConfig(
            USDC,
            newMax,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
        await expect(tx2).to.emit(computer, "ConfigUpdated");

        // Sanity check that the the rate is equal to the new max
        const newRate = await computer.computeRate(USDC);
        expect(newRate).to.equal(newMax);
    });
});

describe("MutatedValueComputer#computeRate", function () {
    var computer;

    beforeEach(async function () {
        const computerFactory = await ethers.getContractFactory("MutatedValueComputerStub");
        computer = await computerFactory.deploy(DEFAULT_ONE_X_SCALAR);
    });

    const commonTests = [
        BigNumber.from(0),
        BigNumber.from(1),
        BigNumber.from(2),
        BigNumber.from(2).pow(64).sub(1),
        BigNumber.from(2).pow(224).sub(1),
        BigNumber.from(2).pow(224),
        BigNumber.from(2).pow(256).sub(1),
    ];

    function clampWithConfig(value, config) {
        const result = BigNumber.from(value).mul(config.scalar).div(DEFAULT_ONE_X_SCALAR).add(config.offset);

        if (result.lt(config.min)) {
            return config.min;
        }

        if (result.gt(config.max)) {
            return config.max;
        }

        return result;
    }

    function describeTests(config) {
        describe("With the config", function () {
            const CONFIG = config;

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but subtracting 100k", function () {
            const CONFIG = {
                ...config,
                offset: BigNumber.from(-100000),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but adding 100k", function () {
            const CONFIG = {
                ...config,
                offset: BigNumber.from(100000),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but double", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(config.scalar).mul(2),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but double and adding 100k", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(config.scalar).mul(2),
                offset: BigNumber.from(100000),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but double and subtracting 100k", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(config.scalar).mul(2),
                offset: BigNumber.from(-100000),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but half", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(config.scalar).div(2),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but half and adding 100k", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(config.scalar).div(2),
                offset: BigNumber.from(100000),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but half and subtracting 100k", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(config.scalar).div(2),
                offset: BigNumber.from(-100000),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });

        describe("With the config but the scalar and offset are the maximum possible", function () {
            const CONFIG = {
                ...config,
                scalar: BigNumber.from(2).pow(32).sub(1),
                offset: BigNumber.from(2).pow(63).sub(1),
            };

            beforeEach(async function () {
                await computer.setConfig(USDC, CONFIG.max, CONFIG.min, CONFIG.offset, CONFIG.scalar);
            });

            for (const test of commonTests) {
                const expected = clampWithConfig(test, CONFIG);

                it(`Works with a value of ${test.toString()} where the expected result is ${expected.toString()}`, async function () {
                    await computer.stubSetValue(USDC, test);

                    expect(await computer.computeRate(USDC)).to.equal(expected);
                });
            }
        });
    }

    describe("With a pass-through config", function () {
        describeTests(PASS_THROUGH_CONFIG);
    });

    describe("With a pass-through config except the min is 2^63", function () {
        const config = {
            ...PASS_THROUGH_CONFIG,
            min: BigNumber.from(2).pow(63),
        };

        describeTests(config);
    });

    describe("With a pass-through config except the max is 2", function () {
        const config = {
            ...PASS_THROUGH_CONFIG,
            max: BigNumber.from(2),
        };

        describeTests(config);
    });

    describe("With a pass-through config except the min and max are 123456", function () {
        const config = {
            ...PASS_THROUGH_CONFIG,
            max: BigNumber.from(123456),
            min: BigNumber.from(123456),
        };

        describeTests(config);
    });

    it("Reverts if the config is not set", async function () {
        await expect(computer.computeRate(USDC)).to.be.revertedWith("MissingConfig");
    });
});

describe("MutatedValueComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const computerFactory = await ethers.getContractFactory("MutatedValueComputerStub");
        computer = await computerFactory.deploy(DEFAULT_ONE_X_SCALAR);

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
