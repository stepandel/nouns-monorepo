import { default as NounsAuctionHouseABI } from '../abi/contracts/NounsAuctionHouse.sol/NounsAuctionHouse.json';
import { task, types } from 'hardhat/config';
import { Interface, parseUnits } from 'ethers/lib/utils';
import { Contract as EthersContract } from 'ethers';
import { ContractName } from './types';

type LocalContractName =
  | Exclude<ContractName, 'NounsDAOLogicV1' | 'NounsDAOProxy' | 'NounsDAOLogicV2' >
  | 'NounsDAOLogicV3'
  | 'NounsDAOProxyV3'
  | 'NounsDAOV3Admin'
  | 'NounsDAOV3DynamicQuorum'
  | 'NounsDAOV3Proposals'
  | 'NounsDAOV3Votes'
  | 'WETH'
  | 'Multicall2';

interface Contract {
  args?: (string | number | (() => string | undefined))[];
  instance?: EthersContract;
  libraries?: () => Record<string, string>;
  waitForConfirmation?: boolean;
}

task('deploy-local-dao-v3', 'Deploy contracts to hardhat')
  .addOptionalParam('noundersdao', 'The nounders DAO contract address')
  .addOptionalParam('auctionTimeBuffer', 'The auction time buffer (seconds)', 30, types.int) // Default: 30 seconds
  .addOptionalParam('auctionReservePrice', 'The auction reserve price (wei)', 1, types.int) // Default: 1 wei
  .addOptionalParam(
    'auctionMinIncrementBidPercentage',
    'The auction min increment bid percentage (out of 100)', // Default: 5%
    5,
    types.int,
  )
  .addOptionalParam('auctionDuration', 'The auction duration (seconds)', 60 * 2, types.int) // Default: 2 minutes
  .addOptionalParam('timelockDelay', 'The timelock delay (seconds)', 60 * 60 * 24 * 2, types.int) // Default: 2 days
  .addOptionalParam('votingPeriod', 'The voting period (blocks)', 4 * 60 * 24 * 3, types.int) // Default: 3 days
  .addOptionalParam('votingDelay', 'The voting delay (blocks)', 1, types.int) // Default: 1 block
  .addOptionalParam('proposalThresholdBps', 'The proposal threshold (basis points)', 500, types.int) // Default: 5%
  .addOptionalParam(
    'minQuorumVotesBPS',
    'Min basis points input for dynamic quorum',
    1_000,
    types.int,
  ) // Default: 10%
  .addOptionalParam(
    'maxQuorumVotesBPS',
    'Max basis points input for dynamic quorum',
    4_000,
    types.int,
  ) // Default: 40%
  .addOptionalParam('quorumCoefficient', 'Dynamic quorum coefficient (float)', 1, types.float)
  .setAction(async (args, { ethers }) => {
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337) {
      console.log(`Invalid chain id. Expected 31337. Got: ${network.chainId}.`);
      return;
    }

    const proxyRegistryAddress = '0xa5409ec958c83c3f309868babaca7c86dcb077c1';

    const NOUNS_ART_NONCE_OFFSET = 5;
    const AUCTION_HOUSE_PROXY_NONCE_OFFSET = 10;
    const GOVERNOR_N_DELEGATOR_NONCE_OFFSET = 17;

    const [deployer] = await ethers.getSigners();
    const nonce = await deployer.getTransactionCount();
    const expectedNounsArtAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + NOUNS_ART_NONCE_OFFSET,
    });
    const expectedNounsDAOProxyAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + GOVERNOR_N_DELEGATOR_NONCE_OFFSET,
    });
    const expectedAuctionHouseProxyAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: nonce + AUCTION_HOUSE_PROXY_NONCE_OFFSET,
    });
    const contracts: Record<LocalContractName, Contract> = {
      WETH: {},
      NFTDescriptorV2: {},
      SVGRenderer: {},
      NounsDescriptorV2: {
        args: [expectedNounsArtAddress, () => contracts.SVGRenderer.instance?.address],
        libraries: () => ({
          NFTDescriptorV2: contracts.NFTDescriptorV2.instance?.address as string,
        }),
      },
      Inflator: {},
      NounsArt: {
        args: [
          () => contracts.NounsDescriptorV2.instance?.address,
          () => contracts.Inflator.instance?.address,
        ],
      },
      NounsSeeder: {},
      NounsToken: {
        args: [
          args.noundersdao || deployer.address,
          expectedAuctionHouseProxyAddress,
          () => contracts.NounsDescriptorV2.instance?.address,
          () => contracts.NounsSeeder.instance?.address,
          proxyRegistryAddress,
        ],
      },
      NounsAuctionHouse: {
        waitForConfirmation: true,
      },
      NounsAuctionHouseProxyAdmin: {},
      NounsAuctionHouseProxy: {
        args: [
          () => contracts.NounsAuctionHouse.instance?.address,
          () => contracts.NounsAuctionHouseProxyAdmin.instance?.address,
          () =>
            new Interface(NounsAuctionHouseABI).encodeFunctionData('initialize', [
              contracts.NounsToken.instance?.address,
              contracts.WETH.instance?.address,
              args.auctionTimeBuffer,
              args.auctionReservePrice,
              args.auctionMinIncrementBidPercentage,
              args.auctionDuration,
            ]),
        ],
      },
      NounsDAOExecutor: {
        args: [expectedNounsDAOProxyAddress, args.timelockDelay],
      },
      NounsDAOV3DynamicQuorum: {},
      NounsDAOV3Admin: {
        libraries: () => ({
          NounsDAOV3DynamicQuorum: contracts.NounsDAOV3DynamicQuorum.instance?.address as string,
        })
      },
      NounsDAOV3Proposals: {},
      NounsDAOV3Votes: {},
      NounsDAOLogicV3: {
        libraries: () => ({
          NounsDAOV3Admin: contracts.NounsDAOV3Admin.instance?.address as string,
          NounsDAOV3DynamicQuorum: contracts.NounsDAOV3DynamicQuorum.instance?.address as string,
          NounsDAOV3Proposals: contracts.NounsDAOV3Proposals.instance?.address as string,
          NounsDAOV3Votes: contracts.NounsDAOV3Votes.instance?.address as string,
        }),
        waitForConfirmation: true,
      },
      NounsDAOProxyV3: {
        args: [
          () => contracts.NounsDAOExecutor.instance?.address, // timelock
          () => contracts.NounsToken.instance?.address, // token
          args.noundersdao || deployer.address, // vetoer
          () => contracts.NounsDAOExecutor.instance?.address, // admin
          () => contracts.NounsDAOLogicV3.instance?.address, // implementation
          args.votingPeriod, // votingPeriod
          args.votingDelay, // votingDelay
          args.proposalThresholdBps, // proposalThresholdBps
          {
            minQuorumVotesBPS: args.minQuorumVotesBPS,
            maxQuorumVotesBPS: args.maxQuorumVotesBPS,
            quorumCoefficient: parseUnits(args.quorumCoefficient.toString(), 6),
          }, // DynamicQuorumParams
          0, // lastMinuteWindowInBlocks
          0, // objectionPeriodDurationInBlocks
          0, // proposalUpdatablePeriodInBlocks
        ],
        waitForConfirmation: true,
      },
      Multicall2: {},
    };

    for (const [name, contract] of Object.entries(contracts)) {
      const factory = await ethers.getContractFactory(name, {
        libraries: contract?.libraries?.(),
      });

      const deployedContract = await factory.deploy(
        ...(contract.args?.map(a => (typeof a === 'function' ? a() : a)) ?? []),
      );

      if (contract.waitForConfirmation) {
        await deployedContract.deployed();
      }

      contracts[name as LocalContractName].instance = deployedContract;

      console.log(`${name} contract deployed to ${deployedContract.address}`);
    }

    if (expectedNounsArtAddress !== contracts.NounsArt.instance?.address) {
      console.log(`wrong art address expected: ${expectedNounsArtAddress} actual: ${contracts.NounsArt.instance?.address}`);
      throw 'wrong address';
    }

    if (expectedAuctionHouseProxyAddress !== contracts.NounsAuctionHouseProxy.instance?.address) {
      console.log(`wrong auctio house proxy address expected: ${expectedAuctionHouseProxyAddress} actual: ${contracts.NounsAuctionHouseProxy.instance?.address}`);
      throw 'wrong address';
    }

    if (expectedNounsDAOProxyAddress !== contracts.NounsDAOProxyV3.instance?.address) {
      console.log(`wrong dao proxy address expected: ${expectedNounsDAOProxyAddress} actual: ${contracts.NounsDAOProxyV3.instance?.address}`);
      throw 'wrong address';
    }

    return contracts;
  });