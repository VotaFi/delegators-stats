import { address, Address } from 'gill';

export type SupportedMarket = "theVault";

export const TRIBECA_VOTE_MARKET_CONFIG: Map<SupportedMarket, Address> = new Map([
    ["theVault", address("AAJ1TUeLfzyCrywCukTaehieCPe6bQtaNbNXpcMDLPeB") as Address]
]);

export const LOCKER: Map<SupportedMarket, Address> = new Map([
    ["theVault", address("FqEk173TNsqe2maPozsaZk4AvaqpV3FKynyA5s7V4aNq") as Address]
]);

export const GAUGEMEISTER: Map<SupportedMarket, Address> = new Map([
    ["theVault", address("HniSajyYDYEfdbNfW8L5Eq8W1pxt8XsYDgc6TNsx7t6x") as Address]
]);

export const GAUGE_PROGRAM_ID = address(
    "GaugesLJrnVjNNWLReiw3Q7xQhycSBRgeHGTMDUaX231"
);

export const VOTA_ADMIN = address(
    "AmbWk325Nr67A5wpoHnxh967Zf4C5fQP9KHE3eeJQYWU"
);