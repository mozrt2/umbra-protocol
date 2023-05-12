/**
 * @jest-environment jsdom
 */
import { randomBytes } from 'crypto';
import { generateTestingUtils } from 'eth-testing';
import { ethers } from 'ethers';
import { RandomNumber } from '@umbracash/umbra-js';

import {
  buildAccountDataForEncryption,
  decryptData,
  encryptAccountData,
  fetchAccountSends,
  storeSend,
} from '../src/utils/account-send';
import { BigNumber, getAddress } from '../src/utils/ethers';
import localforage from 'localforage';
import { LOCALFORAGE_ACCOUNT_SEND_KEY_PREFIX } from 'src/utils/constants';
jest.mock('src/utils/address', () => ({
  ...jest.requireActual('src/utils/address'),
  lookupOrReturnAddresses: jest.fn((args) => args),
}));
jest.mock('src/utils/constants', () => ({
  ...jest.requireActual('src/utils/constants'),
  MAINNET_PROVIDER: jest.fn(),
}));

const NUM_RUNS = 100;

const invalidAddresses = [
  '',
  '0x',
  'adfaklsfjl', // Random string.
  '0x869b1913aeD711246A4cD22B4cFE9DD13996B13', // Missing last character.
  '0x869b1913aeD711246A4cD22B4cFE9DD13996B13dd', // Has extra character.
  '0x869b1913aed711246a4cd22b4cfe9dd13996b13dd', // All lowercase.
  '0x869b1913aeD711246A4cD22B4cFE9DD13996B13D', // Wrong checksum.
  '869b1913aeD711246A4cD22B4cFE9DD13996B13d', // No 0x prefix.
];

const invalidPubKeys = [
  '',
  '0x',
  'adfaklsfjl', // Random string.
  '0x0290d47bf25f057e085aaff2881f2a59799d6b2553dda3aac0cd340ffdf0c71a75', // Wrong prefix, this is a compressed pubkey.
  '0x031cfa0212cf73dde948b32da3715d4a17cd9188263729ccddccffc30581b1efce', // Wrong prefix, this is a compressed pubkey.
  '0x041cfa0212cf73dde948b32da3715d4a17cd9188263729ccddccffc30581b1efce', // Right prefix, but not a valid public key format.
  '0x0290d47bf25f057e085aaff2881f2a59799d6b2553dda3aac0cd340ffdf0c71a7565eb3b9ba06f42e7450625ea0ec4f7cb65b1c5f0854c5e7bbed9c3bd3c8c5660', // Would be valid if prefix was 0x04.
  '0x0390d47bf25f057e085aaff2881f2a59799d6b2553dda3aac0cd340ffdf0c71a7565eb3b9ba06f42e7450625ea0ec4f7cb65b1c5f0854c5e7bbed9c3bd3c8c5660', // Would be valid if prefix was 0x04.
  '0x9990d47bf25f057e085aaff2881f2a59799d6b2553dda3aac0cd340ffdf0c71a7565eb3b9ba06f42e7450625ea0ec4f7cb65b1c5f0854c5e7bbed9c3bd3c8c5660', // Would be valid if prefix was 0x04.
];

const invalidPrivateKeys = [
  '',
  '0x',
  'adfaklsfjl', // Random string.
  '0xea40eda38ee75464fd68074e35c1e52c03ac041e2ffba23efaa93d425487f88', // Too short.
  '0xea40eda38ee75464fd68074e35c1e52c03ac041e2ffba23efaa93d425487f8877', // Too long.
  'ea40eda38ee75464fd68074e35c1e52c03ac041e2ffba23efaa93d425487f88a', // Missing 0x prefix.
  '0x03ea40eda38ee75464fd68074e35c1e52c03ac041e2ffba23efaa93d425487f887', // Has a pubkey prefix.
  '0x04randomcharacters',
  '0xa4ba0c601af9054f6872baef005e890ecadc8c807b2635be04ad24875fb04faz', // Right length, not hex though.
];

