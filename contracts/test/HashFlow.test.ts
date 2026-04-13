import { expect } from 'chai';
import { ethers } from 'hardhat';
import { parseUnits, ZeroAddress } from 'ethers';
import type {
  HashFlowEscrow,
  MockUSDC_EIP3009,
  MockVault,
  MockHSP,
  MockZKVerifier,
} from '../typechain-types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ONE_THOUSAND = parseUnits('1000', 6);
const ONE_HUNDRED  = parseUnits('100',  6);
const FIVE         = parseUnits('5',    6);
const TAX_10PCT    = 1_000; // basis points
const TAX_5PCT     =   500;

describe('HashFlowEscrow', function () {
  // ─────────────────────────────────────────────────────────────────────────
  // Actors
  // ─────────────────────────────────────────────────────────────────────────
  let owner:         any;
  let client:        any;
  let worker:        any;
  let regionalVault: any;
  let serviceVault:  any;
  let attacker:      any;

  // ─────────────────────────────────────────────────────────────────────────
  // Contracts
  // ─────────────────────────────────────────────────────────────────────────
  let token:  MockUSDC_EIP3009;
  let vault:  MockVault;
  let escrow: HashFlowEscrow;
  let hsp:    MockHSP;
  let zk:     MockZKVerifier;

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────
  async function createEscrow(
    amount: bigint,
    taxBP: number,
    recipient?: string,
  ): Promise<bigint> {
    const taxRecipient = recipient ?? regionalVault.address;
    await token.connect(client).approve(await escrow.getAddress(), amount);
    const tx = await escrow
      .connect(client)
      .createEscrow(worker.address, taxRecipient, amount, taxBP);
    const receipt = await tx.wait();
    // Parse milestoneId from EscrowCreated event
    const event = receipt?.logs
      .map((l: any) => { try { return escrow.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'EscrowCreated');
    return event?.args?.milestoneId ?? 0n;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Setup
  // ─────────────────────────────────────────────────────────────────────────
  beforeEach(async function () {
    [owner, client, worker, regionalVault, serviceVault, attacker] =
      await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockUSDC_EIP3009');
    token = (await Token.deploy()) as MockUSDC_EIP3009;

    const Vault = await ethers.getContractFactory('MockVault');
    vault = (await Vault.deploy(
      await token.getAddress(),
      owner.address,
    )) as MockVault;

    const Escrow = await ethers.getContractFactory('HashFlowEscrow');
    escrow = (await Escrow.deploy(
      await token.getAddress(),
      await vault.getAddress(),
      ZeroAddress,   // HSP set via setHSPAddress
      owner.address,
    )) as HashFlowEscrow;

    const HSP = await ethers.getContractFactory('MockHSP');
    hsp = (await HSP.deploy(
      await token.getAddress(),
      await escrow.getAddress(),
    )) as MockHSP;

    const ZK = await ethers.getContractFactory('MockZKVerifier');
    zk = (await ZK.deploy()) as MockZKVerifier;

    // Owner setup
    await escrow.connect(owner).setHSPAddress(await hsp.getAddress());
    await escrow.connect(owner).setZKVerifier(await zk.getAddress());
    await escrow.connect(owner).setAutoServiceFeeVault(serviceVault.address);

    // ZK gate: pre-verify worker
    await zk.setVerificationStatus(worker.address, true);

    // Seed balances
    await token.mint(client.address,  parseUnits('10000', 6));
    await token.mint(owner.address,   parseUnits('1000',  6));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: Basic Escrow & Release
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase 1: Basic Escrow & Release', function () {
    it('releases principal minus tax to worker and tax to vault', async function () {
      const id = await createEscrow(ONE_THOUSAND, TAX_10PCT);
      await escrow.connect(client).releaseMilestone(id);

      expect(await token.balanceOf(worker.address)).to.equal(parseUnits('900', 6));
      expect(await token.balanceOf(regionalVault.address)).to.equal(parseUnits('100', 6));
    });

    it('records milestone state correctly after creation', async function () {
      const id = await createEscrow(ONE_THOUSAND, TAX_10PCT);
      const m = await escrow.milestones(id);

      expect(m.amount).to.equal(ONE_THOUSAND);
      expect(m.client).to.equal(client.address);
      expect(m.worker).to.equal(worker.address);
      expect(m.taxRateBP).to.equal(TAX_10PCT);
      expect(m.isReleased).to.be.false;
      expect(m.shares).to.be.gt(0n);
      expect(m.taxRecipient).to.equal(regionalVault.address);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Yield Split With Tax
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase 2: Yield Split', function () {
    it('distributes yield 50/50 after tax deduction', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);

      // Inject simulated yield
      await token.connect(owner).approve(await vault.getAddress(), FIVE);
      await vault.connect(owner).simulateYield(FIVE);

      await escrow.connect(client).releaseMilestone(id);

      expect(await token.balanceOf(regionalVault.address)).to.equal(parseUnits('5', 6));
      // worker gets 95 principal + ~2.5 yield (half of 5e6)
      expect(await token.balanceOf(worker.address)).to.be.closeTo(
        parseUnits('97.5', 6),
        parseUnits('0.01', 6),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: HSP Trigger
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase 3: HSP Trigger', function () {
    it('creates and releases escrow via HSP', async function () {
      await token.connect(client).approve(await hsp.getAddress(), ONE_HUNDRED);
      const tx = await hsp
        .connect(client)
        .triggerPayment(client.address, worker.address, regionalVault.address, ONE_HUNDRED, 0);
      const receipt = await tx.wait();
      const event = receipt?.logs
        .map((l: any) => { try { return hsp.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === 'HSPPaymentTriggered');
      const id = event?.args?.milestoneId ?? 0n;

      await escrow.connect(client).releaseMilestone(id);
      expect(await token.balanceOf(worker.address)).to.equal(ONE_HUNDRED);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: ZK Gate
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase 4: ZK Identity Gate', function () {
    it('reverts when worker is not ZK-verified', async function () {
      const unverified = attacker; // never verified
      await token.connect(client).approve(await escrow.getAddress(), ONE_HUNDRED);
      await expect(
        escrow.connect(client).createEscrow(
          unverified.address,
          regionalVault.address,
          ONE_HUNDRED,
          0,
        ),
      ).to.be.revertedWithCustomError(escrow, 'NotVerified');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Multi-tenancy
  // ─────────────────────────────────────────────────────────────────────────
  describe('Phase 7: Multi-tenancy', function () {
    it('tracks milestones per client independently', async function () {
      const [, , , , , , clientB] = await ethers.getSigners();
      await token.mint(clientB.address, ONE_THOUSAND);

      await createEscrow(ONE_HUNDRED, 0); // Client A

      await token.connect(clientB).approve(await escrow.getAddress(), parseUnits('200', 6));
      await escrow.connect(clientB).createEscrow(worker.address, regionalVault.address, parseUnits('100', 6), 0);
      await escrow.connect(clientB).createEscrow(worker.address, regionalVault.address, parseUnits('100', 6), 0);

      expect((await escrow.getMyMilestones(client.address)).length).to.equal(1);
      expect((await escrow.getMyMilestones(clientB.address)).length).to.equal(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tax Vault & Rate — Milestone-Specific
  // ─────────────────────────────────────────────────────────────────────────
  describe('Tax vault & rate (milestone-specific)', function () {
    it('reverts setTaxVaults from non-client', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      await expect(
        escrow.connect(attacker).setTaxVaults(attacker.address, id),
      ).to.be.revertedWithCustomError(escrow, 'NotClient');
    });

    it('updates tax vault and routes on release', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      const newVault = attacker; // reuse any signer as new vault address

      await escrow.connect(client).setTaxVaults(newVault.address, id);
      const m = await escrow.milestones(id);
      expect(m.taxRecipient).to.equal(newVault.address);

      await escrow.connect(client).releaseMilestone(id);
      expect(await token.balanceOf(newVault.address)).to.equal(parseUnits('5', 6));
    });

    it('reverts setTaxRateBP from non-client', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      await expect(
        escrow.connect(attacker).setTaxtRateBP(TAX_10PCT, id),
      ).to.be.revertedWithCustomError(escrow, 'NotClient');
    });

    it('updates tax rate and applies on release', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      await escrow.connect(client).setTaxtRateBP(TAX_10PCT, id);
      const m = await escrow.milestones(id);
      expect(m.taxRateBP).to.equal(TAX_10PCT);

      await escrow.connect(client).releaseMilestone(id);
      expect(await token.balanceOf(regionalVault.address)).to.equal(parseUnits('10', 6));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Tax Recipient (multi-jurisdiction)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Custom tax recipient (multi-jurisdiction)', function () {
    it('routes tax to per-milestone vault', async function () {
      const [, , , , , , , hkTax, sgTax, clientB] = await ethers.getSigners();
      token.mint(clientB.address, ONE_THOUSAND);

      const idA = await createEscrow(ONE_THOUSAND, TAX_10PCT, hkTax.address);

      await token.connect(clientB).approve(await escrow.getAddress(), ONE_THOUSAND);
      const txB = await escrow
        .connect(clientB)
        .createEscrow(worker.address, sgTax.address, ONE_THOUSAND, TAX_10PCT);
      const receiptB = await txB.wait();
      const ev = receiptB?.logs
        .map((l: any) => { try { return escrow.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === 'EscrowCreated');
      const idB = ev?.args?.milestoneId ?? 1n;

      await escrow.connect(client).releaseMilestone(idA);
      expect(await token.balanceOf(hkTax.address)).to.equal(parseUnits('100', 6));

      await escrow.connect(clientB).releaseMilestone(idB);
      expect(await token.balanceOf(sgTax.address)).to.equal(parseUnits('100', 6));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Owner Admin
  // ─────────────────────────────────────────────────────────────────────────
  describe('Owner administration', function () {
    it('setYieldFee updates the fee', async function () {
      await escrow.connect(owner).setYieldFee(3000);
      expect(await escrow.yieldFeeBP()).to.equal(3000);
    });

    it('setYieldFee reverts for non-owner', async function () {
      await expect(escrow.connect(client).setYieldFee(3000)).to.be.reverted;
    });

    it('setYieldFee reverts when fee > 100%', async function () {
      await expect(
        escrow.connect(owner).setYieldFee(10001),
      ).to.be.revertedWithCustomError(escrow, 'TaxRateTooHigh');
    });

    it('setHSPAddress updates the value', async function () {
      await escrow.connect(owner).setHSPAddress(attacker.address);
      expect(await escrow.hspAddress()).to.equal(attacker.address);
    });

    it('setHSPAddress reverts for non-owner', async function () {
      await expect(escrow.connect(client).setHSPAddress(attacker.address)).to.be.reverted;
    });

    it('setZKVerifier updates the value', async function () {
      await escrow.connect(owner).setZKVerifier(attacker.address);
      expect(await escrow.zkVerifier()).to.equal(attacker.address);
    });

    it('setZKVerifier reverts for non-owner', async function () {
      await expect(escrow.connect(client).setZKVerifier(attacker.address)).to.be.reverted;
    });

    it('setAutoServiceFeeVault updates the value', async function () {
      await escrow.connect(owner).setAutoServiceFeeVault(attacker.address);
      expect(await escrow.autoServiceFeeVault()).to.equal(attacker.address);
    });

    it('setAutoServiceFeeVault reverts on zero address', async function () {
      await expect(
        escrow.connect(owner).setAutoServiceFeeVault(ZeroAddress),
      ).to.be.revertedWithCustomError(escrow, 'ZeroAddress');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // View helpers
  // ─────────────────────────────────────────────────────────────────────────
  describe('View helpers', function () {
    it('getPendingYield returns positive after yield injection', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      await token.connect(owner).approve(await vault.getAddress(), FIVE);
      await vault.connect(owner).simulateYield(FIVE);
      expect(await escrow.getPendingYield(id)).to.be.gt(0n);
    });

    it('getPendingYield reverts for invalid milestone', async function () {
      await expect(escrow.getPendingYield(999n)).to.be.revertedWithCustomError(
        escrow,
        'InvalidMilestoneId',
      );
    });

    it('milestoneValue returns positive after creation', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      expect(await escrow.milestoneValue(id)).to.be.gt(0n);
    });

    it('milestoneValue reverts for invalid milestone', async function () {
      await expect(escrow.milestoneValue(999n)).to.be.revertedWithCustomError(
        escrow,
        'InvalidMilestoneId',
      );
    });

    it('getTotalTaxLiability sums unreleased milestones', async function () {
      await createEscrow(ONE_HUNDRED, TAX_5PCT);
      expect(await escrow.getTotalTaxLiability(client.address)).to.equal(
        parseUnits('5', 6),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Input validation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Input validation', function () {
    it('reverts createEscrow with zero worker', async function () {
      await token.connect(client).approve(await escrow.getAddress(), ONE_HUNDRED);
      await expect(
        escrow.connect(client).createEscrow(ZeroAddress, regionalVault.address, ONE_HUNDRED, TAX_5PCT),
      ).to.be.revertedWithCustomError(escrow, 'ZeroAddress');
    });

    it('reverts createEscrow with zero tax recipient', async function () {
      await token.connect(client).approve(await escrow.getAddress(), ONE_HUNDRED);
      await expect(
        escrow.connect(client).createEscrow(worker.address, ZeroAddress, ONE_HUNDRED, TAX_5PCT),
      ).to.be.revertedWithCustomError(escrow, 'ZeroAddress');
    });

    it('reverts createEscrow with zero amount', async function () {
      await token.connect(client).approve(await escrow.getAddress(), ONE_HUNDRED);
      await expect(
        escrow.connect(client).createEscrow(worker.address, regionalVault.address, 0n, TAX_5PCT),
      ).to.be.revertedWithCustomError(escrow, 'ZeroAmount');
    });

    it('reverts createEscrow with 100% tax rate', async function () {
      await token.connect(client).approve(await escrow.getAddress(), ONE_HUNDRED);
      await expect(
        escrow.connect(client).createEscrow(worker.address, regionalVault.address, ONE_HUNDRED, 10000),
      ).to.be.revertedWithCustomError(escrow, 'TaxRateTooHigh');
    });

    it('reverts releaseMilestone for non-client', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      await expect(
        escrow.connect(attacker).releaseMilestone(id),
      ).to.be.revertedWithCustomError(escrow, 'NotClient');
    });

    it('reverts releaseMilestone if already released', async function () {
      const id = await createEscrow(ONE_HUNDRED, TAX_5PCT);
      await escrow.connect(client).releaseMilestone(id);
      await expect(
        escrow.connect(client).releaseMilestone(id),
      ).to.be.revertedWithCustomError(escrow, 'AlreadyReleased');
    });

    it('reverts releaseMilestone for invalid milestone id', async function () {
      await expect(
        escrow.connect(client).releaseMilestone(999n),
      ).to.be.revertedWithCustomError(escrow, 'InvalidMilestoneId');
    });

    it('reverts receiveHSPPayment when caller is not HSP', async function () {
      await expect(
        escrow
          .connect(client)
          .receiveHSPPayment(client.address, worker.address, regionalVault.address, ONE_HUNDRED, 0),
      ).to.be.revertedWithCustomError(escrow, 'NotHSP');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Yield distribution
  // ─────────────────────────────────────────────────────────────────────────
  describe('Yield distribution', function () {
    it('gives worker principal + half yield, platform half yield', async function () {
      const id = await createEscrow(ONE_HUNDRED, 0);

      const yieldAmt = parseUnits('10', 6);
      await token.connect(owner).approve(await vault.getAddress(), yieldAmt);
      await vault.connect(owner).simulateYield(yieldAmt);

      const workerBefore = await token.balanceOf(worker.address);
      await escrow.connect(client).releaseMilestone(id);
      const workerReceived = (await token.balanceOf(worker.address)) - workerBefore;

      // Worker: 100 principal + 5 (half of 10 yield) = ~105
      expect(workerReceived).to.be.closeTo(parseUnits('105', 6), parseUnits('1', 6));
      // Platform: 5 (half yield)
      expect(await token.balanceOf(serviceVault.address)).to.be.closeTo(
        parseUnits('5', 6),
        1n,
      );
    });
  });
});
