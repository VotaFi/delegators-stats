import { SupportedMarket, LOCKER } from './constants';
import {
    SolanaClient,
    Address,
    GetProgramAccountsApi,
    getBase64Encoder, Base58EncodedBytes,
} from 'gill';
import {
    LOCKED_VOTER_PROGRAM_ADDRESS,
    Escrow,
    Locker,
    getLockerDecoder,
    getEscrowDecoder, getEscrowSize
} from '../../clients/locked-voter/src';
import { getDelegate } from './pdas';
import { calculateVoterPower } from './voterPower';

type GetProgramAccountsConfig = Parameters<GetProgramAccountsApi['getProgramAccounts']>[1];
type EscrowInfo = {
    escrowAddress: Address;
    owner: Address;
    escrow: Escrow;
    voterPower: bigint;
};

export const getVoters = async (
    client: SolanaClient,
    market: SupportedMarket,
): Promise<EscrowInfo[]> => {
    // Get encoders and decoders
    const base64Encoder = getBase64Encoder();
    const escrowDecoder = getEscrowDecoder();
    const lockerDecoder = getLockerDecoder();

    const delegate = await getDelegate(market);
    console.log('Delegate:', delegate.toString());

    // Decode Locker account before fetching program accounts
    const {value: lockerAccountInfo} = await client.rpc.getAccountInfo(
        LOCKER.get(market)!,
        {
            encoding: "base64"
        } as Readonly<{encoding: "base64"}>).send();
    let decodedLocker: Locker | null = null;
    if (lockerAccountInfo?.data) {
        try {
            decodedLocker = lockerDecoder.decode(base64Encoder.encode(lockerAccountInfo.data[0] as string));
        } catch (e) {
            console.error('Failed to decode Locker account:', e);
            throw new Error('Failed to decode Locker account');
        }
    } else {
        throw new Error('Locker account not found');
    }

    const getProgramAccountsConfig: GetProgramAccountsConfig
        & Readonly<{ encoding: "base64", withContext: true}> = {
        filters: [
            {
                dataSize: BigInt(getEscrowSize())
            },
            {
                memcmp: {
                    offset: BigInt(129),
                    bytes: delegate as string as Base58EncodedBytes,
                    encoding: 'base58'
                },
            }
        ],
        encoding: 'base64',
        withContext: true
    };


    try {
        const {value: accounts}= await client.rpc.getProgramAccounts(
            LOCKED_VOTER_PROGRAM_ADDRESS,
            getProgramAccountsConfig,
        ).send();

        const escrows: EscrowInfo[] = [];
        const now = BigInt(Math.floor(Date.now() / 1000));

        for (const { pubkey, account } of accounts) {
            try {
                const parsedAccount = escrowDecoder.decode(base64Encoder.encode(account.data[0] as string));
                const voterPower = calculateVoterPower(decodedLocker, parsedAccount, now) ?? BigInt(0);

                escrows.push({
                    escrowAddress: pubkey,
                    owner: parsedAccount.owner,
                    escrow: parsedAccount,
                    voterPower,
                });
            } catch (error) {
                console.error('Failed to deserialize escrow account:', error);
            }
        }

        return escrows;
    } catch (error) {
        console.error('Error fetching program accounts:', error);
        throw error;
    }
};
