import {
  AnchorProvider,
  EventParser,
  Program,
  Wallet,
} from "@coral-xyz/anchor";
import {
  booleanFilter,
  deserializeBorsh,
  getAccountTypes,
  getGovernanceSchemaForAccount,
  MemcmpFilter,
  pubkeyFilter,
  TokenOwnerRecord,
} from "@solana/spl-governance";
import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import _ from "lodash";
import { IDL, VoterStakeRegistry } from "./IDL/realms";
import BigNumber from "bignumber.js";
import { saveDataToGitHub } from "./helpers/github";
import { getVoters } from "./helpers/tribeca/getVoters";
import { createSolanaClient } from "gill";

const GOVERNANCE_PROGRAM = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

const VOTA_REALMS_DELEGATE_ADDRESS_OLD =
  "AMd2nnFYtPGkeEbUvyVtWRDkG3nrESCvNW4C43mEvWrF";
const VOTA_REALMS_DELEGATE_ADDRESS =
  "AiaNSk4H2QWetmCqtoo9qtQp9f9NnxyCB4NiTpB4pWb2";
const REALMS_VSR_PROGRAM_ID = new PublicKey(
  "vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ"
);

export const REALMS_DELEGATIONS = [
  {
    slug: "solblaze",
    name: "SolBlaze",
    governanceProgram: new PublicKey(
      "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
    ),
    governanceToken: new PublicKey(
      "BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA"
    ),
    governanceTokenName: "BLZE",
    governanceTokenDecimals: 9,
    realmsId: new PublicKey("7vrFDrK9GRNX7YZXbo7N3kvta7Pbn6W1hCXQ6C7WBxG9"),
  },
];

const SIMULATION_WALLET = "ENmcpFCpxN1CqyUjuog9yyUVfdXBKF3LVCwLr7grJZpk";

const getDepositsAdditionalInfoEvents = async (
  program: Program<VoterStakeRegistry>,
  usedDeposits: unknown[],
  connection: Connection,
  registrar: PublicKey,
  voter: PublicKey
) => {
  //because we switch wallet in here we can't use rpc from npm module
  //anchor dont allow to switch wallets inside existing client
  //parse events response as anchor do
  const latestBlockhash = await connection.getLatestBlockhash();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = [];
  const parser = new EventParser(program.programId, program.coder);
  const maxRange = 8;
  const maxIndex = usedDeposits.length;
  const numberOfSimulations = Math.ceil(maxIndex / maxRange);
  for (let i = 0; i < numberOfSimulations; i++) {
    const take = maxRange;
    const logVoterInfoIx = await program.methods
      .logVoterInfo(maxRange * i, take)
      .accounts({ registrar, voter })
      .instruction();
    // TODO cache using fetchVotingPowerSimulation

    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(SIMULATION_WALLET),
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        logVoterInfoIx,
      ],
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    const batchOfDeposits = await connection.simulateTransaction(transaction);
    const logEvents = parser.parseLogs(batchOfDeposits.value.logs!);
    events.push(...[...logEvents]);
  }
  return events;
};

const getVoterPDA = (
  registrar: PublicKey,
  walletPk: PublicKey,
  clientProgramId: PublicKey
) => {
  const [voter, voterBump] = PublicKey.findProgramAddressSync(
    [registrar.toBuffer(), Buffer.from("voter"), walletPk.toBuffer()],
    clientProgramId
  );

  return {
    voter,
    voterBump,
  };
};

const getRegistrarPDA = (
  realmPk: PublicKey,
  mint: PublicKey,
  clientProgramId: PublicKey
) => {
  const [registrar, registrarBump] = PublicKey.findProgramAddressSync(
    [realmPk.toBuffer(), Buffer.from("registrar"), mint.toBuffer()],
    clientProgramId
  );
  return {
    registrar,
    registrarBump,
  };
};

const realmsGetVotingPower = async (
  connection: Connection,
  walletPK: PublicKey,
  realm: (typeof REALMS_DELEGATIONS)[number],
  retryNum = 0
) => {
  try {
    const provider = new AnchorProvider(
      connection,
      new Wallet(Keypair.generate()),
      {}
    );
    const program = new Program(IDL, REALMS_VSR_PROGRAM_ID, provider);

    const { registrar } = getRegistrarPDA(
      realm.realmsId,
      realm.governanceToken,
      program.programId
    );
    const { voter: voterPK } = getVoterPDA(
      registrar,
      walletPK,
      program.programId
    );
    const voter = (await program.account.voter.fetch(voterPK)).deposits.filter(
      (v) => v.isUsed
    );
    const events = await getDepositsAdditionalInfoEvents(
      program,
      voter,
      connection,
      registrar,
      voterPK
    );
    const votingPowerInfo = events.find((event) => event.name === "VoterInfo");

    if (!votingPowerInfo) {
      throw new Error("No voting power info");
    }

    const votingPower = new BigNumber(
      votingPowerInfo.data.votingPower.toString()
    )
      .div(new BigNumber(10 ** realm.governanceTokenDecimals))
      .toNumber();
    return { votingPower };
  } catch (e: unknown) {
    console.log(e);
    if (retryNum < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return realmsGetVotingPower(connection, walletPK, realm, retryNum + 1);
    }
    return { votingPower: 0 };
  }
};

