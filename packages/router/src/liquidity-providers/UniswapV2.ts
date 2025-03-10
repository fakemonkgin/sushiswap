import { keccak256, pack } from '@ethersproject/solidity'
import { uniswapV2PairAbi } from '@sushiswap/abi'
import { ChainId } from '@sushiswap/chain'
import { Token } from '@sushiswap/currency'
import { ADDITIONAL_BASES, BASES_TO_CHECK_TRADES_AGAINST } from '@sushiswap/router-config'
import { ConstantProductRPool, RToken } from '@sushiswap/tines'
import { BigNumber, ethers } from 'ethers'
import { getCreate2Address } from 'ethers/lib/utils'

import type { Limited } from '../Limited'
import { ConstantProductPoolCode } from '../pools/ConstantProductPool'
import type { PoolCode } from '../pools/PoolCode'
import { LiquidityProvider } from './LiquidityProvider'

const UNISWAP_V2_FACTORY: Record<string | number, string> = {
  [ChainId.ETHEREUM]: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
}

const UNISWAP_INIT_CODE_HASH: Record<string | number, string> = {
  [ChainId.ETHEREUM]: '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f',
}

export class UniswapProvider extends LiquidityProvider {
  poolCodes: PoolCode[]
  lastPoolCodeNumber: number

  constructor(chainDataProvider: ethers.providers.BaseProvider, chainId: ChainId, l: Limited) {
    super(chainDataProvider, chainId, l)
    this.poolCodes = []
    this.lastPoolCodeNumber = 0
  }

  getPoolProviderName(): string {
    return 'UniswapV2'
  }

  async getPools(t0: Token, t1: Token): Promise<PoolCode[]> {
    if (UNISWAP_V2_FACTORY[this.chainId] === undefined) {
      // No uniswap for this network
      return []
    }
    const tokens = this._getAllRouteTokens(t0, t1)
    const pools = await this._getAllPools(tokens)
    return pools
  }

  _getAllRouteTokens(t1: Token, t2: Token) {
    const set = new Set<Token>([
      t1,
      t2,
      ...BASES_TO_CHECK_TRADES_AGAINST[this.chainId],
      ...(ADDITIONAL_BASES[this.chainId][t1.address] || []),
      ...(ADDITIONAL_BASES[this.chainId][t2.address] || []),
    ])
    return Array.from(set)
  }

  _getPoolAddress(t1: Token, t2: Token): string {
    const [token0, token1] = t1.address.toLowerCase() < t2.address.toLowerCase() ? [t1, t2] : [t2, t1]
    return getCreate2Address(
      UNISWAP_V2_FACTORY[this.chainId],
      keccak256(['bytes'], [pack(['address', 'address'], [token0.address, token1.address])]),
      UNISWAP_INIT_CODE_HASH[this.chainId]
    )
  }

  async _getPoolData(t0: Token, t1: Token): Promise<PoolCode | undefined> {
    const [token0, token1] = t0.address.toLowerCase() < t1.address.toLowerCase() ? [t0, t1] : [t1, t0]
    const poolAddress = this._getPoolAddress(token0, token1)
    try {
      const pool = await new ethers.Contract(poolAddress, uniswapV2PairAbi, this.chainDataProvider)
      const [reserve0, reserve1]: [BigNumber, BigNumber] = await this.limited.callOnce(() => pool.getReserves())
      const rPool = new ConstantProductRPool(poolAddress, token0 as RToken, token1 as RToken, 0.003, reserve0, reserve1)
      const pc = new ConstantProductPoolCode(rPool, this.getPoolProviderName())
      this.poolCodes.push(pc)
      return pc
    } catch (e) {
      return undefined
    }
  }

  async _getAllPools(tokens: Token[]): Promise<PoolCode[]> {
    const poolData: Promise<PoolCode | undefined>[] = []
    for (let i = 0; i < tokens.length; ++i) {
      for (let j = i + 1; j < tokens.length; ++j) {
        poolData.push(this._getPoolData(tokens[i], tokens[j]))
      }
    }
    const pools = await Promise.all(poolData)
    return pools.filter((p) => p !== undefined) as PoolCode[]
  }

  startGetherData(t0: Token, t1: Token) {
    this.poolCodes = []
    this.lastPoolCodeNumber = 0
    this.getPools(t0, t1) // starting the process
  }
  poolListWereUpdated(): boolean {
    return this.lastPoolCodeNumber !== this.poolCodes.length
  }
  getCurrentPoolList(): PoolCode[] {
    this.lastPoolCodeNumber = this.poolCodes.length
    return this.poolCodes
  }
  stopGetherData() {}
}