const invalidEncryptionCounts = [
  '-1',
  '-2',
  '-99999',
  `${Number.MIN_SAFE_INTEGER}`,
  `${Number.MIN_SAFE_INTEGER - 1000}`,
];

// This is faster than relying on ethers to generate all the random data.
function randomHexString(numBytes: number): string {
  return `0x${randomBytes(numBytes).toString('hex')}`;
}

// Used to generate random data in tests.
function randomData() {
  return {
    recipientAddress: getAddress(randomHexString(20)),
    pubKey: ethers.Wallet.createRandom().publicKey, // Need this one to be real so validation passes.
    advancedMode: Math.random() > 0.5,
    usePublicKeyChecked: Math.random() > 0.5,
    viewingPrivateKey: randomHexString(32),
    // Make sure 0 is more likely to show up for encryption count.
    encryptionCount: Math.random() < 0.1 ? '0' : new RandomNumber().value.toString(),
    // Ciphertext has the same length as a private key.
    ciphertext: randomHexString(32),
  };
}

describe('buildAccountDataForEncryption', () => {
  invalidAddresses.forEach((recipientAddress) => {
    it('Throws when given an invalid recipient address', () => {
      const { pubKey, advancedMode, usePublicKeyChecked } = randomData();
      const x = () => buildAccountDataForEncryption({ recipientAddress, pubKey, advancedMode, usePublicKeyChecked });
      expect(x).toThrow('Invalid recipient address');
    });
  });

  invalidPubKeys.forEach((pubKey) => {
    it('Throws when given an invalid public key', () => {
      const { recipientAddress, advancedMode, usePublicKeyChecked } = randomData();
      const x = () => buildAccountDataForEncryption({ recipientAddress, pubKey, advancedMode, usePublicKeyChecked });
      expect(x).toThrow('Invalid public key');
    });
  });

  it('Correctly formats the data to be encrypted', () => {
    // Generate random data and do multiple runs.
    for (let i = 0; i < NUM_RUNS; i++) {
      const { recipientAddress, pubKey, advancedMode, usePublicKeyChecked } = randomData();
      const actualData = buildAccountDataForEncryption({ recipientAddress, pubKey, advancedMode, usePublicKeyChecked });

      const advancedModeString = advancedMode ? '1' : '0';
      const usePublicKeyCheckedString = usePublicKeyChecked ? '1' : '0';
      const expectedData = BigNumber.from(
        `${recipientAddress.toLowerCase()}${advancedModeString}${usePublicKeyCheckedString}${pubKey.slice(4, 4 + 22)}`
      );
      expect(actualData.toHexString()).toEqual(expectedData.toHexString());
    }
  });
});

const partialPubKey = '0x9976698beebe8ee5c74d8cc5';
const pubKey =
  '0x0476698beebe8ee5c74d8cc50ab84ac301ee8f10af6f28d0ffd6adf4d6d3b9b762d46ca56d3dad2ce13213a6f42278dabbb53259f2d92681ea6a0b98197a719be3';
const recipientAddress = '0x2436012a54c81f2F03e6E3D83090f3F5967bF1B5';
const viewingPrivateKey = '0x290a15e2b46811c84a0c26624fd7fdc12e38143ae75518fc48375d41035ec5c1'; // this viewing key is taken from the testkeys in the umbra-js tests
const localStorageCountKey = `${LOCALFORAGE_ACCOUNT_SEND_KEY_PREFIX}-count-${recipientAddress}-5`;
const localStorageValueKey = `${LOCALFORAGE_ACCOUNT_SEND_KEY_PREFIX}-${recipientAddress}-5`;
const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const txHash = '0x79d28911717689ca3c2c76407d8d965b82e856a9ab8f1ca5c2420c9addd97279';

