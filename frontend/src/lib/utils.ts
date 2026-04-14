import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export interface MilestoneFlow {
  id: number;
  client: string;
  worker: string;
  amount: bigint;
  taxBP: number;
  isReleased: boolean;
  yield: bigint;
  taxRecipient: string;
}

// Mock data for initial "Full" UI demo
export const MOCK_FLOWS: MilestoneFlow[] = [
  { id: 1, client: "0x7aB...1192", worker: "0xf39...2266", amount: BigInt(12500e6), taxRecipient: "0xc39...2bf3", yield: BigInt(1244e5), isReleased: false, taxBP: 300 },
  { id: 2, client: "0x92A...1191", worker: "0x709...af8b", amount: BigInt(55000e6), taxRecipient: "0xb30...2266", yield: BigInt(9450e5), isReleased: true, taxBP: 700 },
  { id: 3, client: "0x11B...9901", worker: "0xf39...2266", amount: BigInt(8200e6), taxRecipient: "0xdd9...3309", yield: BigInt(821e5), isReleased: false, taxBP: 1000 },
  { id: 4, client: "0xFE2...0041", worker: "0x3C4...9981", amount: BigInt(4500e6), taxRecipient: "0xff9...2232", yield: BigInt(120e5), isReleased: true, taxBP: 900 },
  { id: 5, client: "0x88C...3371", worker: "0xf39...2266", amount: BigInt(1200e6), taxRecipient: "0x119...2122", yield: BigInt(35e5), isReleased: false, taxBP: 600 },
  { id: 6, client: "0xBB9...a411", worker: "0x709...af8b", amount: BigInt(250e6), taxRecipient: "0xd39...9097", yield: BigInt(12e5), isReleased: true, taxBP: 450 },
];