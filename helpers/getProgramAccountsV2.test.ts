import assert from "node:assert/strict";
import test from "node:test";
import { Connection, PublicKey } from "@solana/web3.js";
import { getProgramAccountsV2 } from "./getProgramAccountsV2";

test("fetches every getProgramAccountsV2 page", async () => {
  const requests: Record<string, unknown>[] = [];
  const pages = [
    {
      result: {
        accounts: [
          {
            pubkey: "11111111111111111111111111111111",
            account: { data: [Buffer.from("first").toString("base64"), "base64"] },
          },
        ],
        paginationKey: "next-page",
      },
    },
    {
      result: {
        accounts: [
          {
            pubkey: "SysvarRent111111111111111111111111111111111",
            account: { data: [Buffer.from("second").toString("base64"), "base64"] },
          },
        ],
        paginationKey: "check-for-more",
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

  const accounts = await getProgramAccountsV2(
    new Connection("https://rpc.example.com", "confirmed"),
    new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"),
    [{ dataSize: 123 }],
    fetchFn
  );

  assert.deepEqual(
    accounts.map(({ data }) => data.toString()),
    ["first", "second"]
  );
  assert.equal(requests.length, 3);
  assert.equal(requests[0].method, "getProgramAccountsV2");
  assert.equal(
    (requests[0].params as [string, Record<string, unknown>])[1].paginationKey,
    undefined
  );
  assert.equal(
    (requests[1].params as [string, Record<string, unknown>])[1].paginationKey,
    "next-page"
  );
  assert.equal(
    (requests[2].params as [string, Record<string, unknown>])[1].paginationKey,
    "check-for-more"
  );
});