describe('encryptAccountData', () => {
  invalidAddresses.forEach((recipientAddress) => {
    it('Throws when given an invalid recipient address', () => {
      const { pubKey, advancedMode, usePublicKeyChecked, viewingPrivateKey, encryptionCount } = randomData();
      const x = () =>
        encryptAccountData(
          { recipientAddress, advancedMode, usePublicKeyChecked, pubKey },
          { encryptionCount, viewingPrivateKey }
        );
      expect(x).toThrow('Invalid recipient address');
    });
  });

  invalidEncryptionCounts.forEach((encryptionCount) => {
    it('Throws when given an invalid encryption count', () => {
      // Generate random data for everything except the encryption count.
      const recipientAddress = ethers.Wallet.createRandom().address;
      const pubKey = ethers.Wallet.createRandom().publicKey;
      const advancedMode = Math.random() > 0.5;
      const usePublicKeyChecked = Math.random() > 0.5;
      const viewingPrivateKey = ethers.Wallet.createRandom().privateKey;
      const x = () =>
        encryptAccountData(
          { recipientAddress, advancedMode, usePublicKeyChecked, pubKey },
          { encryptionCount, viewingPrivateKey }
        );
      expect(x).toThrow('Invalid count provided for encryption');
    });
  });

  invalidPrivateKeys.forEach((viewingPrivateKey) => {
    const { recipientAddress, pubKey, advancedMode, usePublicKeyChecked, encryptionCount } = randomData();
    it('Throws when given an invalid viewing key', () => {
      const x = () =>
        encryptAccountData(
          { recipientAddress, advancedMode, pubKey, usePublicKeyChecked },
          { encryptionCount, viewingPrivateKey }
        );
      expect(x).toThrow('Invalid viewing key');
    });
  });
});

