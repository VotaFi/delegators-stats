import { getAddressEncoder, getProgramDerivedAddress, Address, ProgramDerivedAddressBump } from 'gill';
import { VOTE_MARKET_PROGRAM_ADDRESS } from '../../clients/tribeca-vote-market/src';
import { TRIBECA_VOTE_MARKET_CONFIG, GAUGEMEISTER, GAUGE_PROGRAM_ID, SupportedMarket } from './constants';
import { getU32Encoder } from '@solana/kit';

const addressEncoder = getAddressEncoder();
const u32Encoder = getU32Encoder();

export async function getDelegate(market: SupportedMarket): Promise<Address> {
    const [delegate] = await getProgramDerivedAddress({
        programAddress: VOTE_MARKET_PROGRAM_ADDRESS,
        seeds: ['vote-delegate', addressEncoder.encode(TRIBECA_VOTE_MARKET_CONFIG.get(market)!)]
    });
    return delegate;
}

export async function getEpochGauge(gauge: Address, epoch: number): Promise<Address> {
    const epochBytes = u32Encoder.encode(epoch);

    const [epochGauge] = await getProgramDerivedAddress({
        programAddress: GAUGE_PROGRAM_ID,
        seeds: ['EpochGauge', addressEncoder.encode(gauge), epochBytes]
    });
    return epochGauge;
}

export async function getGaugeVoter(escrow: Address, market: SupportedMarket): Promise<Address> {
    const [gaugeVoter] = await getProgramDerivedAddress({
        programAddress: GAUGE_PROGRAM_ID,
        seeds: ['GaugeVoter', addressEncoder.encode(GAUGEMEISTER.get(market)!), addressEncoder.encode(escrow)]
    });
    return gaugeVoter;
}

export async function getGaugeVote(gaugeVoter: Address, gauge: Address): Promise<Address> {
    const [gaugeVote] = await getProgramDerivedAddress({
        programAddress: GAUGE_PROGRAM_ID,
        seeds: ['GaugeVote', addressEncoder.encode(gaugeVoter), addressEncoder.encode(gauge)]
    });
    return gaugeVote;
}

export async function getEpochGaugeVote(gaugeVote: Address, epoch: number): Promise<Address> {
    const epochBytes = u32Encoder.encode(epoch);

    const [epochGaugeVote] = await getProgramDerivedAddress({
        programAddress: GAUGE_PROGRAM_ID,
        seeds: ['EpochGaugeVote', addressEncoder.encode(gaugeVote), epochBytes]
    });
    return epochGaugeVote;
}

export async function getEpochGaugeVoter(gaugeVoter: Address, epoch: number): Promise<Address> {
    const epochBytes = u32Encoder.encode(epoch);

    const [epochGaugeVoter] = await getProgramDerivedAddress({
        programAddress: GAUGE_PROGRAM_ID,
        seeds: ['EpochGaugeVoter', addressEncoder.encode(gaugeVoter), epochBytes]
    });
    return epochGaugeVoter;
}

export interface VoteKeys {
    gaugeVoter: Address;
    gaugeVote: Address;
    epochGaugeVoter: Address;
    epochGaugeVote: Address;
    epochGauge: Address;
}