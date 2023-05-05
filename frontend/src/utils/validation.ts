import { computeAddress, isHexString, isAddress } from 'src/utils/ethers';

export const assertValidAddress = (address: string, errorMsg?: string) => {
  if (!address.startsWith('0x') || !isAddress(address)) {
    throw new Error(errorMsg || 'Invalid address');
  }
};

export const assertValidPublicKey = (pubKey: string, errorMsg?: string) => {
  // Only uncompressed public keys are supported.
  if (!pubKey.startsWith('0x04')) {
    throw new Error(errorMsg || 'Invalid public key');
  }

  // This will error if an invalid public key is provided
  try {
    computeAddress(pubKey);
  } catch {
    throw new Error(errorMsg || 'Invalid public key');
  }
};

export const assertValidEncryptionCount = (count: number, errorMsg?: string) => {
  if (count < 0) {
    throw new Error(errorMsg || 'Invalid count provided for encryption');
  }
};

export const assertValidHexString = (hex: string, length: number, errorMsg?: string) => {
  if (!isHexString(hex, length)) {
    throw new Error(errorMsg || 'Invalid hex string was provided');
  }
};