describe('decryptData', () => {
  invalidEncryptionCounts.forEach((encryptionCount) => {
    it('Decryption invalid count', () => {
      const { viewingPrivateKey, ciphertext } = randomData();
      const x = () => decryptData(ciphertext, { encryptionCount, viewingPrivateKey });
      expect(x).toThrow('Invalid count for decryption');
    });
  });

  invalidPrivateKeys.forEach((viewingPrivateKey) => {
    it('Decryption invalid viewing key', () => {
      const { ciphertext, encryptionCount } = randomData();
      const x = () => decryptData(ciphertext, { encryptionCount, viewingPrivateKey });
      expect(x).toThrow('Invalid viewing key');
    });
  });

  [
    '',
    '0x',
    'adfaklsfjl',
    '0xed72d644be0208e4d1c6312a04d2d623b99b2487f58d80f6169f9522d984cdb', // Too short.
    '0xed72d644be0208e4d1c6312a04d2d623b99b2487f58d80f6169f9522d984cdbbb', // Too long.
    'ffed72d644be0208e4d1c6312a04d2d623b99b2487f58d80f6169f9522d984cdbb', // Right length, wrong format.
    '0xed72d644be0208e4d1c6312a04d2d623b99b2487f58d80f6169f9522d984cdbz', // Right length, but not hex
  ].forEach((ciphertext) => {
    it('Decryption invalid ciphertext', () => {
      const { viewingPrivateKey, encryptionCount } = randomData();
      const x = () => decryptData(ciphertext, { encryptionCount, viewingPrivateKey });
      expect(x).toThrow('Invalid ciphertext');
    });
  });

  // This data was generated from this test when it was working and it's contents are verified in the below decrypt tests.
  [
    {
      advancedMode: true,
      usePublicKeyChecked: true,
      encryptionCount: '0',
      expectedCiphertext: '0x9f3873e440b439d4e7561e70b5db28af7abb67257f6353e8d6e057bd2ed16621',
    },
    {
      advancedMode: false,
      usePublicKeyChecked: false,
      encryptionCount: '1',
      expectedCiphertext: '0xac7a4c827e636bb25fbf1ae604c48f0c035c34f526456dc6264b5ee43e3119f2',
    },
    {
      advancedMode: true,
      usePublicKeyChecked: false,
      encryptionCount: '2',
      expectedCiphertext: '0xb609426a8909759990b22756b7f2ce4f8d5ac4685d6e2c40daa830d059950504',
    },
    {
      advancedMode: false,
      usePublicKeyChecked: true,
      encryptionCount: '3',
      expectedCiphertext: '0xd45ffb2b6d4b4ad3bc0682b111cdbceecac938df0c72a0b0a79f7b6be6cfeb3e',
    },
    {
      advancedMode: false,
      usePublicKeyChecked: true,
      encryptionCount: ethers.constants.MaxUint256.toString(),
      expectedCiphertext: '0x89d8a5695a2d6f5b85b1969c4b1cda3c22c36896d907bb0d35975733f7cab1c1',
    },
  ].forEach(({ advancedMode, usePublicKeyChecked, encryptionCount, expectedCiphertext }) => {
    it('Correctly encrypts data', () => {
      const data = encryptAccountData(
        { recipientAddress, advancedMode, usePublicKeyChecked, pubKey: pubKey },
        { encryptionCount, viewingPrivateKey: viewingPrivateKey }
      );
      expect(data.length).toBe(66); // 32 bytes + 0x
      expect(data).toBe(expectedCiphertext);
    });
  });

  [
    {
      ciphertext: '0x9f3873e440b439d4e7561e70b5db28af7abb67257f6353e8d6e057bd2ed16621',
      encryptionCount: '0',
      expectedDecryptedData: {
        advancedMode: true,
        usePublicKeyChecked: true,
        address: recipientAddress,
        pubKey: partialPubKey,
      },
    },
    {
      ciphertext: '0xac7a4c827e636bb25fbf1ae604c48f0c035c34f526456dc6264b5ee43e3119f2',
      encryptionCount: '1',
      expectedDecryptedData: {
        advancedMode: false,
        usePublicKeyChecked: false,
        address: recipientAddress,
        pubKey: partialPubKey,
      },
    },
    {
      ciphertext: '0xb609426a8909759990b22756b7f2ce4f8d5ac4685d6e2c40daa830d059950504',
      encryptionCount: '2',
      expectedDecryptedData: {
        advancedMode: true,
        usePublicKeyChecked: false,
        address: recipientAddress,
        pubKey: partialPubKey,
      },
    },
    {
      ciphertext: '0xd45ffb2b6d4b4ad3bc0682b111cdbceecac938df0c72a0b0a79f7b6be6cfeb3e',
      encryptionCount: '3',
      expectedDecryptedData: {
        advancedMode: false,
        usePublicKeyChecked: true,
        address: recipientAddress,
        pubKey: partialPubKey,
      },
    },
    {
      ciphertext: '0x89d8a5695a2d6f5b85b1969c4b1cda3c22c36896d907bb0d35975733f7cab1c1',
      encryptionCount: ethers.constants.MaxUint256.toString(),
      expectedDecryptedData: {
        advancedMode: false,
        usePublicKeyChecked: true,
        address: recipientAddress,
        pubKey: partialPubKey,
      },
    },
  ].forEach(({ ciphertext, encryptionCount, expectedDecryptedData }) => {
    it('Data decrypted correctly all true', () => {
      const data = decryptData(ciphertext, { encryptionCount, viewingPrivateKey: viewingPrivateKey });
      expect(data).toEqual(expectedDecryptedData); // Recursively checks all properties.
    });
  });
});

