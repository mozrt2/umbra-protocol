import { ethers } from 'hardhat';
import hardhatConfig from '../hardhat.config';
import { Umbra } from '../src/classes/Umbra';
import { BigNumberish, BigNumber, StaticJsonRpcProvider, Wallet, ContractTransaction } from '../src/ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { HardhatNetworkHDAccountsUserConfig } from 'hardhat/src/types/config';
import { expect } from 'chai';
import { expectRejection } from './utils';
import { testPrivateKeys } from './testPrivateKeys';
import type { ChainConfig, SendBatch, UserAnnouncement } from '../src/types';
import {
  TestToken as ERC20,
  Umbra as UmbraContract,
  TestTokenFactory as ERC20__factory,
  UmbraFactory as Umbra__factory,
} from '@umbra/contracts-core/typechain';
import { parseOverrides } from '../src/classes/Umbra';
import { UMBRA_BATCH_SEND_ABI } from '../src/utils/constants';
import { KeyPair } from '../src';
const { parseEther } = ethers.utils;
const ethersProvider = ethers.provider;
const jsonRpcProvider = new StaticJsonRpcProvider(hardhatConfig.networks?.hardhat?.forking?.url);

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const quantity = parseEther('5');
const overrides = { supportPubKey: true }; // we directly enter a pubkey in these tests for convenience

// We don't use the 0 or 1 index just to reduce the chance of conflicting with a signer for another use case
const senderIndex = 2;
const receiverIndex = 3;

