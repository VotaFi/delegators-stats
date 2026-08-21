import assert from "node:assert/strict";
import test from "node:test";
import { address, SolanaClient } from "gill";
import {
  getEscrowEncoder,
  getLockerEncoder,
} from "../clients/locked-voter/src";
import { getVoters } from "./tribeca/getVoters";

test("fetches every Tribeca voter page with getProgramAccountsV2", async () => {
  const lockerAddress = address("FqEk173TNsqe2maPozsaZk4AvaqpV3FKynyA5s7V4aNq");
  const owner = address("SysvarRent111111111111111111111111111111111");
  const tokenAddress = address("11111111111111111111111111111111");
  const escrowAddress = "SysvarC1ock11111111111111111111111111111111";
  const lockerData = getLockerEncoder().encode({
    base: tokenAddress,
    bump: 1,
    tokenMint: tokenAddress,
    lockedSupply: 1_000,
    governor: tokenAddress,
    params: {
      whitelistEnabled: false,
      maxStakeVoteMultiplier: 10,
      minStakeDuration: 1,
      maxStakeDuration: 1_000,
      proposalActivationMinVotes: 1,
    },
  });
  const escrowData = getEscrowEncoder().encode({
    locker: lockerAddress,
    owner,
    bump: 1,
    tokens: tokenAddress,
    amount: 1_000,
    escrowStartedAt: 1,
    escrowEndsAt: 9_999_999_999,
    voteDelegate: tokenAddress,
  });
  const client = {
    rpc: {
      getAccountInfo: () => ({
        send: async () => ({
          value: {
            data: [Buffer.from(lockerData).toString("base64"), "base64"],
          },
        }),
      }),
    },
  } as unknown as SolanaClient;
  const requests: Record<string, unknown>[] = [];
  const pages = [
    {
      result: {
        accounts: [
          {
            pubkey: escrowAddress,
            account: {
              data: [Buffer.from(escrowData).toString("base64"), "base64"],
            },
          },
        ],
        paginationKey: "next-page",
      },
    },
    {
      result: {
        accounts: [],
        paginationKey: null,
      },
    },
  ];
  const fetchFn = async (
    _input: string | URL | Request,
    init?: RequestInit
  ) => {
    requests.push(JSON.parse(init?.body as string));
    return new Response(JSON.stringify(pages[requests.length - 1]));
  };

  const voters = await getVoters(
    client,
    "https://rpc.example.com",
    "theVault",
    fetchFn
  );

  assert.equal(voters.length, 1);
  assert.equal(voters[0].escrowAddress, escrowAddress);
  assert.equal(voters[0].owner, owner);
  assert.equal(voters[0].voterPower, BigInt(10_000));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "getProgramAccountsV2");
  assert.equal(
    (requests[0].params as [string, Record<string, unknown>])[1].paginationKey,
    undefined
  );
  assert.equal(
    (requests[1].params as [string, Record<string, unknown>])[1].paginationKey,
    "next-page"
  );
  assert.deepEqual(
    (requests[0].params as [string, { filters: unknown[] }])[1].filters,
    [
      { dataSize: 161 },
      {
        memcmp: {
          offset: 129,
          bytes: "7amwa9XAJwBRqz2Nd3D1Dj5EA8V4DYGRkUM6CGZXTpKg",
          encoding: "base58",
        },
      },
    ]
  );
});
