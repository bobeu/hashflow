import { config as dotconfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "@nomiclabs/hardhat-web3";
import "@nomicfoundation/hardhat-viem";
import { zeroAddress } from "viem";

dotconfig();

const config: HardhatUserConfig = {
  paths: {
    deploy: 'deploy',
    deployments: 'deployments',
    imports: 'imports'
  },
  networks: {
    testnet: {
      url: "https://testnet.hsk.xyz",
      accounts: [`${process.env.P_KEY_0xD7c}`],
      chainId: 133,
    },
    mainnet: {
      url: "https://mainnet.hsk.xyz",
      accounts: [`${process.env.P_KEY_0xD7c}`],
      chainId: 177,
    }
  },

  namedAccounts: {
    deployer: {
      default: 0,
      133: `privatekey://${process.env.P_KEY_0xD7c}`,
      177: `privatekey://${process.env.P_KEY_0xD7c}`
    },
    OFFICIAL_USDC_ADDRESS: {
      default: 1,
      133: "0x79AEc4EeA31D50792F61D1Ca0733C18c89524C9e", // // Official HashKey Testnet USDC (EIP-3009 compatible)
      177: zeroAddress
    },
    demoWorker: {
      default: 1,
      133: `privatekey://${process.env.DEMO_WORKER}`,
      177: `privatekey://${process.env.DEMO_WORKER}`
    },
    demoMerchant: {
      default: 1,
      133: `privatekey://${process.env.DEMO_MERCHANT}`,
      177: `privatekey://${process.env.DEMO_MERCHANT}`
    },
    serviceVault: {
      default: 1,
      133: `privatekey://${process.env.SERVICE_VAULT}`,
      177: `privatekey://${process.env.SERVICE_VAULT}`
    },
  },
  solidity: {
    version: "0.8.24",
    settings: {          // See the solidity docs for advice about optimization and evmVersion
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "Cancun-compatible"
      // evmVersion: "paris"
    }
  },
};

export default config;