describe('encrypt/decrypt relationship', () => {
  it('Encrypt and decrypt are inverses', () => {
    // Generate random data and do multiple runs.
    for (let i = 0; i < 100; i++) {
      const { recipientAddress, pubKey, viewingPrivateKey, advancedMode, usePublicKeyChecked, encryptionCount } =
        randomData();
      const ciphertext = encryptAccountData(
        { recipientAddress, advancedMode, pubKey, usePublicKeyChecked },
        { encryptionCount, viewingPrivateKey }
      );
      const decryptedData = decryptData(ciphertext, { encryptionCount, viewingPrivateKey });
      expect(decryptedData).toEqual({
        advancedMode,
        usePublicKeyChecked,
        address: recipientAddress,
        pubKey: `0x99${pubKey.slice(4, 4 + 22)}`,
      });
    }
  });

  it('Encrypts and decrypts properly for values with leading zeros', () => {
    // `BigNumber.from(myHexString).toHexString()` where `myHexString` has leading zero bytes will
    // truncate those leading zeroes from the string. If data is not manually zero-padded to the
    // correct length, this can cause a bug where the leading zero bytes of the address are
    // truncated and trailing bytes of other data are appended. The above fuzz test found this bug,
    // and this is a concrete test with known inputs would fail if the bug were present.
    const recipientAddress = '0x00bB833415cf56f112389E146Cb7847dDbE93fB5';
    const pubKey =
      '0x040426c84897f9e07632687f69ef714090307dcdc23b4a9f3719e6db8eb1f753f71dd4f849c6101d13049f6091944914c31e6fe32db34daa176da230a04de12bf3';
    const viewingPrivateKey = '0xeaa492b979aead8bdaf857673c4fe453a3f7ce5e8d661499391505f47d96d613';
    const advancedMode = false;
    const usePublicKeyChecked = false;
    const encryptionCount = '661';

    const ciphertext = encryptAccountData(
      { recipientAddress, advancedMode, pubKey, usePublicKeyChecked },
      { encryptionCount, viewingPrivateKey }
    );
    const decryptedData = decryptData(ciphertext, { encryptionCount, viewingPrivateKey });
    expect(decryptedData).toEqual({
      advancedMode,
      usePublicKeyChecked,
      address: recipientAddress,
      pubKey: `0x99${pubKey.slice(4, 4 + 22)}`,
    });
  });
});

describe('storeSend', () => {
  const testingUtils = generateTestingUtils({ providerType: 'default' });
  const storeSendArgs = {
    chainId: 5,
    provider: new ethers.providers.Web3Provider(testingUtils.getProvider()),
    viewingPrivateKey,
    unencryptedAccountSendData: {
      amount: '100',
      tokenAddress,
      txHash,
      senderAddress: recipientAddress,
    },
    accountDataToEncrypt: {
      recipientAddress: '0xEAC5F0d4A9a45E1f9FdD0e7e2882e9f60E301156',
      advancedMode: false,
      usePublicKeyChecked: false,
      pubKey,
    },
  };
  beforeEach(async () => {
    testingUtils.clearAllMocks();
    await localforage.clear();
  });

  it('Generates and saves an encryption count when there are no existing values and count', async () => {
    const existingCount = await localforage.getItem(localStorageCountKey);
    const value = await localforage.getItem(localStorageValueKey);
    expect(existingCount).toEqual(undefined);
    expect(value).toEqual(undefined);

    await storeSend(storeSendArgs);

    const newCount = await localforage.getItem(localStorageCountKey);
    const values = (await localforage.getItem(localStorageValueKey)) as any[];
    expect(newCount).toBeTruthy();
    expect(values.length).toEqual(1);
  });

  it('Generates and saves an encryption count when there is an existing count but no existing values', async () => {
    await localforage.setItem(localStorageCountKey, 1);
    const value = await localforage.getItem(localStorageValueKey);
    expect(value).toEqual(undefined);

    await storeSend(storeSendArgs);

    const newCount = await localforage.getItem(localStorageCountKey);
    const values = (await localforage.getItem(localStorageValueKey)) as any[];
    expect(newCount).not.toEqual(1);
    expect(newCount).toBeTruthy();
    expect(values.length).toEqual(1);
  });

  it('Generates and saves an encryption count when there is an existing value but no existing count', async () => {
    // These values are not representative
    // of actual values but this test should work regardless
    // of the values.
    await localforage.setItem(localStorageValueKey, [
      {
        accountSendCiphertext: '',
        amount: '100',
        tokenAddress,
        dateSent: new Date(),
        txHash,
      },
    ]);
    const count = await localforage.getItem(localStorageCountKey);
    expect(count).toEqual(undefined);

    await storeSend(storeSendArgs);
    const newCount = await localforage.getItem(localStorageCountKey);
    const values = (await localforage.getItem(localStorageValueKey)) as any[];

    expect(newCount).toBeTruthy();
    expect(values.length).toEqual(1);
  });

  it('Preserves existing value and count when storing a new entry', async () => {
    // These values are not representative
    // of actual values but this test should work regardless
    // of the values.
    await localforage.setItem(localStorageValueKey, [
      {
        accountSendCiphertext: '',
        amount: '100',
        tokenAddress,
        dateSent: new Date(),
        txHash,
      },
    ]);
    await localforage.setItem(localStorageCountKey, 10012);

    await storeSend(storeSendArgs);

    const count = await localforage.getItem(localStorageCountKey);
    const values = (await localforage.getItem(localStorageValueKey)) as any[];
    expect(count).toEqual(10012);
    expect(values.length).toEqual(2);
  });
});

