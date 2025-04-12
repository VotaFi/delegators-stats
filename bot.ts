import {
  AnchorProvider,
  EventParser,
  Program,
  Wallet,
} from "@coral-xyz/anchor";
import { Octokit } from "@octokit/rest";
import {
  booleanFilter,
  getGovernanceAccounts,
  pubkeyFilter,
  TokenOwnerRecord,
} from "@solana/spl-governance";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import _ from "lodash";
import { IDL, VoterStakeRegistry } from "./realms";
import BigNumber from "bignumber.js";

const GOVERNANCE_PROGRAM = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

const VOTA_REALMS_DELEGATE_ADDRESS =
  "AMd2nnFYtPGkeEbUvyVtWRDkG3nrESCvNW4C43mEvWrF";
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

const saveDataToGitHub = async (data: string, timestamp: number) => {
  const octokit = new Octokit({
    auth: process.env.G_TOKEN,
  });

  const owner = "VotaFi";
  const repo = "delegators-stats";
  const path = `stats.json`;
  const content = Buffer.from(data).toString("base64");

  try {
    // Get the SHA of the current file
    const result = await octokit.request(
      `GET /repos/${owner}/${repo}/contents/${path}`,
      {
        owner,
        repo,
        file_path: path,
        branch: "main",
      }
    );

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `Add data for timestamp ${timestamp}`,
      content,
      sha: result.data.sha,
    });
    console.log(`Data saved to GitHub at ${path}`);
  } catch (error) {
    console.error(`Failed to save data to GitHub: ${error}`);
  }
};

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
  realm: (typeof REALMS_DELEGATIONS)[number]
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
    const votingPower = votingPowerInfo
      ? new BigNumber(votingPowerInfo.data.votingPower.toString())
          .div(new BigNumber(10 ** realm.governanceTokenDecimals))
          .toNumber()
      : 0;
    return { votingPower };
  } catch (e: unknown) {
    console.log(e);
    return { votingPower: 0 };
  }
};

const getDelegators = async (
  connection: Connection,
  realm: (typeof REALMS_DELEGATIONS)[number]
) => {
  const realmFilter = pubkeyFilter(1, realm.realmsId);
  const hasDelegateFilter = booleanFilter(
    1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6,
    true
  );
  const delegatedToUserFilter = pubkeyFilter(
    1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 + 1,
    new PublicKey(VOTA_REALMS_DELEGATE_ADDRESS)
  );
  if (!realmFilter || !delegatedToUserFilter) throw new Error(); // unclear why this would ever happen, probably it just cannot

  const results = await getGovernanceAccounts(
    connection,
    GOVERNANCE_PROGRAM,
    TokenOwnerRecord,
    [realmFilter, hasDelegateFilter, delegatedToUserFilter]
  );

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

  return delegateVotingPower;
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

  console.log(JSON.stringify(data, null, 2));
  await saveDataToGitHub(JSON.stringify(data), Date.now());
};

run();
