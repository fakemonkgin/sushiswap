import type { VercelRequest, VercelResponse } from '@vercel/node'
import { roundToNearestMinutes, sub } from 'date-fns'
import { z } from 'zod'

import { getPricesByChainId } from '../../../lib/api'
import { Currency } from '../../../lib/enums'

const schema = z.object({
  chainId: z.coerce
    .number()
    .int()
    .gte(0)
    .lte(2 ** 256),
  currency: z.nativeEnum(Currency).default(Currency.USD),
})

const handler = async (request: VercelRequest, response: VercelResponse) => {
  const { chainId, currency } = schema.parse(request.query)
  const threeDaysAgo = sub(new Date(), {days: 3})
  const dateThreshold = roundToNearestMinutes(threeDaysAgo, { nearestTo: 10 })

  const tokens = await getPricesByChainId(chainId, dateThreshold, currency)
  return response.status(200).json(tokens)
}

export default handler