// Paginated getProgramAccounts ("gpav2"): phase 1 fetches only the matching
// pubkeys with an empty dataSlice (small response, avoids the RPC "Response
// too large" failure that a single full getProgramAccounts call would hit),
// then phase 2 fetches the full account data via getMultipleAccounts in
// batches of 100 (the per-request cap) and deserializes them.
const getDelegatedTokenOwnerRecords = async (
  connection: Connection,
  realm: (typeof REALMS_DELEGATIONS)[number],
  delegateAddresses: PublicKey[]
) => {
  const realmFilter = pubkeyFilter(1, realm.realmsId);
  const hasDelegateFilter = booleanFilter(
    1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6,
    true
  );
  const delegateFilters = delegateAddresses
    .map((address) =>
      pubkeyFilter(1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1, address)
    )
    .filter((filter): filter is MemcmpFilter => filter !== undefined);
  if (!realmFilter || delegateFilters.length !== delegateAddresses.length)
    throw new Error(); // unclear why this would ever happen, probably it just cannot

  const all: { pubkey: PublicKey; account: TokenOwnerRecord }[] = [];

  for (const accountType of getAccountTypes(TokenOwnerRecord)) {
    for (const delegateFilter of delegateFilters) {
      // Phase 1: fetch only the matching pubkeys (no account data) per page.
      const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM, {
        commitment: connection.commitment,
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode([accountType]) } },
          {
            memcmp: {
              offset: realmFilter.offset,
              bytes: bs58.encode(realmFilter.bytes),
            },
          },
          {
            memcmp: {
              offset: hasDelegateFilter.offset,
              bytes: bs58.encode(hasDelegateFilter.bytes),
            },
          },
          {
            memcmp: {
              offset: delegateFilter.offset,
              bytes: bs58.encode(delegateFilter.bytes),
            },
          },
        ],
        dataSlice: { offset: 0, length: 0 },
      });
      const pubkeys = accounts.map((account) => account.pubkey);

      // Phase 2: fetch the full data in paginated batches and deserialize.
      const schema = getGovernanceSchemaForAccount(accountType);
      for (const chunk of _.chunk(pubkeys, 100)) {
        const infos = await connection.getMultipleAccountsInfo(
          chunk,
          connection.commitment
        );
        chunk.forEach((pubkey, i) => {
          const info = infos[i];
          if (!info) return;
          try {
            all.push({
              pubkey,
              account: deserializeBorsh(schema, TokenOwnerRecord, info.data),
            });
          } catch {
            // skip records we can't deserialize (mirrors spl-governance)
          }
        });
      }
    }
  }

  return all;
};

const getDelegators = async (
  connection: Connection,
  realm: (typeof REALMS_DELEGATIONS)[number]
) => {
  const results = await getDelegatedTokenOwnerRecords(connection, realm, [
    new PublicKey(VOTA_REALMS_DELEGATE_ADDRESS),
    new PublicKey(VOTA_REALMS_DELEGATE_ADDRESS_OLD),
  ]);

  const delegateVotingPower = await Promise.all(
    results.map(async (result) => {
      const votingPower = await realmsGetVotingPower(
        connection,
        result.account.governingTokenOwner,
        realm
      );
      return { ...result, votingPower };
    })
  );

  // Add in voting power of the addresses themselves
  const delegateVotingPowerWithSelf = await Promise.all(
    [VOTA_REALMS_DELEGATE_ADDRESS, VOTA_REALMS_DELEGATE_ADDRESS_OLD].map(
      async (address) => ({
        pubkey: new PublicKey(address),
        votingPower: await realmsGetVotingPower(
          connection,
          new PublicKey(address),
          realm
        ),
      })
    )
  );

  return [...delegateVotingPower, ...delegateVotingPowerWithSelf];
};

const run = async () => {
  const connection = new Connection(process.env.RPC_URL!);
  const data = (
    await Promise.all(
      REALMS_DELEGATIONS.map(async (realm) => {
        const delegatorsRaw = await getDelegators(connection, realm);
        const delegators = delegatorsRaw.map((delegate) => ({
          pubkey: delegate.pubkey.toBase58(),
          votingPower: delegate.votingPower.votingPower,
        }));

        return {
          realm: realm.slug,
          delegators,
          totalVotingPower: delegatorsRaw.reduce(
            (acc, delegate) => acc + delegate.votingPower.votingPower,
            0
          ),
        };
      })
    )
  ).reduce((acc, val) => {
    acc[val.realm] = val;
    return acc;
  }, {} as Record<string, { realm: string; delegators: { pubkey: string; votingPower: number }[]; totalVotingPower: number }>);

  // console.log(JSON.stringify(data, null, 2));
  await saveDataToGitHub(
    "stats.json",
    JSON.stringify(data, null, 2),
    Date.now()
  );

  // Cache solblaze data
  const solblazeData = await fetch(
    "https://rewards.solblaze.org/api/v1/gauges"
  );
  const solblazeDataJson = await solblazeData.json();
  if (solblazeDataJson.validators.length > 0) {
    await saveDataToGitHub(
      "solblaze.json",
      JSON.stringify(solblazeDataJson),
      Date.now()
    );
  }

  // Tribeca data
  const client = createSolanaClient({ urlOrMoniker: process.env.RPC_URL! });
  const voters = await getVoters(client, "theVault");
  const vaultVoters = voters.map((voter) => ({
    pubkey: voter.escrowAddress.toString(),
    votingPower: Number(voter.voterPower) / 1e6,
    tokens: Number(voter.escrow.amount) / 1e6,
  }));
  const vaultData = {
    tribeca: "theVault",
    delegators: vaultVoters,
    totalVotingPower: vaultVoters.reduce((acc, voter) => acc + voter.votingPower, 0),
    totalTokens: vaultVoters.reduce((acc, voter) => acc + voter.tokens, 0),
  }

  await saveDataToGitHub(
    "tribecaStats.json",
    JSON.stringify({ vault: vaultData }, null, 2),
    Date.now()
  );
};

run();