describe.only('Umbra class', () => {
  let sender: Wallet;
  let receiver: Wallet;
  let receivers: Wallet[] = [];
  let deployer: SignerWithAddress;

  let dai: ERC20;
  let umbra: Umbra;
  let chainConfig: ChainConfig;

  const getEthBalance = async (address: string) => {
    return (await ethersProvider.getBalance(address)).toString();
  };
  const verifyEqualValues = (val1: BigNumberish, val2: BigNumberish) => {
    expect(BigNumber.from(val1).toString()).to.equal(BigNumber.from(val2).toString());
  };

  before(async () => {
    // Load signers' mnemonic and derivation path from hardhat config
    const accounts = hardhatConfig.networks?.hardhat?.accounts as HardhatNetworkHDAccountsUserConfig;
    const { mnemonic, path } = accounts;

    // Get the wallets of interest. The hardhat signers are generated by appending "/index" to the derivation path,
    // so we do the same to instantiate our wallets. Private key can now be accessed by `sender.privateKey`
    sender = ethers.Wallet.fromMnemonic(mnemonic as string, `${path as string}/${senderIndex}`);
    sender.connect(ethers.provider);
    receiver = ethers.Wallet.fromMnemonic(mnemonic as string, `${path as string}/${receiverIndex}`);
    receiver.connect(ethers.provider);
    receivers.push(receiver);
    for (let i = 4; i < 10; i++) {
      receivers.push(ethers.Wallet.fromMnemonic(mnemonic as string, `${path as string}/${i}`));
      receivers[i - 3].connect(ethers.provider);
    }

    // Load other signers
    deployer = (await ethers.getSigners())[0]; // used for deploying contracts
  });

  beforeEach(async () => {
    // Deploy Umbra
    const toll = parseEther('0.1');
    const tollCollector = ethers.constants.AddressZero; // doesn't matter for these tests
    const tollReceiver = ethers.constants.AddressZero; // doesn't matter for these tests
    const umbraFactory = new Umbra__factory(deployer);
    const umbraContract = (await umbraFactory.deploy(toll, tollCollector, tollReceiver)) as UmbraContract;
    await umbraContract.deployTransaction.wait();

    // Deploy mock tokens
    const daiFactory = new ERC20__factory(deployer);
    dai = (await daiFactory.deploy('Dai', 'DAI')) as ERC20;
    await dai.deployTransaction.wait();

    // Deploy UmbraBatchSend
    const batchSendFactory = new ethers.ContractFactory(
      UMBRA_BATCH_SEND_ABI,
      { object: '0x60a060405234801561001057600080fd5b5060405161118038038061118083398101604081905261002f91610099565b61003833610049565b6001600160a01b03166080526100c9565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b6000602082840312156100ab57600080fd5b81516001600160a01b03811681146100c257600080fd5b9392505050565b60805161108e6100f2600039600081816102ef0152818161044c015261066b015261108e6000f3fe60806040526004361061005a5760003560e01c806380b2edd81161004357806380b2edd8146100895780638da5cb5b146100a9578063f2fde38b146100e257600080fd5b8063715018a61461005f5780637d703ead14610076575b600080fd5b34801561006b57600080fd5b50610074610102565b005b610074610084366004610e3d565b610116565b34801561009557600080fd5b506100746100a4366004610ede565b610647565b3480156100b557600080fd5b506000546040805173ffffffffffffffffffffffffffffffffffffffff9092168252519081900360200190f35b3480156100ee57600080fd5b506100746100fd366004610ede565b6106b3565b61010a61076c565b61011460006107ed565b565b47816000805b828210156102885760008173ffffffffffffffffffffffffffffffffffffffff1687878581811061014f5761014f610f02565b905060a0020160200160208101906101679190610ede565b73ffffffffffffffffffffffffffffffffffffffff1610156101b5576040517fba50f91100000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8686848181106101c7576101c7610f02565b905060a0020160200160208101906101df9190610ede565b91505b8686848181106101f4576101f4610f02565b905060a0020160400135816102099190610f60565b9050600183019250838310801561027457508173ffffffffffffffffffffffffffffffffffffffff1687878581811061024457610244610f02565b905060a00201602001602081019061025c9190610ede565b73ffffffffffffffffffffffffffffffffffffffff16145b6101e2576102828282610862565b5061011c565b60005b838110156105d05773eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee8787838181106102ba576102ba610f02565b905060a0020160200160208101906102d29190610ede565b73ffffffffffffffffffffffffffffffffffffffff160361044a577f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663beb9addf8989898581811061033c5761033c610f02565b905060a00201604001356103509190610f60565b89898581811061036257610362610f02565b61037892602060a0909202019081019150610ede565b8b8b8b8781811061038b5761038b610f02565b905060a00201606001358c8c888181106103a7576103a7610f02565b6040517fffffffff0000000000000000000000000000000000000000000000000000000060e08a901b16815273ffffffffffffffffffffffffffffffffffffffff90961660048701526024860194909452506044840191909152608060a090920201013560648201526084016000604051808303818588803b15801561042c57600080fd5b505af1158015610440573d6000803e3d6000fd5b50505050506105c8565b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663b9bfabe18989898581811061049957610499610f02565b6104af92602060a0909202019081019150610ede565b8a8a868181106104c1576104c1610f02565b905060a0020160200160208101906104d99190610ede565b8b8b878181106104eb576104eb610f02565b905060a00201604001358c8c8881811061050757610507610f02565b905060a00201606001358d8d8981811061052357610523610f02565b6040517fffffffff0000000000000000000000000000000000000000000000000000000060e08b901b16815273ffffffffffffffffffffffffffffffffffffffff97881660048201529690951660248701525060448501929092526064840152608060a0909202010135608482015260a4016000604051808303818588803b1580156105ae57600080fd5b505af11580156105c2573d6000803e3d6000fd5b50505050505b60010161028b565b506105db3485610f79565b4714610613576040517f8e96d31f00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60405133907f5b4aa4fdb7b6e3ce88c3ccbf2e2c1d9a01b28e4234e107b644111c59de8b7cbe90600090a250505050505050565b61064f61076c565b6106b073ffffffffffffffffffffffffffffffffffffffff82167f00000000000000000000000000000000000000000000000000000000000000007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6108b9565b50565b6106bb61076c565b73ffffffffffffffffffffffffffffffffffffffff8116610763576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602660248201527f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160448201527f646472657373000000000000000000000000000000000000000000000000000060648201526084015b60405180910390fd5b6106b0816107ed565b60005473ffffffffffffffffffffffffffffffffffffffff163314610114576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820181905260248201527f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572604482015260640161075a565b6000805473ffffffffffffffffffffffffffffffffffffffff8381167fffffffffffffffffffffffff0000000000000000000000000000000000000000831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b73ffffffffffffffffffffffffffffffffffffffff821673eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee146108b5576108b573ffffffffffffffffffffffffffffffffffffffff8316333084610abe565b5050565b80158061095957506040517fdd62ed3e00000000000000000000000000000000000000000000000000000000815230600482015273ffffffffffffffffffffffffffffffffffffffff838116602483015284169063dd62ed3e90604401602060405180830381865afa158015610933573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906109579190610f8c565b155b6109e5576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152603660248201527f5361666545524332303a20617070726f76652066726f6d206e6f6e2d7a65726f60448201527f20746f206e6f6e2d7a65726f20616c6c6f77616e636500000000000000000000606482015260840161075a565b60405173ffffffffffffffffffffffffffffffffffffffff8316602482015260448101829052610ab99084907f095ea7b300000000000000000000000000000000000000000000000000000000906064015b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529190526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167fffffffff0000000000000000000000000000000000000000000000000000000090931692909217909152610b22565b505050565b60405173ffffffffffffffffffffffffffffffffffffffff80851660248301528316604482015260648101829052610b1c9085907f23b872dd0000000000000000000000000000000000000000000000000000000090608401610a37565b50505050565b6000610b84826040518060400160405280602081526020017f5361666545524332303a206c6f772d6c6576656c2063616c6c206661696c65648152508573ffffffffffffffffffffffffffffffffffffffff16610c2e9092919063ffffffff16565b805190915015610ab95780806020019051810190610ba29190610fa5565b610ab9576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602a60248201527f5361666545524332303a204552433230206f7065726174696f6e20646964206e60448201527f6f74207375636365656400000000000000000000000000000000000000000000606482015260840161075a565b6060610c3d8484600085610c45565b949350505050565b606082471015610cd7576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602660248201527f416464726573733a20696e73756666696369656e742062616c616e636520666f60448201527f722063616c6c0000000000000000000000000000000000000000000000000000606482015260840161075a565b6000808673ffffffffffffffffffffffffffffffffffffffff168587604051610d009190610feb565b60006040518083038185875af1925050503d8060008114610d3d576040519150601f19603f3d011682016040523d82523d6000602084013e610d42565b606091505b5091509150610d5387838387610d5e565b979650505050505050565b60608315610df4578251600003610ded5773ffffffffffffffffffffffffffffffffffffffff85163b610ded576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e7472616374000000604482015260640161075a565b5081610c3d565b610c3d8383815115610e095781518083602001fd5b806040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161075a9190611007565b600080600060408486031215610e5257600080fd5b83359250602084013567ffffffffffffffff80821115610e7157600080fd5b818601915086601f830112610e8557600080fd5b813581811115610e9457600080fd5b87602060a083028501011115610ea957600080fd5b6020830194508093505050509250925092565b73ffffffffffffffffffffffffffffffffffffffff811681146106b057600080fd5b600060208284031215610ef057600080fd5b8135610efb81610ebc565b9392505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b80820180821115610f7357610f73610f31565b92915050565b81810381811115610f7357610f73610f31565b600060208284031215610f9e57600080fd5b5051919050565b600060208284031215610fb757600080fd5b81518015158114610efb57600080fd5b60005b83811015610fe2578181015183820152602001610fca565b50506000910152565b60008251610ffd818460208701610fc7565b9190910192915050565b6020815260008251806020840152611026816040850160208701610fc7565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016919091016040019291505056fea2646970667358221220b1edd7ff79c71bb95bc51b6f486ab6af1b7836fcf000ceb2ddd67570ba5a802564736f6c63430008100033' }, // prettier-ignore
      deployer
    );
    const batchSendContract = await batchSendFactory.deploy(umbraContract.address);
    await batchSendContract.deployTransaction.wait();
    // Approve DAI token
    await batchSendContract.connect(deployer).approveToken(dai.address);

    // Get chainConfig based on most recent Rinkeby block number to minimize scanning time
    const lastBlockNumber = await ethersProvider.getBlockNumber();
    chainConfig = {
      chainId: (await ethersProvider.getNetwork()).chainId,
      umbraAddress: umbraContract.address,
      batchSendAddress: batchSendContract.address,
      startBlock: lastBlockNumber,
      subgraphUrl: 'https://api.thegraph.com/subgraphs/name/scopelift/umbrapolygon',
    };

    // Get Umbra instance
    umbra = new Umbra(ethersProvider, chainConfig);
  });

  describe('Initialization', () => {
    it('initializes correctly when passing a chain config', async () => {
      // URL provider
      const umbra1 = new Umbra(jsonRpcProvider, chainConfig);
      expect(umbra1.provider._isProvider).to.be.true;
      expect(umbra1.chainConfig.umbraAddress).to.equal(chainConfig.umbraAddress);
      expect(umbra1.chainConfig.batchSendAddress).to.equal(chainConfig.batchSendAddress);
      expect(umbra1.chainConfig.startBlock).to.equal(chainConfig.startBlock);
      expect(umbra1.chainConfig.subgraphUrl).to.equal(chainConfig.subgraphUrl);

      // Web3 provider
      const umbra2 = new Umbra(ethersProvider, chainConfig);
      expect(umbra2.provider._isProvider).to.be.true;
      expect(umbra2.chainConfig.umbraAddress).to.equal(chainConfig.umbraAddress);
      expect(umbra2.chainConfig.batchSendAddress).to.equal(chainConfig.batchSendAddress);
      expect(umbra2.chainConfig.startBlock).to.equal(chainConfig.startBlock);
      expect(umbra2.chainConfig.subgraphUrl).to.equal(chainConfig.subgraphUrl);
    });

    it('initializes correctly when passing a default chainId', async () => {
      // --- Localhost ---
      // URL provider
      const umbra1 = new Umbra(jsonRpcProvider, 1337);
      expect(umbra1.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra1.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra1.chainConfig.startBlock).to.equal(8505089);
      expect(umbra1.chainConfig.subgraphUrl).to.equal(false);

      // Web3 provider
      const umbra2 = new Umbra(ethersProvider, 1337);
      expect(umbra2.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra2.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra2.chainConfig.startBlock).to.equal(8505089);
      expect(umbra2.chainConfig.subgraphUrl).to.equal(false);

      // --- Goerli ---
      const umbra3 = new Umbra(jsonRpcProvider, 5);
      expect(umbra3.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra3.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra3.chainConfig.startBlock).to.equal(7718444);
      expect(umbra3.chainConfig.subgraphUrl).to.equal('https://api.thegraph.com/subgraphs/name/scopelift/umbragoerli');

      // --- Mainnet ---
      const umbra4 = new Umbra(jsonRpcProvider, 1);
      expect(umbra4.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra4.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra4.chainConfig.startBlock).to.equal(12343914);
      expect(umbra4.chainConfig.subgraphUrl).to.equal('https://api.thegraph.com/subgraphs/name/scopelift/umbramainnet');

      // --- Optimism ---
      const umbra5 = new Umbra(jsonRpcProvider, 10);
      expect(umbra5.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra5.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra5.chainConfig.startBlock).to.equal(4069556);
      expect(umbra5.chainConfig.subgraphUrl).to.equal('https://api.thegraph.com/subgraphs/name/scopelift/umbraoptimism'); // prettier-ignore

      // --- Polygon ---
      const umbra6 = new Umbra(jsonRpcProvider, 137);
      expect(umbra6.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra6.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra6.chainConfig.startBlock).to.equal(20717318);
      expect(umbra6.chainConfig.subgraphUrl).to.equal('https://api.thegraph.com/subgraphs/name/scopelift/umbrapolygon');

      // --- Arbitrum ---
      const umbra7 = new Umbra(jsonRpcProvider, 42161);
      expect(umbra7.chainConfig.umbraAddress).to.equal('0xFb2dc580Eed955B528407b4d36FfaFe3da685401');
      expect(umbra7.chainConfig.batchSendAddress).to.equal('0x0d81Df222BB44b883265538586829715CF157163');
      expect(umbra7.chainConfig.startBlock).to.equal(7285883);
      expect(umbra7.chainConfig.subgraphUrl).to.equal('https://api.thegraph.com/subgraphs/name/scopelift/umbraarbitrumone'); // prettier-ignore
    });

    it('does not allow invalid default chain IDs to be provided', async () => {
      const msg = 'Unsupported chain ID provided';
      const constructor1 = () => new Umbra(jsonRpcProvider, 999);
      const constructor2 = () => new Umbra(ethersProvider, 999);
      expect(constructor1).to.throw(msg);
      expect(constructor2).to.throw(msg);
    });
  });

  describe('Private key generation', () => {
    it('properly generates private keys', async () => {
      // We use 100 because that's how many initial accounts are generated in the hardhat config
      for (let i = 0; i < 100; i += 1) {
        // We must use a default hardhat account so hardhat has access to the private key to sign with
        // `provider.send('personal_sign', [params])`, but we instantiate the wallet manually with the
        // private key since the SignerWithAddress type is not a valid input type to generatePrivateKeys

        const walletHardhat = (await ethers.getSigners())[i];
        const wallet = new Wallet(testPrivateKeys[i]);
        if (walletHardhat.address !== wallet.address) throw new Error('Address mismatch');

        const { spendingKeyPair, viewingKeyPair } = await umbra.generatePrivateKeys(wallet);
        expect(spendingKeyPair.privateKeyHex).to.have.length(66);
        expect(viewingKeyPair.privateKeyHex).to.have.length(66);
      }
    });
  });

  const sendTests = [
    { id: 'send', name: 'Send' },
    { id: 'batchSend', name: 'Batch send' },
  ];

  for (const test of sendTests) {
    describe(`${test.name}, scan, and withdraw funds`, () => {
      beforeEach(() => {
        // Seems we somehow lose the provider attached to our sender, so make sure it's there. Without this
        // some tests below throw with "Error: missing provider (operation="sendTransaction", code=UNSUPPORTED_OPERATION, version=abstract-signer/5.0.12)"
        sender = sender.connect(ethers.provider);
      });

      const mintAndApproveDai = async (signer: Wallet, user: string, amount: BigNumber) => {
        await dai.connect(signer).mint(user, amount);
        await dai.connect(signer).approve(umbra.umbraContract.address, ethers.constants.MaxUint256);
        await dai.connect(signer).approve(umbra.batchSendContract.address, ethers.constants.MaxUint256);
      };

      it('reverts if sender does not have enough tokens', async () => {
        const msg = `Insufficient balance to complete transfer. Has 0 tokens, tried to send ${quantity.toString()} tokens.`;

        if (test.id === 'send') {
          await expectRejection(umbra.send(sender, dai.address, quantity, receiver.address), msg);
        } else if (test.id === 'batchSend') {
          await expectRejection(
            umbra.batchSend(
              sender,
              [{ token: dai.address, amount: quantity, address: receiver!.publicKey }],
              overrides
            ),
            msg
          );
        }
      });

      it('reverts if sender does not have enough ETH', async () => {
        // ETH balance is checked by ethers when sending a transaction and therefore does not need to
        // be tested here. If the user has insufficient balance it will throw with
        // `insufficient funds for gas * price + value`
      });

      it('Send tokens, scan for them, withdraw them (direct withdraw)', async () => {
        // SENDER
        // Mint Dai to sender, and approve the Umbra contract to spend their DAI
        await mintAndApproveDai(sender, sender.address, quantity.mul(5));

        // Send funds with Umbra
        let tx: ContractTransaction | null = null;
        let stealthKeyPairs: KeyPair[] = [];
        let usedReceivers: Wallet[] = [];

        if (test.id === 'send') {
          const result = await umbra.send(sender, dai.address, quantity, receiver!.publicKey, overrides);
          tx = result.tx;
          stealthKeyPairs = [result.stealthKeyPair];
          usedReceivers = receivers.slice(0, 1);
        } else if (test.id === 'batchSend') {
          const sends: SendBatch[] = [];
          for (let i = 0; i < 5; i++) {
            sends.push({ token: dai.address, amount: quantity, address: receivers[i].publicKey });
          }
          const result = await umbra.batchSend(sender, sends, overrides);
          tx = result.tx;
          stealthKeyPairs = result.stealthKeyPairs;
          usedReceivers = receivers.slice(0, 5);
        }
        if (tx) await tx.wait();

        for (let i = 0; i < usedReceivers.length; i++) {
          const receiver = usedReceivers[i];
          const stealthKeyPair = stealthKeyPairs[i];
          // RECEIVER
          // Receiver scans for funds sent to them
          const { userAnnouncements } = await umbra.scan(receiver.publicKey, receiver.privateKey);
          expect(userAnnouncements.length).to.be.greaterThan(0);

          // Withdraw (test regular withdrawal, so we need to transfer ETH to pay gas)
          // Destination wallet should have a balance equal to amount sent.
          const destinationWallet = ethers.Wallet.createRandom();
          // Fund stealth address to can pay for gas.
          await sender.sendTransaction({ to: stealthKeyPair.address, value: parseEther('1') });

          // Now we withdraw the tokens
          const stealthPrivateKey = Umbra.computeStealthPrivateKey(
            receiver.privateKey,
            userAnnouncements[0].randomNumber
          );
          verifyEqualValues(await dai.balanceOf(destinationWallet.address), 0);
          const withdrawTxToken = await umbra.withdraw(stealthPrivateKey, dai.address, destinationWallet.address);
          await withdrawTxToken.wait();
          verifyEqualValues(await dai.balanceOf(destinationWallet.address), quantity);
          verifyEqualValues(await dai.balanceOf(stealthKeyPair.address), 0);

          // And for good measure let's withdraw the rest of the ETH
          const initialEthBalance = await getEthBalance(stealthKeyPair.address);
          const withdrawTxEth = await umbra.withdraw(stealthPrivateKey, ETH_ADDRESS, destinationWallet.address);
          await withdrawTxEth.wait();
          const withdrawEthReceipt = await ethersProvider.getTransactionReceipt(withdrawTxEth.hash);
          const withdrawTokenTxCost = withdrawEthReceipt.gasUsed.mul(withdrawEthReceipt.effectiveGasPrice);
          verifyEqualValues(await getEthBalance(stealthKeyPair.address), 0);
          verifyEqualValues(
            await getEthBalance(destinationWallet.address),
            BigNumber.from(initialEthBalance).sub(withdrawTokenTxCost)
          );
        }
      });

      it('Send tokens, scan for them, withdraw them (relayer withdraw)', async () => {
        // SENDER
        // Mint Dai to sender, and approve the Umbra contract to spend their DAI
        await mintAndApproveDai(sender, sender.address, quantity.mul(5));

        let tx: ContractTransaction | null = null;
        let stealthKeyPairs: KeyPair[] = [];
        let usedReceivers: Wallet[] = [];

        if (test.id === 'send') {
          const result = await umbra.send(sender, dai.address, quantity, receiver!.publicKey, overrides);
          tx = result.tx;
          stealthKeyPairs = [result.stealthKeyPair];
          usedReceivers = receivers.slice(0, 1);
        } else if (test.id === 'batchSend') {
          const sends: SendBatch[] = [];
          for (let i = 0; i < 5; i++) {
            sends.push({ token: dai.address, amount: quantity, address: receivers[i].publicKey });
          }
          const result = await umbra.batchSend(sender, sends, overrides);
          tx = result.tx;
          stealthKeyPairs = result.stealthKeyPairs;
          usedReceivers = receivers.slice(0, 5);
        }
        if (tx) await tx.wait();

        for (let i = 0; i < usedReceivers.length; i++) {
          const receiver = usedReceivers[i];
          const stealthKeyPair = stealthKeyPairs[i];
          // RECEIVER
          // Receiver scans for funds sent to them
          const { userAnnouncements } = await umbra.scan(receiver.publicKey, receiver.privateKey);
          expect(userAnnouncements.length).to.be.greaterThan(0);

          // Withdraw (test withdraw by signature)
          const destinationWallet = ethers.Wallet.createRandom();
          const relayerWallet = ethers.Wallet.createRandom();
          const sponsorWallet = ethers.Wallet.createRandom();
          const sponsorFee = '2500';

          // Fund relayer to pay for gas.
          await sender.sendTransaction({ to: relayerWallet.address, value: parseEther('1') });

          // Get signature
          const stealthPrivateKey = Umbra.computeStealthPrivateKey(
            receiver.privateKey,
            userAnnouncements[0].randomNumber
          );
          const { chainId } = await ethersProvider.getNetwork();
          const { v, r, s } = await Umbra.signWithdraw(
            stealthPrivateKey,
            chainId,
            umbra.umbraContract.address,
            destinationWallet.address,
            dai.address,
            sponsorWallet.address,
            sponsorFee
          );

          // Relay transaction
          await umbra.withdrawOnBehalf(
            relayerWallet,
            stealthKeyPair.address,
            destinationWallet.address,
            dai.address,
            sponsorWallet.address,
            sponsorFee,
            v,
            r,
            s
          );
          const expectedAmountReceived = BigNumber.from(quantity).sub(sponsorFee);
          verifyEqualValues(await dai.balanceOf(destinationWallet.address), expectedAmountReceived);
          verifyEqualValues(await dai.balanceOf(stealthKeyPair.address), 0);
          verifyEqualValues(await dai.balanceOf(sponsorWallet.address), sponsorFee);
        }
      });

      it('Send ETH, scan for it, withdraw it (direct withdraw)', async () => {
        // SENDER
        // Send funds with Umbra
        const { tx, stealthKeyPair } = await umbra.send(sender, ETH_ADDRESS, quantity, receiver!.publicKey, overrides);
        await tx.wait();
        verifyEqualValues(await getEthBalance(stealthKeyPair.address), quantity);

        // RECEIVER
        // Receiver scans for funds sent to them
        const { userAnnouncements } = await umbra.scan(receiver.publicKey, receiver.privateKey);
        expect(userAnnouncements.length).to.be.greaterThan(0);

        // Withdraw (test regular withdrawal)
        const destinationWallet = ethers.Wallet.createRandom();

        // Destination wallet should have a balance equal to amount sent minus gas cost
        const stealthPrivateKey = Umbra.computeStealthPrivateKey(
          receiver.privateKey,
          userAnnouncements[0].randomNumber
        );
        const withdrawTx = await umbra.withdraw(stealthPrivateKey, 'ETH', destinationWallet.address);
        await withdrawTx.wait();
        const receipt = await ethers.provider.getTransactionReceipt(withdrawTx.hash);
        const txCost = withdrawTx.gasLimit.mul(receipt.effectiveGasPrice);
        verifyEqualValues(await getEthBalance(destinationWallet.address), quantity.sub(txCost));
        verifyEqualValues(await getEthBalance(stealthKeyPair.address), 0);
      });

      it('Send ETH, scan for it, withdraw it (relayer withdraw)', async () => {
        // SENDER
        // Send funds with Umbra
        const { tx, stealthKeyPair } = await umbra.send(sender, ETH_ADDRESS, quantity, receiver.publicKey, overrides);
        await tx.wait();

        // RECEIVER
        // Receiver scans for funds send to them
        const { userAnnouncements } = await umbra.scan(receiver.publicKey, receiver.privateKey);
        expect(userAnnouncements.length).to.be.greaterThan(0);

        // Withdraw (test regular withdrawal)
        const destinationWallet = ethers.Wallet.createRandom();

        // Destination wallet should have a balance equal to amount sent minus gas cost
        const stealthPrivateKey = Umbra.computeStealthPrivateKey(
          receiver.privateKey,
          userAnnouncements[0].randomNumber
        );
        const withdrawTx = await umbra.withdraw(stealthPrivateKey, 'ETH', destinationWallet.address);
        await withdrawTx.wait();
        const receipt = await ethers.provider.getTransactionReceipt(withdrawTx.hash);
        const txCost = withdrawTx.gasLimit.mul(receipt.effectiveGasPrice);
        verifyEqualValues(await getEthBalance(destinationWallet.address), quantity.sub(txCost));
        verifyEqualValues(await getEthBalance(stealthKeyPair.address), 0);
      });
    });
  }

  describe('Input validation', () => {
    // ts-expect-error statements needed throughout this section to bypass TypeScript checks that would stop this file
    // from being compiled/ran

    it('throws when initializing with an invalid chainConfig', () => {
      const errorMsg1 = "Invalid start block provided in chainConfig. Got 'undefined'";
      const errorMsg2 = "Invalid start block provided in chainConfig. Got '1'";
      const badChainId = '1.1';
      const errorMsg3 = `Invalid chainId provided in chainConfig. Got '${badChainId}'`;
      const errorMsg4 = "Invalid subgraphUrl provided in chainConfig. Got 'undefined'";
      const umbraAddress = '0xFb2dc580Eed955B528407b4d36FfaFe3da685401'; // address does not matter here

      // @ts-expect-error
      expect(() => new Umbra(ethersProvider)).to.throw('chainConfig not provided');
      // @ts-expect-error
      expect(() => new Umbra(ethersProvider, {})).to.throw(errorMsg1);
      // @ts-expect-error
      expect(() => new Umbra(ethersProvider, { umbraAddress })).to.throw(errorMsg1);
      // @ts-expect-error
      expect(() => new Umbra(ethersProvider, { umbraAddress: '123', startBlock: '1', subgraphUrl: false })).to.throw(
        errorMsg2
      );
      expect(
        // @ts-expect-error
        () => new Umbra(ethersProvider, { umbraAddress: '123', startBlock: 1, chainId: badChainId, subgraphUrl: false })
      ).to.throw(errorMsg3);
      // @ts-expect-error
      expect(() => new Umbra(ethersProvider, { umbraAddress: '123', startBlock: 1, chainId: 1 })).to.throw(errorMsg4);
      // @ts-expect-error
      expect(() => new Umbra(ethersProvider, { startBlock: 0, chainId: 4, subgraphUrl: false })).to.throw(
        'invalid address (argument="address", value=undefined, code=INVALID_ARGUMENT, version=address/5.7.0)'
      );
    });

    it('throws when isEth is passed a bad address', async () => {
      // These error messages come from ethers
      await expectRejection(
        umbra.send(sender, '123', '1', ETH_ADDRESS),
        'invalid address (argument="address", value="123", code=INVALID_ARGUMENT, version=address/5.7.0)'
      );
      await expectRejection(
        // @ts-expect-error
        umbra.send(sender, 123, '1', ETH_ADDRESS),
        'invalid address (argument="address", value=123, code=INVALID_ARGUMENT, version=address/5.7.0)'
      );
    });

    it('throws when signWithdraw is passed a bad address', async () => {
      // Actual values of input parameters don't matter for this test
      const privateKey = receiver.privateKey;
      const goodAddress = receiver.address;
      const badAddress = '0x123';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // address does not matter here
      // These error messages come from ethers
      await expectRejection(
        Umbra.signWithdraw(privateKey, 4, umbra.umbraContract.address, badAddress, tokenAddress, goodAddress, '1'),
        'invalid address (argument="address", value="0x123", code=INVALID_ARGUMENT, version=address/5.7.0)'
      );
      await expectRejection(
        Umbra.signWithdraw(privateKey, 4, umbra.umbraContract.address, goodAddress, tokenAddress, badAddress, '1'),
        'invalid address (argument="address", value="0x123", code=INVALID_ARGUMENT, version=address/5.7.0)'
      );
      await expectRejection(
        Umbra.signWithdraw(privateKey, 4, badAddress, goodAddress, tokenAddress, goodAddress, '1'),
        'invalid address (argument="address", value="0x123", code=INVALID_ARGUMENT, version=address/5.7.0)'
      );
    });

    it('throws when signWithdraw is passed a bad chainId', async () => {
      // Actual values of input parameters don't matter for this test
      const privateKey = receiver.privateKey;
      const address = receiver.address;
      const badChainId = '4';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // address does not matter here
      await expectRejection(
        // @ts-expect-error
        Umbra.signWithdraw(privateKey, badChainId, umbra.umbraContract.address, address, tokenAddress, address, '1'),
        `Invalid chainId provided in chainConfig. Got '${badChainId}'`
      );
    });

    it('throws when signWithdraw is passed a bad data string', async () => {
      // Actual values of input parameters don't matter for this test
      const privateKey = receiver.privateKey;
      const address = receiver.address;
      const badData = 'qwerty';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // address does not matter here
      await expectRejection(
        Umbra.signWithdraw(
          privateKey,
          4,
          umbra.umbraContract.address,
          address,
          tokenAddress,
          address,
          '1',
          ethers.constants.AddressZero,
          badData
        ),
        'Data string must be null or in hex format with 0x prefix'
      );
    });
  });

  describe('parseOverrides', () => {
    it('should not mutate the original overrides', async () => {
      // Original
      let testOverrides = {
        advanced: true,
        supportPubKey: true,
        supportTxHash: true,
        type: 1,
        ccipReadEnabled: true,
      };

      const { localOverrides, lookupOverrides } = parseOverrides(testOverrides);

      // Update
      testOverrides = {
        advanced: false,
        supportPubKey: false,
        supportTxHash: false,
        type: 2,
        ccipReadEnabled: false,
      };

      // Check update success
      expect(testOverrides).to.deep.equal({
        advanced: false,
        supportPubKey: false,
        supportTxHash: false,
        type: 2,
        ccipReadEnabled: false,
      });

      // Should not be mutated
      expect(localOverrides).to.deep.equal({
        type: 1,
        ccipReadEnabled: true,
      });

      expect(lookupOverrides).to.deep.equal({
        advanced: true,
        supportPubKey: true,
        supportTxHash: true,
      });
    });
  });
});
