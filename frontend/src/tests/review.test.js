import { expect, it } from 'vitest'
import { parseReview } from '../review.js'

it.each([
  '## Timestamped Notes\n0:05: Look up',
  '## Timestamped Notes\n- **0:05:** Look up',
  '**Timestamped Notes**\n1. [0:05] — Look up',
  '### Timestamped Notes\n* `0:05` - Look up',
])('parses timestamp formatting: %s', (review) => {
  expect(parseReview(review).timeline).toEqual([{ start: 5, end: 5, text: 'Look up' }])
})
it('parses structured reviews rendered as markdown', () => {
  expect(parseReview('## Strengths\n- Clear delivery\n\n## Specific Drills\n- Practice\n\n## Timestamped Notes\n0:05-0:08: Keep eye contact')).toEqual({
    strengths: ['Clear delivery'], drills: ['Practice'],
    timeline: [{ start: 5, end: 8, text: 'Keep eye contact' }],
  })
})
