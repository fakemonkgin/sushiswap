import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'

import { getTokensByChainId } from '../../../lib/api'

const schema = z.object({
  chainId: z.coerce
    .number()
    .int()
    .gte(0)
    .lte(2 ** 256),
})

const handler = async (request: VercelRequest, response: VercelResponse) => {
  const { chainId } = schema.parse(request.query)
  const tokens = await getTokensByChainId(chainId)
  return response.status(200).json(tokens)
}

export default handler