describe('fetchAccountSends', () => {
  const testingUtils = generateTestingUtils({ providerType: 'default' });

  beforeEach(async () => {
    await localforage.clear();
    testingUtils.clearAllMocks();
    window.logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      version: '',
      _log: jest.fn(),
      makeError: jest.fn(),
      assert: jest.fn(),
      assertArgument: jest.fn(),
      checkNormalize: jest.fn(),
      checkArgumentCount: jest.fn(),
      checkNew: jest.fn(),
      checkAbstract: jest.fn(),
      checkSafeUint53: jest.fn(),
      throwError: jest.fn() as never,
      throwArgumentError: jest.fn() as never,
    };
  });

  it('Correctly fetch send data when there is a single send', async () => {
    await localforage.setItem(localStorageValueKey, [
      {
        accountSendCiphertext: '0xb609426a8909759990b22756b7f2ce4f8d5ac4685d6e2c40daa830d059950504',
        amount: '100',
        tokenAddress,
        dateSent: new Date(),
        txHash,
      },
    ]);
    await localforage.setItem(localStorageCountKey, 2);

    const accountSends = await fetchAccountSends({
      address: recipientAddress,
      viewingPrivateKey,
      chainId: 5,
    });

    expect(accountSends.length).toEqual(1);
    expect(accountSends[0].recipientAddress).toEqual(recipientAddress);
    expect(accountSends[0].advancedMode).toEqual(true);
    expect(accountSends[0].usePublicKeyChecked).toEqual(false);
  });

  it('Correctly fetch send data when there are multiple send', async () => {
    await localforage.setItem(localStorageValueKey, [
      {
        accountSendCiphertext: '0xb609426a8909759990b22756b7f2ce4f8d5ac4685d6e2c40daa830d059950504',
        amount: '100',
        tokenAddress,
        dateSent: new Date(),
        txHash,
      },
      {
        accountSendCiphertext: '0xd45ffb2b6d4b4ad3bc0682b111cdbceecac938df0c72a0b0a79f7b6be6cfeb3e',
        amount: '100',
        tokenAddress,
        dateSent: new Date(),
        txHash,
      },
    ]);
    await localforage.setItem(localStorageCountKey, 2);

    const accountSends = await fetchAccountSends({
      address: recipientAddress,
      viewingPrivateKey,
      chainId: 5,
    });

    const decryptedArray = accountSends.map((send) => ({
      recipientAddress: send.recipientAddress,
      advancedMode: send.advancedMode,
      usePublicKeyChecked: send.usePublicKeyChecked,
    }));

    // This array's order matches the
    // expected results from the input array.
    // We need to reverse this array because
    // fetchAccountSends will do the same
    // to show the most recent send first.
    const expectedArray = [
      {
        recipientAddress,
        advancedMode: true,
        usePublicKeyChecked: false,
      },
      {
        recipientAddress,
        advancedMode: false,
        usePublicKeyChecked: true,
      },
    ].reverse();
    expect(decryptedArray).toEqual(expectedArray);
  });
});
