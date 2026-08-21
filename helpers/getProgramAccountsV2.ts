export type ProgramAccountsV2Filter =
  | { dataSize: number }
  | {
      memcmp: {
        offset: number;
        bytes: string;
        encoding?: "base58" | "base64";
      };
    };

type RpcConnection = {
  rpcEndpoint: string;
  commitment?: string;
};

type ProgramAccountsV2Response = {
  result?: {
    accounts: {
      pubkey: string;
      account: { data: [string, string] };
    }[];
    paginationKey: string | null;
  };
  error?: {
    code: number;
    message: string;
  };
};

export type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export const getProgramAccountsV2 = async (
  connection: RpcConnection,
  programId: string,
  filters: ProgramAccountsV2Filter[],
  fetchFn: FetchFn = fetch
) => {
  const accounts: { pubkey: string; data: Buffer }[] = [];
  let paginationKey: string | null = null;

  do {
    const response = await fetchFn(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-program-accounts-v2",
        method: "getProgramAccountsV2",
        params: [
          programId,
          {
            ...(connection.commitment
              ? { commitment: connection.commitment }
              : {}),
            encoding: "base64",
            filters,
            limit: 1000,
            ...(paginationKey ? { paginationKey } : {}),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `getProgramAccountsV2 failed with HTTP ${response.status}`
      );
    }

    const body = (await response.json()) as ProgramAccountsV2Response;
    if (body.error) {
      throw new Error(
        `getProgramAccountsV2 failed (${body.error.code}): ${body.error.message}`
      );
    }
    if (!body.result) {
      throw new Error("getProgramAccountsV2 returned no result");
    }

    accounts.push(
      ...body.result.accounts.map(({ pubkey, account }) => ({
        pubkey,
        data: Buffer.from(account.data[0], "base64"),
      }))
    );
    paginationKey = body.result.paginationKey;
  } while (paginationKey);

  return accounts;
};
