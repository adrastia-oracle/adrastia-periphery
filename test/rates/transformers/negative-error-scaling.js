const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const DEFAULT_NUMERATOR = BigNumber.from(1);
const DEFAULT_DENOMINATOR = BigNumber.from(1);

describe("NegativeErrorScalingTransformer", function () {
    describe("NegativeErrorScalingTransformer#constructor", function () {
        var factory;

        before(async function () {
            factory = await ethers.getContractFactory("NegativeErrorScalingTransformer");
        });

        it("Should revert if the error scaling factor numerator is 0", async function () {
            await expect(factory.deploy(0, DEFAULT_DENOMINATOR)).to.be.revertedWith("InvalidScalingFactor");
        });

        it("Should revert if the error scaling factor denominator is 0", async function () {
            await expect(factory.deploy(DEFAULT_NUMERATOR, 0)).to.be.revertedWith("InvalidScalingFactor");
        });

        it("Should revert if the error scaling factor numerator is negative", async function () {
            await expect(factory.deploy(-1, DEFAULT_DENOMINATOR)).to.be.revertedWith("InvalidScalingFactor");
        });

        it("Should revert if the error scaling factor denominator is negative", async function () {
            await expect(factory.deploy(DEFAULT_NUMERATOR, -1)).to.be.revertedWith("InvalidScalingFactor");
        });
    });

    describe("NegativeErrorScalingTransformer#transformInputAndError", function () {
        var factory;

        beforeEach(async function () {
            factory = await ethers.getContractFactory("NegativeErrorScalingTransformer");
        });

        const testingPoints = [
            BigNumber.from(2).pow(128).mul(-1),
            BigNumber.from(-1),
            BigNumber.from(0),
            BigNumber.from(1),
            BigNumber.from(2).pow(128),
        ];

        const nFuzz = 10_000;

        for (const input of testingPoints) {
            describe("When the input is " + input.toString(), function () {
                for (const error of testingPoints) {
                    describe("When the error is " + error.toString(), function () {
                        if (error.lt(0)) {
                            it("Should double the error and leave input unchanged", async function () {
                                const transformer = await factory.deploy(2, 1);
                                const result = await transformer.transformInputAndError(input, error);
                                expect(result.transformedInput).to.eq(input);
                                expect(result.transformedError).to.eq(error.mul(2));
                            });

                            it("Should half the error and leave input unchanged", async function () {
                                const transformer = await factory.deploy(1, 2);
                                const result = await transformer.transformInputAndError(input, error);
                                expect(result.transformedInput).to.eq(input);
                                expect(result.transformedError).to.eq(error.div(2));
                            });
                        } else {
                            // Both input and error should be unchanged
                            it("Should leave input and error unchanged even with a scaling factor of 2x", async function () {
                                const transformer = await factory.deploy(2, 1);
                                const result = await transformer.transformInputAndError(input, error);
                                expect(result.transformedInput).to.eq(input);
                                expect(result.transformedError).to.eq(error);
                            });

                            it("Should leave input and error unchanged even with a scaling factor of 0.5x", async function () {
                                const transformer = await factory.deploy(1, 2);
                                const result = await transformer.transformInputAndError(input, error);
                                expect(result.transformedInput).to.eq(input);
                                expect(result.transformedError).to.eq(error);
                            });
                        }
                    });
                }
            });
        }

        it("Fuzzing with " + nFuzz + " random inputs and a scaling factor of 1", async function () {
            const transformer = await factory.deploy(1, 1);

            for (let i = 0; i < nFuzz; ++i) {
                const input = BigNumber.from(ethers.utils.randomBytes(16));
                const error = BigNumber.from(ethers.utils.randomBytes(16));

                const result = await transformer.transformInputAndError(input, error);
                expect(result.transformedInput).to.eq(input);
                expect(result.transformedError).to.eq(error);
            }
        });

        it("Fuzzing with " + nFuzz + " random inputs and a scaling factor of 0.5x", async function () {
            const transformer = await factory.deploy(1, 2);

            for (let i = 0; i < nFuzz; ++i) {
                const input = BigNumber.from(ethers.utils.randomBytes(16));
                const error = BigNumber.from(ethers.utils.randomBytes(16));

                var expectedError = error;
                if (error.lt(0)) {
                    expectedError = error.div(2);
                }

                const result = await transformer.transformInputAndError(input, error);
                expect(result.transformedInput).to.eq(input);
                expect(result.transformedError).to.eq(expectedError);
            }
        });

        it("Fuzzing with " + nFuzz + " random inputs and a scaling factor of 2x", async function () {
            const transformer = await factory.deploy(2, 1);

            for (let i = 0; i < nFuzz; ++i) {
                const input = BigNumber.from(ethers.utils.randomBytes(16));
                const error = BigNumber.from(ethers.utils.randomBytes(16));

                var expectedError = error;
                if (error.lt(0)) {
                    expectedError = error.mul(2);
                }

                const result = await transformer.transformInputAndError(input, error);
                expect(result.transformedInput).to.eq(input);
                expect(result.transformedError).to.eq(expectedError);
            }
        });
    });
});
