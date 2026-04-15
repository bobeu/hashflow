import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { config as dotconfig } from 'dotenv';
import { parseUnits } from 'ethers';
import { zeroAddress } from 'viem';

dotconfig();

const HASHKEY_TESTNET_CHAIN_ID = '133';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy, execute, read } = deployments;

  // Pull named accounts defined in hardhat.config.ts
  const { deployer, demoWorker, demoMerchant, serviceVault, OFFICIAL_USDC_ADDRESS } = await getNamedAccounts();

  const useOfficialUSDC = true;
  const chainId = await getChainId();
  const isHashKeyTestnet = chainId === HASHKEY_TESTNET_CHAIN_ID;

  console.log('======================================');
  console.log('  HashFlow - PRODUCTION GENESIS DEPLOY');
  console.log('======================================');
  console.log('Chain ID        :', chainId);
  console.log('Deployer        :', deployer);
  console.log('Demo Worker     :', demoWorker);
  console.log('Demo Merchant   :', demoMerchant);
  console.log('Service Vault   :', serviceVault);
  console.log('--------------------------------------');

  // ===========================================================================
  // PHASE 1: DEPLOYMENT
  // ===========================================================================
  console.log('\n--- Phase 1: Deployment ---');

  let settlementToken: string;

  if (useOfficialUSDC) {
    // Use official HashKey Testnet USDC — no deployment needed
    settlementToken = OFFICIAL_USDC_ADDRESS;
    console.log('Settlement Token (official USDC) :', settlementToken);
  } else {
    // Local hardhat / fork — deploy MockUSDC_EIP3009 for deterministic testing
    const mockUsdc = await deploy('MockUSDC_EIP3009', {
      from: deployer,
      args: [],
      log: true,
    });
    settlementToken = mockUsdc.address;
    console.log('MockUSDC_EIP3009 (local) deployed :', settlementToken);
  }

  // ERC-4626 yield vault (MockVault — constructor: asset, owner)
  const mockVault = await deploy('MockVault', {
    from: deployer,
    args: [settlementToken, deployer, deployer],
    log: true,
  });
  console.log('MockVault deployed :', mockVault.address);

  // Deployer approves MockVault to pull yield (for the pull-based yield engine)
  try {
    if (!isHashKeyTestnet) {
      await execute(settlementToken, { from: deployer }, 'approve', mockVault.address, parseUnits('10000000', 6));
      console.log('Deployer approved MockVault for yield pull :', mockVault.address);
    }
  } catch (err: any) {
    console.error('Deployer approve MockVault failed:', err?.message?.slice(0, 100));
  }

  // Core escrow — HSP address starts as zero; wired in Phase 2
  const escrow = await deploy('HashFlowEscrow', {
    from: deployer,
    args: [
      settlementToken,
      mockVault.address,
      zeroAddress, // HSP set in Phase 2
      deployer,                                      // owner (platform)
    ],
    log: true,
  });
  console.log('HashFlowEscrow deployed           :', escrow.address);

  // MockHSP — institutional entry point (constructor: token, escrow)
  const mockHsp = await deploy('MockHSP', {
    from: deployer,
    args: [settlementToken, escrow.address],
    log: true,
  });
  console.log('MockHSP deployed                  :', mockHsp.address);

  // MockZKVerifier — compliance gate
  const mockZkVerifier = await deploy('MockZKVerifier', {
    from: deployer,
    args: [],
    log: true,
  });
  console.log('MockZKVerifier deployed           :', mockZkVerifier.address);

  // ===========================================================================
  // PHASE 2: PROTOCOL HARDENING (owner calls)
  // ===========================================================================
  console.log('\n--- Phase 2: Protocol Hardening ---');

  // try {
  //   await execute('HashFlowEscrow', { from: deployer }, 'setZKVerifier', mockZkVerifier.address);
  //   console.log('ZK Verifier linked                :', mockZkVerifier.address);
  // } catch (err: any) {
  //   console.error('setZKVerifier failed:', err?.message?.slice(0, 100));
  // }
  try {
    await execute('MockVault', { from: deployer }, 'transferOwnership', escrow.address);
    console.log('Ownership transfered to :', escrow.address);
  } catch (err: any) {
    console.error('Ownership transfered :', err?.message?.slice(0, 100));
  }

  // if (serviceVault && serviceVault !== '0x0000000000000000000000000000000000000000') {
  //   try {
  //     await execute('HashFlowEscrow', { from: deployer }, 'setAutoServiceFeeVault', serviceVault);
  //     console.log('Service Fee Vault set             :', serviceVault);
  //   } catch (err: any) {
  //     console.error('setAutoServiceFeeVault failed:', err?.message?.slice(0, 100));
  //   }
  // }

  // try {
  //   await execute('HashFlowEscrow', { from: deployer }, 'setHSPAddress', mockHsp.address);
  //   console.log('HSP Address registered            :', mockHsp.address);
  // } catch (err: any) {
  //   console.error('setHSPAddress failed:', err?.message?.slice(0, 100));
  // }

  // Approve vault to pull yield from escrow (owner) for yield distribution
  // This gives the vault permission to pull yield from the escrow when beneficiaries redeem
  try {
    // Approve maximum possible for yield pull (10M USDC should be enough for demo)
    await execute('HashFlowEscrow', { from: deployer }, 'approveVault', parseUnits('10', 6));
    console.log('Vault approved for yield pull :', mockVault.address);
  } catch (err: any) {
    console.error('approveVault failed:', err?.message?.slice(0, 100));
  }

  try {
    const [timeElapsed, expectedGrowth, allowance, tSupply] = await read('MockVault', 'getYieldInfo') as [bigint, bigint, bigint, bigint];
    console.log('timeElapsed:', timeElapsed.toString(), 'expectedGrowth:', expectedGrowth.toString(), 'allowance:', allowance.toString(), "tSupply:", tSupply.toString());
  } catch (err: any) {
    console.error('approveVault failed:', err?.message?.slice(0, 100));
  }

  // ===========================================================================
  // PHASE 3: DEMO STATE INJECTION
  // ===========================================================================
  console.log('\n--- Phase 3: Demo State Injection ---');

  // Pre-verify demo worker so the first release does not fail the ZK gate
  // if (demoWorker) {
  //   try {
  //     await execute('MockZKVerifier', { from: deployer }, 'setVerificationStatus', demoWorker, true);
  //     console.log('ZK verified (worker)              :', demoWorker);
  //   } catch (err: any) {
  //     console.error('setVerificationStatus (worker) failed:', err?.message?.slice(0, 100));
  //   }
  // }

  // Also verify the merchant wallet if it is different
  // if (demoMerchant && demoMerchant !== demoWorker) {
  //   try {
  //     await execute('MockZKVerifier', { from: deployer }, 'setVerificationStatus', demoMerchant, true);
  //     console.log('ZK verified (merchant):', demoMerchant);
  //   } catch (err: any) {
  //     console.error('setVerificationStatus (merchant) failed:', err?.message?.slice(0, 100));
  //   }
  // }

  // Fund the demo wallet with MockUSDC only when we own the token (local / fork)
  // if (isHashKeyTestnet && demoMerchant) {
  //   try {
  //     await execute(
  //       'MockUSDC_EIP3009',
  //       { from: deployer },
  //       'mint',
  //       demoMerchant,
  //       parseUnits('2000', 6) // 2000 USDC (6 decimals)
  //     );
  //     console.log('Minted 2000 MockUSDC to:', demoMerchant);

  //     await execute(
  //       'MockUSDC_EIP3009',
  //       { from: deployer },
  //       'mint',
  //       deployer,
  //       parseUnits('2000', 6) // 2000 USDC (6 decimals)
  //     );
  //     console.log('Minted 2000 MockUSDC to:', deployer);

  //     const balDeployer = (await read('MockUSDC_EIP3009', 'balanceOf', deployer)) as bigint;
  //     const balDemoMerchant = (await read('MockUSDC_EIP3009', 'balanceOf', demoMerchant)) as bigint;
  //     console.log("balDeployer", balDeployer.toString());
  //     console.log("balDemoMerchant", balDemoMerchant.toString());

  //   } catch (err: any) {
  //     console.error('mint (merchant) failed:', err?.message?.slice(0, 100));
  //   }

  //   if (demoWorker && demoWorker !== demoMerchant) {
  //     try {
  //       await execute(
  //         'MockUSDC_EIP3009',
  //         { from: deployer },
  //         'mint',
  //         demoWorker,
  //         parseUnits('500', 6)
  //       );
  //       console.log('Minted 500 MockUSDC to            :', demoWorker);
  //     } catch (err: any) {
  //       console.error('mint (worker) failed:', err?.message?.slice(0, 100));
  //     }
  //   }
  // } 

  // ===========================================================================
  // PHASE 4: ARTIFACT OUTPUT
  // ===========================================================================
  console.log('\n--- Phase 4: Summary ---');
  console.log('HashFlowEscrow  :', escrow.address);
  console.log('MockVault       :', mockVault.address);
  console.log('MockHSP         :', mockHsp.address);
  console.log('MockZKVerifier  :', mockZkVerifier.address);
  console.log('Settlement Token:', settlementToken);
  console.log('\nRun: cd ../frontend && bun sync:data');
  console.log('\n======================================');
  console.log('  GENESIS DEPLOYMENT COMPLETE');
  console.log('======================================');
};

export default func;

func.tags = ['HashFlow', 'HashFlowEscrow', 'MockVault', 'MockHSP', 'MockZKVerifier'];
